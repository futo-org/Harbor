use jni::EnvUnowned;
use jni::elements::ReleaseMode;
use jni::objects::{JClass, JByteArray};

use jni::sys::{jint, jlong};
use rs_core::platform::ffi;
use rs_core::platform::ffi::CBuffer;
use std::ffi::c_int;

fn c_pointer_to_byte_array(buf: &CBuffer) -> Option<&'static [u8]> {
    if buf.bytes.is_null() {
        return None;
    }

    unsafe { Some(std::slice::from_raw_parts(buf.bytes, buf.length as usize)) }
}

fn byte_array_to_c_pointer(bytes: &[u8]) -> CBuffer {
    let bytes_vec = bytes.to_vec();
    let heap_data = bytes_vec.into_boxed_slice();
    let heap_ptr = Box::into_raw(heap_data);

    CBuffer {
        bytes: heap_ptr as *const u8,
        length: bytes.len() as c_int,
    }
}

fn bindings_free_bytes(buf: CBuffer) {
    unsafe {
        // This is a bit hacky. Once the ptr::from_raw_parts method is stabilized, it should be used instead
        let slice = std::slice::from_raw_parts_mut(buf.bytes as *mut u8, buf.length as usize);

        let _heap_data = Box::from_raw(std::ptr::from_mut(slice));
    }
}

struct CBufferGuard {
    buf: CBuffer,
}

impl CBufferGuard {
    fn new(buf: CBuffer) -> Self {
        Self { buf }
    }

    fn as_cbuffer(&self) -> CBuffer {
        CBuffer {
            bytes: self.buf.bytes,
            length: self.buf.length,
        }
    }
}

impl Drop for CBufferGuard {
    fn drop(&mut self) {
        bindings_free_bytes(CBuffer {
            bytes: self.buf.bytes,
            length: self.buf.length,
        });
    }
}

fn ffi_call_result_bytes(result: CBuffer) -> Option<Vec<u8>> {
    let result_bytes = c_pointer_to_byte_array(&result);
    let result_vec = match result_bytes {
        Some(bytes) => Some(bytes.to_vec()),
        None => None,
    };

    ffi::free_bytes(result);

    result_vec
}

fn java_input_bytes<'caller>(
    env: &jni::Env<'caller>,
    input: JByteArray<'caller>
) -> Result<CBufferGuard, jni::errors::Error> {
    let input_els;
    unsafe {
        input_els = input.get_elements(env, ReleaseMode::NoCopyBack)?;
    }
    let input_vec = input_els.iter().map(|&b| b as u8).collect::<Vec<u8>>();
    let input_bytes = byte_array_to_c_pointer(&input_vec[..]);
    Ok(CBufferGuard::new(input_bytes))
}



