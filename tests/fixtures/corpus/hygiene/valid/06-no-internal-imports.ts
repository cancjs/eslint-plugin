// Source: hygiene.md > canc/no-internal-imports > Correct
import { CancelablePromise } from '@cancjs/promise';

declare const p: InstanceType<typeof CancelablePromise>;
void p;

