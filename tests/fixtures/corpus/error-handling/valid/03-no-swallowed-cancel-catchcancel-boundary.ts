// Source: error-handling.md > canc/no-swallowed-cancel > Correct (block 3, boundary with reason)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Product {
 id: string;
}
declare const catalogSearch: CancelablePromise<Product[]>;
declare function render(results: Product[]): void;
declare function showStatus(msg: string): void;

async function run() {
 // Boundary form with access to the cancel reason.
 const outcome = await catchCancel(catalogSearch);
 if (isCancelError(outcome)) {
 showStatus('Search canceled');
 } else {
 render(outcome);
 }
}
