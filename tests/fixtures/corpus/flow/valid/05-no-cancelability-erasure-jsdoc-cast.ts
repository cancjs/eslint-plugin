// Source: flow.md > canc/no-cancelability-erasure > Correct (block 5, JSDoc cast in checkJs)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Dashboard {
 id: string;
}
declare function loadDashboard(): CancelablePromise<Dashboard>;
declare function trackPromise(p: Promise<Dashboard>): void;

// JS file with type info (checkJs): a JSDoc cast is the `as` form and is sanctioned like it.
// Reproduced here in a .ts file for corpus uniformity; the JSDoc cast syntax parses the same way.
const adopted = /** @type {Promise<Dashboard>} */ (loadDashboard());
trackPromise(adopted);
