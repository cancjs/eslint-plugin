// Source: executor.md > canc/no-multistep-executor > Correct (block 1, split functions)
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

function reserveStockCancelable(): CancelablePromise<void> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 reserveStock(controller.signal).then(resolve, reject);
 });
}

function chargeCardCancelable(): CancelablePromise<void> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 chargeCard(controller.signal).then(resolve, reject);
 });
}

const checkout = reserveStockCancelable().then(() => chargeCardCancelable());
