// Source: error-handling.md > canc/no-swallowed-cancel > Correct (block 1, mid-flow rethrow)
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
declare function showErrorToast(err: unknown): void;

const runSearch = cancAsync(function* () {
 try {
 const results = yield* cancAwait(catalogSearch);
 render(results);
 } catch (err) {
 if (isCancelError(err)) {
 throw err; // mid-flow: let cancellation keep propagating
 }
 showErrorToast(err);
 }
});
