// Source: executor.md > canc/executor-cancel-wiring (strict tier) > Correct (block 2, acknowledged leak)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Stats {
 total: number;
}
declare function computeStatsNonAbortable(): Promise<Stats>;

// Acknowledged leak: the underlying API is not abortable; chain-level stop is the best available.
// eslint-disable-next-line canc/executor-cancel-wiring
const stats = new CancelablePromise<Stats>((resolve, reject) => {
 computeStatsNonAbortable().then(resolve, reject);
});
