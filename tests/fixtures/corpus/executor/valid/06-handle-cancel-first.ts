// Source: executor.md > canc/handle-cancel-first > Correct
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Report {
 id: string;
}
interface Stream {
 destroy(): void;
}
declare function openStream(signal: AbortSignal): Promise<Stream>;
declare function readAll(stream: Stream, signal: AbortSignal): Promise<Report>;

const download = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 openStream(controller.signal)
 .then((stream) => readAll(stream, controller.signal))
 .then(resolve, reject);
});
