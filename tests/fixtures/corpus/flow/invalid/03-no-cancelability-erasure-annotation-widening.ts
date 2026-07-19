// Source: flow.md > canc/no-cancelability-erasure > Incorrect (block 3, annotation widening)
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
declare function fetchUserCancelable(): CancelablePromise<User>;

// Annotation widening: reported by default (allowAnnotationWidening: false). The annotation may
// exist for unrelated reasons, so this form hides the downgrade instead of stating it.
const pending: Promise<User> = fetchUserCancelable(); // lint: silent widening
