import CancelablePromise from '@cancjs/promise';

export const task = new CancelablePromise<void>((resolve, _reject, { handleCancel }) => {
  const internalController = new AbortController();
  internalController.signal.addEventListener('abort', () => {
    // Local controller cleanup
  });
  handleCancel(() => {
    internalController.abort();
  });
  resolve();
});
