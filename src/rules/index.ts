import type { TSESLint } from '@typescript-eslint/utils';
import type { Rule } from 'eslint';

import executorCancelWiring from './executor-cancel-wiring.js';
import executorParamNames from './executor-param-names.js';
import handleCancelFirst from './handle-cancel-first.js';
import mustConsumeLazy from './must-consume-lazy.js';
import noAbortListenerLeak from './no-abort-listener-leak.js';
import noAsyncExecutor from './no-async-executor.js';
import noAsyncLoopCallback from './no-async-loop-callback.js';
import noCancellationGap from './no-cancellation-gap.js';
import noCoroutineDialectMismatch from './no-coroutine-dialect-mismatch.js';
import noExecutorReturn from './no-executor-return.js';
import noInternalImports from './no-internal-imports.js';
import noKeywordAliasImport from './no-keyword-alias-import.js';
import noUnstarredCancawait from './no-unstarred-cancawait.js';
import noYieldAwaitInLoop from './no-yield-await-in-loop.js';
import preferCancCombinators from './prefer-canc-combinators.js';
import preferCancawait from './prefer-cancawait.js';
import preferCancelAwareWrapper from './prefer-cancel-aware-wrapper.js';
import preferCanceledProperty from './prefer-canceled-property.js';
import preferIsCancelError from './prefer-is-cancel-error.js';
import preferSignalAccessor from './prefer-signal-accessor.js';
import preferSignalOption from './prefer-signal-option.js';
import preferSignalOverController from './prefer-signal-over-controller.js';
import requireSignalForwarding from './require-signal-forwarding.js';
import validCancParams from './valid-canc-params.js';
import validCancasync from './valid-cancasync.js';

export const rules: Record<string, Rule.RuleModule | TSESLint.RuleModule<string, readonly unknown[]>> = {
  'executor-cancel-wiring': executorCancelWiring,
  'executor-param-names': executorParamNames,
  'handle-cancel-first': handleCancelFirst,
  'must-consume-lazy': mustConsumeLazy,
  'no-abort-listener-leak': noAbortListenerLeak,
  'no-async-executor': noAsyncExecutor,
  'no-async-loop-callback': noAsyncLoopCallback,
  'no-cancellation-gap': noCancellationGap,
  'no-coroutine-dialect-mismatch': noCoroutineDialectMismatch,
  'no-executor-return': noExecutorReturn,
  'no-internal-imports': noInternalImports,
  'no-keyword-alias-import': noKeywordAliasImport,
  'no-unstarred-cancawait': noUnstarredCancawait,
  'no-yield-await-in-loop': noYieldAwaitInLoop,
  'prefer-canc-combinators': preferCancCombinators,
  'prefer-cancawait': preferCancawait,
  'prefer-cancel-aware-wrapper': preferCancelAwareWrapper,
  'prefer-canceled-property': preferCanceledProperty,
  'prefer-is-cancel-error': preferIsCancelError,
  'prefer-signal-accessor': preferSignalAccessor,
  'prefer-signal-option': preferSignalOption,
  'prefer-signal-over-controller': preferSignalOverController,
  'require-signal-forwarding': requireSignalForwarding,
  'valid-canc-params': validCancParams,
  'valid-cancasync': validCancasync,
};
