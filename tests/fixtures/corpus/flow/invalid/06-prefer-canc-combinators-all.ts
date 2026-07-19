// Source: flow.md > canc/prefer-canc-combinators > Incorrect (block 1, Promise.all)
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

async function load() {
 const [user, orders] = await Promise.all([fetchUserCancelable(), fetchOrdersCancelable()]); // lint
 return { user, orders };
}
