use std::collections::HashMap;
use std::collections::HashSet;

use crate::query::{EventRangeQuery, ProcessHeadsQuery, QueryEngine};
use polycentric_common::error::CoreError;
use polycentric_common::models::internal::{EventKey, ProcessId, SystemKey};
use polycentric_common::models::protos::{
    Event, Events, Process, PublicKey, Range, RangesForProcess, RangesForSystem,
};
use polycentric_common::models::traits::Serializable;

pub struct SyncRequests {
    pub ranges_to_get: RangesForSystem,
    pub events_to_post: Events,
}

/// Prepares the protobuf objects which need to be send to the server to enable synchronization
///
/// # Arguments
/// * `engine` - The query engine which contains the client's events
/// * `system_protobuf` - The system which should have it's events synchronized
/// * `head_protobuf` - The protobuf object result of a query to the GET /head endpoint
/// * `ranges_protobuf` - The protobuf object result of a query to the POST /events endpoint
pub fn prepare_sync_requests(
    engine: &QueryEngine,
    system_protobuf: &PublicKey,
    head_protobuf: &Events,
    ranges_protobuf: &RangesForSystem,
) -> std::result::Result<SyncRequests, CoreError> {
    let server_logical_clocks = get_server_head_logical_clocks(head_protobuf)?;
    let client_logical_clocks = get_client_head_logical_clocks(engine, system_protobuf)?;

    let post_query = sync_events_from_client(
        system_protobuf,
        &client_logical_clocks,
        engine,
        ranges_protobuf,
    )?;
    let get_query = sync_events_from_server(system_protobuf, &server_logical_clocks, engine);

    Ok(SyncRequests {
        ranges_to_get: get_query,
        events_to_post: post_query,
    })
}

fn get_server_head_logical_clocks(
    events: &Events,
) -> std::result::Result<HashMap<Vec<u8>, u64>, CoreError> {
    let mut server_logical_clocks: HashMap<Vec<u8>, u64> = HashMap::new();
    for evt in events.events.iter() {
        let event_protobuf = Event::from_bytes(&evt.event).map_err(|e| {
            CoreError::DeserializationError(format!("Unable to deserialize signed event: {:?}", e))
        })?;

        let process = match event_protobuf.process {
            Some(process) => Some(process.process),
            None => None,
        };

        if let Some(proc) = process {
            server_logical_clocks.insert(proc, event_protobuf.logical_clock);
        }
    }

    Ok(server_logical_clocks)
}

fn get_client_head_logical_clocks(
    engine: &QueryEngine,
    system_protobuf: &PublicKey,
) -> std::result::Result<HashMap<Vec<u8>, u64>, CoreError> {
    let client_heads = engine.query_heads(ProcessHeadsQuery {
        system: SystemKey {
            key_type: system_protobuf.key_type,
            key: system_protobuf.key.clone(),
        },
    })?;

    let mut client_logical_clocks: HashMap<Vec<u8>, u64> = HashMap::new();

    for (proc, evt) in client_heads.heads.iter() {
        let event_protobuf = Event::from_bytes(&evt.event).map_err(|e| {
            CoreError::DeserializationError(format!("Unable to deserialize signed event: {:?}", e))
        })?;

        client_logical_clocks.insert(proc.process.clone(), event_protobuf.logical_clock);
    }

    Ok(client_logical_clocks)
}

