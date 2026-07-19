// Source: executor.md > canc/no-multistep-executor > Incorrect (block 2, async IIFE variant)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function stepOne(signal: AbortSignal): Promise<void>;
declare function stepTwo(signal: AbortSignal): Promise<void>;

// Multi-step workflow smuggled in through an async IIFE: trips both canc/no-async-executor
// (async wrapper) and canc/no-multistep-executor (two operations in one executor).
const checkout = new CancelablePromise<void>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 (async () => {
 await stepOne(controller.signal); // lint: first operation
 await stepTwo(controller.signal); // lint: second operation in the same executor
 resolve();
 })().catch(reject);
});
