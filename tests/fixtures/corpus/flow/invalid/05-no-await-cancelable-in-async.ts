// Source: flow.md > canc/no-await-cancelable-in-async > Incorrect
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

async function refreshView(): Promise<void> {
 const results = await searchCancelable(query); // lint: cancelable awaited in plain async fn
 const details = await fetchDetailsCancelable(results[0].id); // lint
 const legacy = await legacyAnalytics(); // plain promise mixed into the same flow
 render(results, details, legacy);
}
