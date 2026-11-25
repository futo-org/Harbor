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

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::AssertUnwindSafe;

    #[test]
    fn lock_recover_serves_data_from_a_poisoned_mutex() {
        let m = Mutex::new(vec![1u32]);

        let _ = std::panic::catch_unwind(AssertUnwindSafe(|| {
            let _guard = m.lock().unwrap();
            panic!("poison while held");
        }));

        m.lock_recover().push(2);
        assert_eq!(&*m.lock_recover(), &[1, 2]);
    }

    #[test]
    fn rwlock_recover_serves_data_from_a_poisoned_rwlock() {
        let rw = RwLock::new(41u32);

        let _ = std::panic::catch_unwind(AssertUnwindSafe(|| {
            let _guard = rw.write().unwrap();
            panic!("poison while held");
        }));

        *rw.write_recover() += 1;
        assert_eq!(*rw.read_recover(), 42);
    }
}
