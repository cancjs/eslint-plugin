// Source: flow.md > canc/no-await-cancelable-in-async > Correct (block 3, explicit adoption)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Report {
 id: string;
}
declare function buildReportCancelable(): CancelablePromise<Report>;

// Explicit adoption also satisfies this rule (rarely what you want, but visible and deliberate).
async function bridgeToLegacyCode(): Promise<Report> {
 return await (buildReportCancelable() as Promise<Report>);
}
