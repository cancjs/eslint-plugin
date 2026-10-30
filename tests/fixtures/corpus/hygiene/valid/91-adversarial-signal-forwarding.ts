import CancelablePromise from '@cancjs/promise';

declare function requestData(url: string, signal: AbortSignal): Promise<string>;

export const fetchTask = new CancelablePromise<string>((resolve, reject, ctx) => {
  ctx.handleCancel(() => {});
  requestData('/api/resource', ctx.signal).then(resolve, reject);
});
