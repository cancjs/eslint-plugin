// Source: executor.md > canc/handle-cancel-first > Incorrect
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
declare function openStream(): Promise<Stream>;
declare function readAll(stream: Stream): Promise<Report>;

const download = new CancelablePromise<Report>((resolve, reject, handleCancel) => {
 openStream().then((stream) => {
 handleCancel(() => stream.destroy()); // lint: registered after an async gap
 readAll(stream).then(resolve, reject);
 }, reject);
});
