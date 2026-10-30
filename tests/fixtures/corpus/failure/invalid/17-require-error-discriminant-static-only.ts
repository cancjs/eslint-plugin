import type CancelablePromise from '@cancjs/promise';

// static members live on the constructor, so instances stay shape-identical
export class StaticCodeErrorA extends Error { // lint: require-error-discriminant:missingDiscriminant
  static readonly code = 'A';
}
export class StaticCodeErrorB extends Error { // lint: require-error-discriminant:missingDiscriminant
  static readonly code = 'B';
}

export declare function run(): CancelablePromise<void, StaticCodeErrorA | StaticCodeErrorB>;
