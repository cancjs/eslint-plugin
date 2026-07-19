// Source: error-handling.md > canc/prefer-is-cancel-error > Incorrect (block 3, AbortError wrong layer)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function run(): void;

// Awaiting a canc promise constructed with { signal }: the rejection is a CancelError,
// the DOMException is only its cause. This check can never match.
try {
 run();
} catch (err) {
 if (err instanceof DOMException && err.name === 'AbortError') { // lint: wrong layer
 // no-op
 } else {
 throw err;
 }
}
