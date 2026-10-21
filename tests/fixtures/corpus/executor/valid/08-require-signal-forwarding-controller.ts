// Source: executor.md > canc/require-signal-forwarding > Correct (block 2, controller forwarded)
import CancelablePromise, {
  CancelError,
  isCancelError,
  isCancPromise,
  catchCancel,
  suppressCancel,
  makeCancelable,
  createCancelSignal,
} from '@cancjs/promise';
import { cancAsync, cancAwait, cancForAwait } from '@cancjs/coroutine';
import { cancGenAsync, cancGenAwait, cancGenForAwait, cancGenDelegate } from '@cancjs/coroutine/gen';
import {
  cancelify,
  promisify,
  promisifyAll,
  LazyPromise,
  createLazyPromise,
  AbortError,
  isAbortError,
  TimeoutError,
  isTimeoutError,
  createCatchError,
  createSuppressError,
  catchAbort,
  suppressAbort,
  catchTimeout,
  suppressTimeout,
} from '@cancjs/toolbox';

interface Profile {
  id: string;
}
declare function fetchProfile(userId: string, controller: AbortController): Promise<Profile>;

// Also correct: some APIs accept the whole controller and read `.signal` themselves; passing the
// controller counts as forwarding, so canc/require-signal-forwarding does not fire.
// (Handing out a controller gives the callee abort() over a controller it does not own, a design
// smell that strict-tier canc/prefer-signal-over-controller flags separately; pass `.signal`.)
const profile = new CancelablePromise<Profile>((resolve, reject, { handleCancel }) => {
  const controller = new AbortController();
  handleCancel(() => controller.abort());
  // eslint-disable-next-line canc/prefer-signal-over-controller
  fetchProfile('user-1', controller).then(resolve, reject);
});

