// Source: flow.md > canc/no-cancelability-erasure > Correct (block 4, explicit adoption forms)
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
declare function trackPromise(p: Promise<unknown>): void;

// Explicit adoption: sanctioned downgrade forms. Each states the intent in the code itself,
// so the rule accepts them without a disable comment.
trackPromise(Promise.resolve(loadDashboard()));
trackPromise(new Promise((resolve) => { resolve(loadDashboard()); }));
trackPromise(loadDashboard() as Promise<Dashboard>);
trackPromise(loadDashboard() as unknown as Promise<Dashboard>); // double assertion, still explicit
trackPromise(<Promise<Dashboard>>loadDashboard()); // angle-bracket cast, same as `as` (allowAsCast)