fn sync_events_from_server(
    system_protobuf: &PublicKey,
    max_logical_clocks: &HashMap<Vec<u8>, u64>,
    engine: &QueryEngine,
) -> RangesForSystem {
    let mut get_query = RangesForSystem {
        ranges_for_processes: vec![],
    };

    for (proc, clock) in max_logical_clocks {
        let mut ranges_for_process = RangesForProcess {
            process: Some(Process {
                process: (*proc).clone(),
            }),
            ranges: vec![],
        };

        let mut previous_event_existed = true;
        let mut range_start = 1;

        for i in 1..=*clock {
            // TODO maybe implement a "does event exist" method instead of doing this
            let stored_event = engine.event_store.get_event_raw(&EventKey {
                system_key_type: system_protobuf.key_type,
                system_key: system_protobuf.key.clone(),
                process: proc.clone(),
                logical_clock: i,
            });

            if stored_event.is_none() && previous_event_existed {
                range_start = i;
                previous_event_existed = false;
            }

            if stored_event.is_some() && !previous_event_existed {
                ranges_for_process.ranges.push(Range {
                    low: range_start,
                    high: i - 1,
                });
                previous_event_existed = true;
            }
        }

        // If the very last event we checked didn't exist, get everything from after the last event we do have
        if !previous_event_existed {
            ranges_for_process.ranges.push(Range {
                low: range_start,
                high: *clock,
            });
        }

        get_query.ranges_for_processes.push(ranges_for_process);
    }

    get_query
}

fn server_existing_logical_clocks(ranges: &RangesForSystem) -> HashMap<Vec<u8>, HashSet<u64>> {
    let mut existing_logical_clocks: HashMap<Vec<u8>, HashSet<u64>> = HashMap::new();

    for ranges_for_proc in &ranges.ranges_for_processes {
        let mut existing_logical_clocks_for_proc: HashSet<u64> = HashSet::new();

        let process = match &ranges_for_proc.process {
            Some(proc) => proc,
            None => {
                continue;
            }
        };

        for range in &ranges_for_proc.ranges {
            for i in range.low..=range.high {
                existing_logical_clocks_for_proc.insert(i);
            }
        }

        existing_logical_clocks.insert(process.process.clone(), existing_logical_clocks_for_proc);
    }

    existing_logical_clocks
}

fn sync_events_from_client(
    system_protobuf: &PublicKey,
    max_logical_clocks: &HashMap<Vec<u8>, u64>,
    engine: &QueryEngine,
    server_ranges: &RangesForSystem,
) -> std::result::Result<Events, CoreError> {
    let existing_logical_clocks = server_existing_logical_clocks(server_ranges);

    let mut post_query = Events { events: vec![] };

    for (proc, clock) in max_logical_clocks {
        let existing_clocks_for_proc = match existing_logical_clocks.get(proc) {
            Some(set) => set,
            None => &HashSet::new(),
        };

        let mut previous_event_existed = true;
        let mut range_start = 1;

        for i in 1..=*clock {
            if !existing_clocks_for_proc.contains(&i) && previous_event_existed {
                range_start = i;
                previous_event_existed = false;
            }

            if existing_clocks_for_proc.contains(&i) && !previous_event_existed {
                post_query.events.append(
                    &mut engine
                        .query_events(EventRangeQuery {
                            system: SystemKey {
                                key_type: system_protobuf.key_type,
                                key: system_protobuf.key.clone(),
                            },
                            process: ProcessId {
                                process: proc.clone(),
                            },
                            start_clock: range_start,
                            end_clock: i - 1,
                        })?
                        .events,
                );

                previous_event_existed = true;
            }
        }

        // If the very last event we checked didn't exist, get everything from after the last event we do have
        if !previous_event_existed {
            post_query.events.append(
                &mut engine
                    .query_events(EventRangeQuery {
                        system: SystemKey {
                            key_type: system_protobuf.key_type,
                            key: system_protobuf.key.clone(),
                        },
                        process: ProcessId {
                            process: proc.clone(),
                        },
                        start_clock: range_start,
                        end_clock: *clock,
                    })?
                    .events,
            );
        }
    }

    Ok(post_query)
}

/// Returns the query needed to fetch a particular event, or none if the event already exists in the query engine
pub fn fetch_event_request(event_key: &EventKey) -> RangesForSystem {
    RangesForSystem {
        ranges_for_processes: vec![RangesForProcess {
            process: Some(Process {
                process: event_key.process.clone(),
            }),
            ranges: vec![Range {
                low: event_key.logical_clock,
                high: event_key.logical_clock,
            }],
        }],
    }
}
