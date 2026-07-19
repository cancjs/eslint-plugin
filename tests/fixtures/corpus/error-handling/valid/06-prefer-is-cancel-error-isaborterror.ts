// Source: error-handling.md > canc/prefer-is-cancel-error > Correct (block 3, raw AbortSignal context)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare function legacyFetch(url: string, opts: { signal: AbortSignal }): Promise<Response>;
declare const signal: AbortSignal;
declare const url: string;

// Raw fetch/AbortSignal context (no canc wrapper in between): isAbortError is the right helper.
legacyFetch(url, { signal }).catch((err) => {
 if (isAbortError(err)) {
 return;
 }
 throw err;
});
