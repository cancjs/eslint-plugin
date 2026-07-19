// Source: hygiene.md > canc/no-internal-imports > Incorrect
import { CancelablePromise } from '@cancjs/promise/dist/cancelable-promise'; // lint

declare const p: InstanceType<typeof CancelablePromise>;
void p;
