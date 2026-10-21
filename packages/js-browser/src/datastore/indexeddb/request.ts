/**
 * Wraps an IDBRequest in a promise
 */
export function requestAsPromise<T>(
  request: IDBRequest<T>,
  options?: { preventAbort?: boolean },
): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => {
      if (options?.preventAbort) {
        event.preventDefault();
        event.stopPropagation();
      }
      reject(request.error);
    };
  });
}
