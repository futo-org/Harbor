//! A SQLite VFS over Node's synchronous `fs` API, for running the wasm
//! build in Node with an ordinary database file.
//!
//! The wasm module can't import Node modules, so the host puts the `fs`
//! functions on `globalThis.__polycentricNodeFs` before opening a client
//! (js-core's Node entry point does this).

use std::cell::RefCell;
use std::collections::HashMap;

use js_sys::{Function, Object, Reflect, Uint8Array};
use sqlite_wasm_rs::utils::{
    OsCallback, SQLiteIoMethods, SQLiteVfs, SQLiteVfsFile, VfsError, VfsFile, VfsResult, VfsStore,
    register_vfs,
};
use wasm_bindgen::{JsCast, JsValue};

use crate::sdk::error::{SdkError, SdkResult};

pub const VFS_NAME: &str = "polycentric-nodefs";
const GLOBAL: &str = "__polycentricNodeFs";

const SQLITE_IOERR: i32 = sqlite_wasm_rs::utils::ffi::SQLITE_IOERR;
const SQLITE_IOERR_DELETE: i32 = sqlite_wasm_rs::utils::ffi::SQLITE_IOERR_DELETE;

/// The host's `fs` module, if it registered one.
fn node_fs() -> Option<Object> {
    let fs = Reflect::get(&js_sys::global(), &GLOBAL.into()).ok()?;
    // A module namespace has no prototype, so check shape, not class.
    fs.is_object().then(|| fs.unchecked_into::<Object>())
}

fn call(name: &str, args: &[JsValue]) -> VfsResult<JsValue> {
    let fail = |e: JsValue| VfsError::new(SQLITE_IOERR, format!("fs.{name}: {e:?}"));
    let fs = node_fs().ok_or_else(|| VfsError::new(SQLITE_IOERR, "no Node fs".into()))?;
    let f: Function = Reflect::get(&fs, &name.into())
        .map_err(fail)?
        .dyn_into()
        .map_err(|_| VfsError::new(SQLITE_IOERR, format!("fs.{name} is missing")))?;
    let args: js_sys::Array = args.iter().collect();
    f.apply(&fs, &args).map_err(fail)
}

fn number(value: JsValue) -> VfsResult<f64> {
    value
        .as_f64()
        .ok_or_else(|| VfsError::new(SQLITE_IOERR, "expected a number".into()))
}

pub struct NodeFile {
    fd: f64,
}

impl NodeFile {
    fn open(path: &str) -> VfsResult<Self> {
        let exists = call("existsSync", &[path.into()])?
            .as_bool()
            .unwrap_or(false);
        let mode = if exists { "r+" } else { "w+" };
        Ok(Self {
            fd: number(call("openSync", &[path.into(), mode.into()])?)?,
        })
    }

    fn close(&self) {
        let _ = call("closeSync", &[self.fd.into()]);
    }
}

impl VfsFile for NodeFile {
    fn read(&self, buf: &mut [u8], offset: usize) -> VfsResult<bool> {
        let view = Uint8Array::new_with_length(buf.len() as u32);
        let read = number(call(
            "readSync",
            &[
                self.fd.into(),
                view.clone().into(),
                0.into(),
                (buf.len() as f64).into(),
                (offset as f64).into(),
            ],
        )?)? as usize;
        view.subarray(0, read as u32).copy_to(&mut buf[..read]);
        if read < buf.len() {
            // SQLite expects the rest zeroed on a short read.
            buf[read..].fill(0);
            return Ok(false);
        }
        Ok(true)
    }

    fn write(&mut self, buf: &[u8], offset: usize) -> VfsResult<()> {
        let view = Uint8Array::from(buf);
        call(
            "writeSync",
            &[
                self.fd.into(),
                view.into(),
                0.into(),
                (buf.len() as f64).into(),
                (offset as f64).into(),
            ],
        )?;
        Ok(())
    }

    fn truncate(&mut self, size: usize) -> VfsResult<()> {
        call("ftruncateSync", &[self.fd.into(), (size as f64).into()])?;
        Ok(())
    }

    fn flush(&mut self) -> VfsResult<()> {
        call("fsyncSync", &[self.fd.into()])?;
        Ok(())
    }

    fn size(&self) -> VfsResult<usize> {
        let stat = call("fstatSync", &[self.fd.into()])?;
        let size = Reflect::get(&stat, &"size".into())
            .map_err(|e| VfsError::new(SQLITE_IOERR, format!("{e:?}")))?;
        Ok(number(size)? as usize)
    }
}

/// Open files by name. SQLite runs single-threaded here.
type AppData = RefCell<HashMap<String, NodeFile>>;

