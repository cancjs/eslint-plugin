// Source: flow.md > canc/no-cancelability-erasure > Correct (block 1, cancel handle retained)
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
declare function onViewTeardown(cb: () => void): void;

const dashboard = loadDashboard();
trackPromise(dashboard);
onViewTeardown(() => void dashboard.cancel()); // cancel handle retained before the handoff
