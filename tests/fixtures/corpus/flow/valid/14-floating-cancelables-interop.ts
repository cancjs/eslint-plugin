// Source: flow.md > Floating cancelables (interop guidance, not an own rule)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

declare const query: string;
declare function runSearch(query: string): CancelablePromise<unknown>;
declare const searchPromise: CancelablePromise<unknown>;

async function demo() {
 void runSearch(query); // would be reported by no-floating-promises if not discarded, correctly

 void searchPromise.cancel(); // sanctioned fire-and-forget cancel
 await searchPromise.cancel(); // when cleanup completion matters
}
