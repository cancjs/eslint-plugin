// Source: hygiene.md > canc/no-keyword-alias-import > Incorrect (block 2, renamed but still the alias)
import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine'; // lint: prefer the exported canonical names

void cancAsync;
void cancAwait;
