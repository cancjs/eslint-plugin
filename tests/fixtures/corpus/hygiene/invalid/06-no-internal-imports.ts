// Source: hygiene.md > canc/no-internal-imports > Incorrect
import { CancelablePromise } from '@cancjs/promise/dist/cancelable-promise'; // lint: no-internal-imports:internalImport

declare const p: InstanceType<typeof CancelablePromise>;
void p;

