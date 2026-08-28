use std::process::exit;
use std::time::Instant;
use std::{env, panic};

use perf_tests::{
    Client, current_timestamp, optional_random_string, random_string,
    random_strings,
};
use polycentric_common::models::protos_v2::{
    EventKey, Post, PostReply, ProfileUpdate,
};
use tokio::task::JoinSet;

const MAX_EVENTS_PER_REQUEST: usize = 100;

#[tokio::main]
async fn main() {
    let mut args = env::args();
    args.next(); // Binary name.
    let Some(address) = args.next() else {
        eprintln!("Missing address argument");
        exit(1);
    };

    if args.len() == 0 {
        eprintln!("No events to generate.");
        exit(1);
    }

    let mut amount = 100;
    let mut clients = 1;
    let mut next = 0; // 1 next is amount, 2 next is clients.
    let to_generate = args
        .filter_map(|arg| {
            match arg.as_str() {
                _ if next == 1 => {
                    amount = arg.parse().expect("invalid amount");
                    next = 0;
                }
                _ if next == 2 => {
                    clients = arg.parse().expect("invalid amount of clients");
                    next = 0;
                }
                "--amount" => next = 1,
                "--clients" => next = 2,
                "post" => return Some(EventKind::Post),
                "delete" => return Some(EventKind::Delete),
                "profile" | "profile_update" | "profile-update" => {
                    return Some(EventKind::ProfileUpdate);
                }
                arg => panic!("unexpect data to generate '{arg}'"),
            }
            None
        })
        .collect::<Vec<_>>();

    let start = Instant::now();
    println!("Connecting to {address}");
    let mut set = JoinSet::new();
    for kind in to_generate {
        println!(
            "Generating {amount} {kind:?} events using {clients} clients..."
        );
        let amount_per = amount / clients;
        for _ in 0..clients {
            set.spawn(gen_data(address.clone(), kind, amount_per));
        }
    }

    while let Some(res) = set.join_next().await {
        match res {
            Ok(()) => {}
            Err(err) if err.is_panic() => {
                panic::resume_unwind(err.into_panic())
            }
            Err(err) => panic!("Unexpected error: {err}"),
        }
    }

    println!("Generated all events in {:?}", start.elapsed());
}

/// Matches ContentBody variants.
#[derive(Copy, Clone, Debug)]
enum EventKind {
    Post,
    Delete,
    /*
    Follow,
    Block,
    Reaction,
    AttributedToReaction,
    */
    ProfileUpdate,
    /*
    Identity,
    Repost,
    Report,
    Labels,
    VerificationClaim,
    VerificationVerify,
    VerificationTarget,
    */
}

async fn gen_data(address: String, kind: EventKind, amount: usize) {
    let client = Client::new(address).await;
    match kind {
        EventKind::Post => gen_post(client, amount).await,
        EventKind::Delete => gen_delete(client, amount).await,
        EventKind::ProfileUpdate => gen_profile_update(client, amount).await,
    }
}

async fn gen_post(mut client: Client, amount: usize) {
    let mut last: Option<EventKey> = None;
    for _ in 0..amount {
        client.post(
            Post {
                text: random_string(10, 1000),
                reply: if let Some(last) = last.as_ref()
                    && rand::random()
                {
                    Some(PostReply {
                        root: Some(last.clone()),
                        parent: Some(last.clone()),
                    })
                } else {
                    None
                },
                images: Vec::new(), //Vec<ImageSet>,
                quote: if let Some(last) = last.as_ref()
                    && rand::random()
                {
                    Some(last.clone())
                } else {
                    None
                },
                links: Vec::new(), // Vec<Link>,
                labels: random_strings(
                    /* amount. */ 0, 10, /* label length*/ 3, 30,
                ),
                attributed_to: Vec::new(), // Vec<AttributedTo>,
            },
            current_timestamp(),
        );
        last = Some(client.get_last_event_key());

        if client.pending().len() > MAX_EVENTS_PER_REQUEST {
            client.submit_events().await
        }
    }
    client.submit_events().await
}

async fn gen_delete(mut client: Client, amount: usize) {
    for _ in 0..amount {
        client.post(
            Post {
                text: random_string(10, 1000),
                reply: None,
                images: Vec::new(),
                quote: None,
                links: Vec::new(),
                labels: Vec::new(),
                attributed_to: Vec::new(),
            },
            current_timestamp(),
        );
        let event_key = client.get_last_event_key();
        client.delete_key(event_key, current_timestamp());

        if client.pending().len() > MAX_EVENTS_PER_REQUEST {
            client.submit_events().await
        }
    }
    client.submit_events().await
}

async fn gen_profile_update(mut client: Client, amount: usize) {
    for _ in 0..amount {
        client.profile_update(
            ProfileUpdate {
                name: optional_random_string(5, 100),
                avatar: None, // Option<ImageSet>,
                banner: None, // Option<ImageSet>,
                description: optional_random_string(10, 500),
                alias: optional_random_string(3, 20),
            },
            current_timestamp(),
        );

        if client.pending().len() > MAX_EVENTS_PER_REQUEST {
            client.submit_events().await
        }
    }
    client.submit_events().await
}