#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_initialize<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let result_vec = ffi_call_result_bytes(ffi::initialize());

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_is_1initialized<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let result_vec = ffi_call_result_bytes(ffi::is_initialized());

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_ingest_1event<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    signed_event: JByteArray<'caller>
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, signed_event)?;

        let result_vec = ffi_call_result_bytes(ffi::ingest_event(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_create_1event<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    event_creation_data: JByteArray<'caller>,
    unix_ms: jlong
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, event_creation_data)?;

        let result_vec = ffi_call_result_bytes(ffi::create_event(
            input_bytes.as_cbuffer(), unix_ms as u64));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_sync_1events_1for_1system<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
    network_requests: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let system_bytes = java_input_bytes(env, system)?;
        let network_requests_bytes = java_input_bytes(env, network_requests)?;

        let result_vec = ffi_call_result_bytes(ffi::sync_events_for_system(
            system_bytes.as_cbuffer(),
            network_requests_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_get_1reference<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    pointer: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, pointer)?;

        let result_vec = ffi_call_result_bytes(ffi::get_reference(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_get_1pointer<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    event: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, event)?;

        let result_vec = ffi_call_result_bytes(ffi::get_pointer(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1explore_1feed<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
    network_requests: JByteArray<'caller>,
    feed_query: JByteArray<'caller>,
    cursor: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let system_bytes = java_input_bytes(env, system)?;
        let network_requests_bytes = java_input_bytes(env, network_requests)?;
        let feed_query_bytes = java_input_bytes(env, feed_query)?;
        let cursor_bytes = java_input_bytes(env, cursor)?;

        let result_vec = ffi_call_result_bytes(ffi::query_explore_feed(
            system_bytes.as_cbuffer(),
            network_requests_bytes.as_cbuffer(),
            feed_query_bytes.as_cbuffer(),
            cursor_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1search_1feed<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
    network_requests: JByteArray<'caller>,
    feed_query: JByteArray<'caller>,
    search_query: JByteArray<'caller>,
    cursor: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let system_bytes = java_input_bytes(env, system)?;
        let network_requests_bytes = java_input_bytes(env, network_requests)?;
        let feed_query_bytes = java_input_bytes(env, feed_query)?;
        let search_query_bytes = java_input_bytes(env, search_query)?;
        let cursor_bytes = java_input_bytes(env, cursor)?;

        let result_vec = ffi_call_result_bytes(ffi::query_search_feed(
            system_bytes.as_cbuffer(),
            network_requests_bytes.as_cbuffer(),
            feed_query_bytes.as_cbuffer(),
            search_query_bytes.as_cbuffer(),
            cursor_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1author_1feed<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    current_system: JByteArray<'caller>,
    target_system: JByteArray<'caller>,
    network_requests: JByteArray<'caller>,
    limit: jint,
    cursor: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let current_system_bytes = java_input_bytes(env, current_system)?;
        let target_system_bytes = java_input_bytes(env, target_system)?;
        let network_requests_bytes = java_input_bytes(env, network_requests)?;
        let cursor_bytes = java_input_bytes(env, cursor)?;

        let result_vec = ffi_call_result_bytes(ffi::query_author_feed(
            current_system_bytes.as_cbuffer(),
            target_system_bytes.as_cbuffer(),
            network_requests_bytes.as_cbuffer(),
            limit as u64,
            cursor_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1following_1feed<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    current_system: JByteArray<'caller>,
    limit: jint,
    cursor: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let current_system_bytes = java_input_bytes(env, current_system)?;
        let cursor_bytes = java_input_bytes(env, cursor)?;

        let result_vec = ffi_call_result_bytes(ffi::query_following_feed(
            current_system_bytes.as_cbuffer(),
            limit as u64,
            cursor_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1references_1feed<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
    network_requests: JByteArray<'caller>,
    feed_query: JByteArray<'caller>,
    reference: JByteArray<'caller>,
    cursor: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let system_bytes = java_input_bytes(env, system)?;
        let network_requests_bytes = java_input_bytes(env, network_requests)?;
        let feed_query_bytes = java_input_bytes(env, feed_query)?;
        let reference_bytes = java_input_bytes(env, reference)?;
        let cursor_bytes = java_input_bytes(env, cursor)?;

        let result_vec = ffi_call_result_bytes(ffi::query_references_feed(
            system_bytes.as_cbuffer(),
            network_requests_bytes.as_cbuffer(),
            feed_query_bytes.as_cbuffer(),
            reference_bytes.as_cbuffer(),
            cursor_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1comments_1feed<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
    network_requests: JByteArray<'caller>,
    feed_query: JByteArray<'caller>,
    cursor: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let system_bytes = java_input_bytes(env, system)?;
        let network_requests_bytes = java_input_bytes(env, network_requests)?;
        let feed_query_bytes = java_input_bytes(env, feed_query)?;
        let cursor_bytes = java_input_bytes(env, cursor)?;

        let result_vec = ffi_call_result_bytes(ffi::query_comments_feed(
            system_bytes.as_cbuffer(),
            network_requests_bytes.as_cbuffer(),
            feed_query_bytes.as_cbuffer(),
            cursor_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1likes_1feed<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    current_system: JByteArray<'caller>,
    limit: jint,
    cursor: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let current_system_bytes = java_input_bytes(env, current_system)?;
        let cursor_bytes = java_input_bytes(env, cursor)?;

        let result_vec = ffi_call_result_bytes(ffi::query_likes_feed(
            current_system_bytes.as_cbuffer(),
            limit as u64,
            cursor_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1events<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
    process: JByteArray<'caller>,
    start_clock: jint,
    end_clock: jint,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let system_bytes = java_input_bytes(env, system)?;
        let process_bytes = java_input_bytes(env, process)?;

        let result_vec = ffi_call_result_bytes(ffi::query_events(
            system_bytes.as_cbuffer(),
            process_bytes.as_cbuffer(),
            start_clock as u64,
            end_clock as u64,
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1crdt_1for_1system<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    target_system: JByteArray<'caller>,
    content_type: jint,
    current_system: JByteArray<'caller>,
    network_requests: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let target_system_bytes = java_input_bytes(env, target_system)?;
        let current_system_bytes = java_input_bytes(env, current_system)?;
        let network_requests_bytes = java_input_bytes(env, network_requests)?;

        let result_vec = ffi_call_result_bytes(ffi::query_crdt_for_system(
            target_system_bytes.as_cbuffer(),
            content_type as u64,
            current_system_bytes.as_cbuffer(),
            network_requests_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1opinion<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    current_system: JByteArray<'caller>,
    target_pointer: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let current_system_bytes = java_input_bytes(env, current_system)?;
        let target_pointer_bytes = java_input_bytes(env, target_pointer)?;

        let result_vec = ffi_call_result_bytes(ffi::query_opinion(
            current_system_bytes.as_cbuffer(),
            target_pointer_bytes.as_cbuffer(),
        ));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1event_1is_1deleted<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    pointer: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, pointer)?;

        let result_vec = ffi_call_result_bytes(ffi::query_event_is_deleted(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1follows_1for_1system<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, system)?;

        let result_vec = ffi_call_result_bytes(ffi::query_follows_for_system(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1blocks_1for_1system<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, system)?;

        let result_vec = ffi_call_result_bytes(ffi::query_blocks_for_system(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1servers_1for_1system<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, system)?;

        let result_vec = ffi_call_result_bytes(ffi::query_servers_for_system(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1authorities_1for_1system<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, system)?;

        let result_vec = ffi_call_result_bytes(ffi::query_authorities_for_system(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1topics_1for_1system<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    system: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, system)?;

        let result_vec = ffi_call_result_bytes(ffi::query_topics_for_system(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_tech_futo_libPolycentric_services_FFIService_query_1feed_1with_1cursor<'caller>(
    mut unowned_env: EnvUnowned<'caller>,
    _class: JClass<'caller>,
    feed_query: JByteArray<'caller>,
)
    -> JByteArray<'caller>
{
    let outcome = unowned_env.with_env(|env| -> Result<_, jni::errors::Error> {
        let input_bytes = java_input_bytes(env, feed_query)?;

        let result_vec = ffi_call_result_bytes(ffi::query_feed_with_cursor(input_bytes.as_cbuffer()));

        let bytes: Vec<u8> = match result_vec {
            Some(vec) => vec,
            None => return Err(jni::errors::Error::NullPtr("FFI boundary returned a bad pointer".into())),
        };
        env.byte_array_from_slice(&bytes)
    });

    outcome.resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}
