// Source: error-handling.md > canc/prefer-is-cancel-error > Incorrect (block 2, name string check)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function run(): void;

try {
 run();
} catch (err) {
 if ((err as Error).name === 'CancelError') { // lint: name strings are not a brand
 // no-op
 } else {
 throw err;
 }
}
