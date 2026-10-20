// Source: hygiene.md > canc/no-keyword-alias-import > Incorrect (block 1, bare keyword-looking binding)
import { async, await as cawait } from '@cancjs/coroutine'; // lint: no-keyword-alias-import bare keyword-looking binding

const load = async(function* () {
 /* ... */
});
void cawait;
void load;

