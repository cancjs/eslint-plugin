// Source: executor.md > canc/no-transform-in-executor > Incorrect
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

const titles = new CancelablePromise<string[]>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 fetchTitlesRaw(controller.signal).then(
 (data) => resolve(data.map((item) => item.title)), // lint: transformation belongs to the chain
 reject,
 );
});
