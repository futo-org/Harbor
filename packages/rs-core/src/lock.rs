use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

/// Lock acquisition that recovers from poisoning instead of panicking.
///
/// A lock is poisoned when a holder panicked. `lock().unwrap()` then panics
/// on every later acquisition, turning one fault into a permanently broken
/// core where every FFI call touching the client throws. The data behind
/// our locks is an in-memory store that stays usable after a caller's
/// panic, so keep serving it.
pub(crate) trait LockRecover<T> {
    fn lock_recover(&self) -> MutexGuard<'_, T>;
}

impl<T> LockRecover<T> for Mutex<T> {
    fn lock_recover(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub(crate) trait RwLockRecover<T> {
    fn read_recover(&self) -> RwLockReadGuard<'_, T>;
    fn write_recover(&self) -> RwLockWriteGuard<'_, T>;
}

impl<T> RwLockRecover<T> for RwLock<T> {
    fn read_recover(&self) -> RwLockReadGuard<'_, T> {
        self.read().unwrap_or_else(|e| e.into_inner())
    }
    fn write_recover(&self) -> RwLockWriteGuard<'_, T> {
        self.write().unwrap_or_else(|e| e.into_inner())
    }
}
