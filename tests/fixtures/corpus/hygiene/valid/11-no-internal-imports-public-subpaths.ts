// Source: hygiene.md > canc/no-internal-imports > Correct (public subpaths)
import { cancGenAsync, cancGenAwait } from '@cancjs/coroutine/gen';
// @ts-expect-error TS2307: package @cancjs/node has no fixture stubs
import { readFile } from '@cancjs/node/fs';

void cancGenAsync;
void cancGenAwait;
void readFile;