struct NodeStore;

impl NodeStore {
    /// Open `name` if it isn't already, then run `f` on it.
    fn with<R>(
        vfs_file: &SQLiteVfsFile,
        f: impl FnOnce(&mut NodeFile) -> VfsResult<R>,
    ) -> VfsResult<R> {
        let name = unsafe { vfs_file.name() }.to_string();
        let app_data = unsafe { Self::app_data(vfs_file.vfs) };
        let mut files = app_data.borrow_mut();
        if !files.contains_key(&name) {
            files.insert(name.clone(), NodeFile::open(&name)?);
        }
        match files.get_mut(&name) {
            Some(file) => f(file),
            None => Err(VfsError::new(SQLITE_IOERR, format!("{name} not open"))),
        }
    }
}

impl VfsStore<NodeFile, AppData> for NodeStore {
    fn add_file(
        vfs: *mut sqlite_wasm_rs::utils::ffi::sqlite3_vfs,
        file: &str,
        _flags: i32,
    ) -> VfsResult<()> {
        let app_data = unsafe { Self::app_data(vfs) };
        let opened = NodeFile::open(file)?;
        if let Some(old) = app_data.borrow_mut().insert(file.to_string(), opened) {
            old.close();
        }
        Ok(())
    }

    fn contains_file(
        vfs: *mut sqlite_wasm_rs::utils::ffi::sqlite3_vfs,
        file: &str,
    ) -> VfsResult<bool> {
        let app_data = unsafe { Self::app_data(vfs) };
        if app_data.borrow().contains_key(file) {
            return Ok(true);
        }
        Ok(call("existsSync", &[file.into()])?
            .as_bool()
            .unwrap_or(false))
    }

    fn delete_file(vfs: *mut sqlite_wasm_rs::utils::ffi::sqlite3_vfs, file: &str) -> VfsResult<()> {
        let app_data = unsafe { Self::app_data(vfs) };
        if let Some(open) = app_data.borrow_mut().remove(file) {
            open.close();
        }
        call("unlinkSync", &[file.into()])
            .map_err(|e| VfsError::new(SQLITE_IOERR_DELETE, format!("{e:?}")))?;
        Ok(())
    }

    fn with_file<F: Fn(&NodeFile) -> VfsResult<i32>>(
        vfs_file: &SQLiteVfsFile,
        f: F,
    ) -> VfsResult<i32> {
        Self::with(vfs_file, |file| f(file))
    }

    fn with_file_mut<F: Fn(&mut NodeFile) -> VfsResult<i32>>(
        vfs_file: &SQLiteVfsFile,
        f: F,
    ) -> VfsResult<i32> {
        Self::with(vfs_file, f)
    }
}

struct NodeIoMethods;

impl SQLiteIoMethods for NodeIoMethods {
    type File = NodeFile;
    type AppData = AppData;
    type Store = NodeStore;

    const VERSION: ::core::ffi::c_int = 1;
}

struct NodeVfs;

impl SQLiteVfs<NodeIoMethods> for NodeVfs {
    const VERSION: ::core::ffi::c_int = 1;

    fn sleep(dur: std::time::Duration) {
        sqlite_wasm_rs::WasmOsCallback::sleep(dur);
    }

    fn random(buf: &mut [u8]) {
        sqlite_wasm_rs::WasmOsCallback::random(buf);
    }

    fn epoch_timestamp_in_ms() -> i64 {
        sqlite_wasm_rs::WasmOsCallback::epoch_timestamp_in_ms()
    }
}

/// Whether the host registered Node's `fs`.
pub fn available() -> bool {
    node_fs().is_some()
}

/// Register the VFS with SQLite. Idempotent.
pub fn install() -> SdkResult<()> {
    static INSTALLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if INSTALLED.swap(true, std::sync::atomic::Ordering::AcqRel) {
        return Ok(());
    }
    register_vfs::<NodeIoMethods, NodeVfs>(VFS_NAME, RefCell::new(HashMap::new()), false).map_err(
        |e| {
            INSTALLED.store(false, std::sync::atomic::Ordering::Release);
            SdkError::Storage(format!("could not register the Node VFS: {e:?}"))
        },
    )?;
    Ok(())
}

/// Make `dir` and its parents.
pub fn create_dir_all(dir: &str) -> SdkResult<()> {
    let options = Object::new();
    let _ = Reflect::set(&options, &"recursive".into(), &true.into());
    call("mkdirSync", &[dir.into(), options.into()])
        .map(|_| ())
        .map_err(|e| SdkError::Storage(format!("{e:?}")))
}
