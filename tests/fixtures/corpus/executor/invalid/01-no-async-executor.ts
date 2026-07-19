// Source: executor.md > canc/no-async-executor > Incorrect (block 1)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function fetchTitlesRaw(signal: AbortSignal): Promise<{ title: string }[]>;

const cancPromise = new CancelablePromise<string[]>(async (resolve, reject, handleCancel) => { // lint: async executor
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 try {
 const data = await fetchTitlesRaw(controller.signal);
 resolve(data.map((item) => item.title));
 } catch (err) {
 reject(err);
 }
});
