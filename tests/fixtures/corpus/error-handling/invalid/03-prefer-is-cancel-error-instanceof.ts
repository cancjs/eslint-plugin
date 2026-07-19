// Source: error-handling.md > canc/prefer-is-cancel-error > Incorrect (block 1, instanceof)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare class CancelError extends Error {}
declare function run(): void;

try {
 run();
} catch (err) {
 if (err instanceof CancelError) { // lint: identity check breaks across package copies
 // no-op
 } else {
 throw err;
 }
}
