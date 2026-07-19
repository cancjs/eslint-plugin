// Source: executor.md > canc/no-async-executor > Correct (block 1)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface RawTitle {
 title: string;
}
declare function fetchTitlesRaw(signal: AbortSignal): Promise<RawTitle[]>;

const cancPromise = new CancelablePromise<RawTitle[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchTitlesRaw(controller.signal).then(resolve, reject);
}).then((data) => data.map((item) => item.title));
