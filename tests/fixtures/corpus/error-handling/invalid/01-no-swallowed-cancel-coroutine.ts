// Source: error-handling.md > canc/no-swallowed-cancel > Incorrect (block 1, coroutine form)
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

// Coroutine form: the catch sees CancelError but treats it like any failure.
// (Written as a coroutine so awaiting the cancelable is itself correct; a plain
// `await catalogSearch` in an async function would separately trip canc/no-await-cancelable-in-async.)
const runSearch = cancAsync(function* () {
 try {
 const results = yield* cancAwait(catalogSearch); // CancelablePromise<Product[]>
 render(results);
 } catch (err) {
 showErrorToast(err); // lint: user-initiated cancel produces an error toast
 }
});
