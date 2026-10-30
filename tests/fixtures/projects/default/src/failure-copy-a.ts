const CANCEL_ERROR_BRAND = Symbol.for('@cancjs/promise:CancelError');

export class DuplicateCancelErrorA extends Error {
  readonly [CANCEL_ERROR_BRAND]: true = true;
}
