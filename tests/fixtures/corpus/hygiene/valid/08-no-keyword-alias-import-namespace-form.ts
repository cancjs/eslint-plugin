// Source: hygiene.md > canc/no-keyword-alias-import > Correct (block 2, namespace form)
import * as canc from '@cancjs/coroutine';

interface User {
 id: string;
}
declare function fetchUserCancelable(): ReturnType<typeof canc.async>;

// Namespace form: the aliases are designed for this; the property access reads well.
const load = canc.async(function* () {
 const user = yield* canc.await(fetchUserCancelable());
 return user;
});
