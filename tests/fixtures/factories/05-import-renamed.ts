// options: {"additionalCoroutineFactories":[{"name":"cancelableSetup","source":"@cancjs/vue"}]}
import { cancAwait } from '@cancjs/coroutine';
import { cancelableSetup as setup } from '@cancjs/vue';

declare function loadProfile(id: string): Promise<string>;

export default setup(function* (props: { id: string }) {
  const profile = yield cancAwait(loadProfile(props.id)); // lint: no-unstarred-cancawait
  return { profile };
});
