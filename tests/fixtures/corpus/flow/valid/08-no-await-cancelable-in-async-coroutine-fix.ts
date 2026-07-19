// Source: flow.md > canc/no-await-cancelable-in-async > Correct (block 1, coroutine conversion)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface SearchResult {
 id: string;
}
interface Details {
 id: string;
}
declare const query: string;
declare function searchCancelable(query: string): CancelablePromise<SearchResult[]>;
declare function fetchDetailsCancelable(id: string): CancelablePromise<Details>;
declare function legacyAnalytics(): Promise<void>;
declare function render(results: SearchResult[], details: Details, legacy: void): void;

const refreshView = cancAsync(function* () {
 const results = yield* cancAwait(searchCancelable(query));
 const details = yield* cancAwait(fetchDetailsCancelable(results[0].id));
 // Plain-promise step stays chain-cancelable only (see canc/no-cancellation-gap).
 // eslint-disable-next-line canc/no-cancellation-gap
 const legacy = yield* cancAwait(legacyAnalytics());
 render(results, details, legacy);
});
