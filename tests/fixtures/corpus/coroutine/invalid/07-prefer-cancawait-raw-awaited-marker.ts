// Source: coroutine.md > canc/prefer-cancawait > Incorrect (block 2, raw awaited marker in iter body)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface Page {
 items: unknown[];
}
declare function fetchPageCancelable(): CancelablePromise<Page>;

const stream = cancIterAsync(function* () {
 const page = yield awaited(fetchPageCancelable()); // lint: untyped raw marker, prefer cancIterAwait
 yield page.items;
});
