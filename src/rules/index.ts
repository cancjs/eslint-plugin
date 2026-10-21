import type { TSESLint } from '@typescript-eslint/utils';
import type { Rule } from 'eslint';

import executorCancelWiring from './executor-cancel-wiring.js';
import executorParamNames from './executor-param-names.js';
import handleCancelFirst from './handle-cancel-first.js';
import noAsyncExecutor from './no-async-executor.js';
import noExecutorReturn from './no-executor-return.js';
import preferSignalOverController from './prefer-signal-over-controller.js';
import requireSignalForwarding from './require-signal-forwarding.js';
import validCancParams from './valid-canc-params.js';

export const rules: Record<string, Rule.RuleModule | TSESLint.RuleModule<string, readonly unknown[]>> = {
  'executor-cancel-wiring': executorCancelWiring,
  'executor-param-names': executorParamNames,
  'handle-cancel-first': handleCancelFirst,
  'no-async-executor': noAsyncExecutor,
  'no-executor-return': noExecutorReturn,
  'prefer-signal-over-controller': preferSignalOverController,
  'require-signal-forwarding': requireSignalForwarding,
  'valid-canc-params': validCancParams,
};
