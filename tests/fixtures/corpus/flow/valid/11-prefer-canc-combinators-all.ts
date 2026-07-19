// Source: flow.md > canc/prefer-canc-combinators > Correct (block 1, CancelablePromise.all)
import CancelablePromise, {
 isCancelError, isCancPromise, isAbortError,
 catchCancel, suppressCancel, makeCancelable, createCancelRef, createAbortSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancIterAsync, cancIterAwait, cancIterForAwait, cancIterDelegate, awaited } from '@cancjs/coroutine/iter';
import { cancelify, promisify, promisifyAll } from '@cancjs/toolbox';
import { LazyPromise } from '@cancjs/lazy-promise';

interface User {
 id: string;
}
interface Order {
 id: string;
}
declare function fetchUserCancelable(): CancelablePromise<User>;
declare function fetchOrdersCancelable(): CancelablePromise<Order[]>;

const bundle = CancelablePromise.all([fetchUserCancelable(), fetchOrdersCancelable()]);
// One cancel stops both requests; first rejection cancels the remaining input.
