const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

export class DuplicateCancelErrorB extends Error {
  readonly [CANCEL_ERROR_BRAND]: true = true;
}
