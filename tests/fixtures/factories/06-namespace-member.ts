// options: {"additionalCoroutineFactories":[{"name":"useCancEffect","source":"@cancjs/react"}]}
import { cancAwait } from '@cancjs/coroutine';
import * as ui from '@cancjs/react';

declare function loadUser(): Promise<string>;

ui.useCancEffect(function* () {
  yield cancAwait(loadUser()); // lint: no-unstarred-cancawait
}, []);
