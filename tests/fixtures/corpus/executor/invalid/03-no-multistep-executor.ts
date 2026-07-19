// Source: executor.md > canc/no-multistep-executor > Incorrect (block 1)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function reserveStock(signal: AbortSignal): Promise<void>;
declare function chargeCard(signal: AbortSignal): Promise<void>;

const checkout = new CancelablePromise<void>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 reserveStock(controller.signal) // lint: second operation started in the same executor below
 .then(() => chargeCard(controller.signal))
 .then(() => resolve(), reject);
});
