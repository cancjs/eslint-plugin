# Examples snapshot findings

Lint of the example demos with the `recommended` and `strict` presets, typed, against the stub packages in `tests/fixtures/projects/examples`.
Line numbers count the one-line provenance header added to every snapshot file.
Tier is `recommended` when the preset reports the diagnostic, `strict` when only the strict preset does.
Classes: `TP` real issue in the example, `FP` rule defect linked to a fix id, `policy` acceptable noise with the reason given.

## Out of scope

- demo-async-dispose/src/main-canc.ts: out of scope: unresolved imports (@cancjs/unhandled-rejection/register)
- demo-chain-propagation/src/main-canc.ts: out of scope: unresolved imports (@cancjs/unhandled-rejection/register)
- demo-combinators/src/main-canc.ts: out of scope: unresolved imports (@cancjs/unhandled-rejection/register)
- demo-decorators/src/issue-client.spec.ts: out of scope: unresolved imports (./babel-legacy/issue-client.js, @cancjs/decorators, @cancjs/decorators/legacy)
- demo-decorators/src/main.ts: out of scope: unresolved imports (@cancjs/decorators, @cancjs/decorators/legacy, @cancjs/unhandled-rejection/register)
- demo-fetch/src/main-canc.ts: out of scope: unresolved imports (@cancjs/fetch, @cancjs/unhandled-rejection/register)
- demo-fetch/src/repo-search-canc.ts: out of scope: unresolved imports (@cancjs/fetch)
- demo-signal-interop/src/main-canc.ts: out of scope: unresolved imports (@cancjs/unhandled-rejection/register)
- demo-toolbox/src/main-canc.ts: out of scope: unresolved imports (@cancjs/unhandled-rejection/register)

## Fixed

A fixed row is removed from the table once the rule stops reporting it; the line here keeps the record.

- FIX-1: demo-async-dispose/src/report-canc.ts:36 canc/executor-cancel-wiring: a shielded promise is no longer asked for a cancel handler

## Findings

| Location | Rule | Message | Tier | Count | Class | Note |
| --- | --- | --- | --- | --- | --- | --- |
| demo-async-dispose/src/report-canc.ts:15 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-async-dispose/src/report-canc.ts:16 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-async-iter/src/main-canc.ts:11 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-async-iter/src/main-canc.ts:15 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-async-iter/src/main-canc.ts:18 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-async-iter/src/main-canc.ts:22 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-async-iter/src/main-canc.ts:28 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-async-iter/src/main-canc.ts:37 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-async-iter/src/main-canc.ts:38 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-chain-propagation/src/page-load-canc.ts:28 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-chain-propagation/src/page-load-canc.ts:32 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-chain-propagation/src/page-load-canc.ts:37 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-chain-propagation/src/page-load-canc.ts:40 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-chain-propagation/src/scenarios.spec.ts:21 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-chain-propagation/src/scenarios.spec.ts:23 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-chain-propagation/src/scenarios.spec.ts:45 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-chain-propagation/src/scenarios.spec.ts:47 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-chain-propagation/src/scenarios.spec.ts:67 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-chain-propagation/src/scenarios.spec.ts:85 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-chain-propagation/src/scenarios.spec.ts:87 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/all-canc.ts:19 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/all-settled-canc.ts:20 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/any-canc.ts:20 | canc/exhaustive-catch | unhandledFailure | recommended | x1 | TP | empty catch drops every failure of the any() input |
| demo-combinators/src/any-canc.ts:20 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/combinators.spec.ts:20 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-combinators/src/combinators.spec.ts:21 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-combinators/src/combinators.spec.ts:22 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-combinators/src/combinators.spec.ts:23 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-combinators/src/combinators.spec.ts:41 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-combinators/src/combinators.spec.ts:50 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/combinators.spec.ts:67 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-combinators/src/combinators.spec.ts:89 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-combinators/src/combinators.spec.ts:111 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-combinators/src/combinators.spec.ts:137 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-combinators/src/combinators.spec.ts:146 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/combinators.spec.ts:153 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-combinators/src/isolation-canc.ts:22 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/race-canc.ts:20 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-combinators/src/widgets-shared.ts:9 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-combinators/src/widgets-shared.ts:10 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-combinators/src/widgets-shared.ts:11 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-combinators/src/widgets-shared.ts:12 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-coroutine/src/checkout-canc.ts:20 | canc/valid-cancasync | anyReturnAnnotation | recommended | x1 | TP | any return annotation removes per-step inference |
| demo-coroutine/src/checkout-canc.ts:26 | canc/no-cancellation-gap | gapStep | strict | x1 | policy | dependency is injected as a plain Promise by signature; the mock behind it honours the signal |
| demo-coroutine/src/checkout-canc.ts:29 | canc/no-cancellation-gap | gapStep | strict | x2 | policy | dependency is injected as a plain Promise by signature; the mock behind it honours the signal |
| demo-coroutine/src/checkout-canc.ts:37 | canc/no-cancellation-gap | gapStep | strict | x1 | policy | dependency is injected as a plain Promise by signature; the mock behind it honours the signal |
| demo-coroutine/src/checkout-canc.ts:41 | canc/no-cancellation-gap | gapStep | strict | x1 | TP | legacy vendor call without a signal, the example already calls it a cancellation gap |
| demo-coroutine/src/checkout-canc.ts:47 | canc/no-cancellation-gap | gapStep | strict | x1 | policy | dependency is injected as a plain Promise by signature; the mock behind it honours the signal |
| demo-coroutine/src/main-canc.ts:25 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-coroutine/src/main-canc.ts:27 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-coroutine/src/main-canc.ts:42 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-coroutine/src/main-canc.ts:44 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-coroutine/src/main-canc.ts:58 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-coroutine/src/main-canc.ts:60 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-coroutine/src/main-vanilla.ts:47 | canc/prefer-is-cancel-error | preferIsAbortError | recommended | x1 | policy | vanilla contrast file shows the platform name check on purpose; the rule documents flagging it |
| demo-coroutine/src/main-vanilla.ts:63 | canc/prefer-is-cancel-error | preferIsAbortError | recommended | x1 | policy | vanilla contrast file shows the platform name check on purpose; the rule documents flagging it |
| demo-coroutine/src/smoke.ts:29 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-coroutine/src/smoke.ts:32 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-decorators/src/scenario.ts:34 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-decorators/src/scenario.ts:36 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-decorators/src/scenario.ts:46 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-fetch/src/repo-search-vanilla.ts:29 | canc/no-abort-listener-leak | inlineListenerNoOnce | strict | x1 | TP | inline listener on a caller-supplied signal is never removed |
| demo-promise-basics/src/main-canc.ts:23 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-promise-basics/src/main-canc.ts:25 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-promise-basics/src/main-canc.ts:55 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-promise-basics/src/main-canc.ts:58 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-promise-basics/src/main-canc.ts:68 | canc/prefer-canceled-property | preferCanceledProperty | recommended | x1 | TP | uses the deprecated isCanceled property |
| demo-promise-basics/src/profile-service-canc.ts:15 | canc/prefer-signal-accessor | preferSignalAccessor | recommended | x1 | TP | uses the deprecated getSignal accessor |
| demo-signal-interop/src/classify-canc.ts:28 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/classify-canc.ts:30 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-signal-interop/src/classify-canc.ts:69 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-signal-interop/src/classify-canc.ts:108 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/classify-canc.ts:110 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-signal-interop/src/compose-canc.ts:33 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/compose-canc.ts:35 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-signal-interop/src/compose-canc.ts:62 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/compose-canc.ts:64 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-signal-interop/src/compose-vanilla.ts:30 | canc/no-abort-listener-leak | leakedAbortListener | strict | x1 | FP | FIX-3: registered inside the promise executor, removed in the finally block of the enclosing function |
| demo-signal-interop/src/compose-vanilla.ts:31 | canc/no-abort-listener-leak | leakedAbortListener | strict | x1 | FP | FIX-3: registered inside the promise executor, removed in the finally block of the enclosing function |
| demo-signal-interop/src/compose-vanilla.ts:65 | canc/no-abort-listener-leak | leakedAbortListener | strict | x1 | FP | FIX-3: registered inside the executor loop, removed from the cleanup list in the enclosing finally block |
| demo-signal-interop/src/in-canc.ts:39 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/in-canc.ts:67 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/in-canc.ts:92 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/in-vanilla.ts:54 | canc/no-abort-listener-leak | inlineListenerNoOnce | strict | x1 | FP | FIX-4: signals are local controllers reached through an array map, so their lifetime ends with the function |
| demo-signal-interop/src/out-canc.ts:42 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/out-canc.ts:44 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-signal-interop/src/out-canc.ts:62 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/out-canc.ts:64 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-signal-interop/src/with-signal-canc.ts:28 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-signal-interop/src/with-signal-vanilla.ts:15 | canc/no-abort-listener-leak | leakedAbortListener | strict | x1 | FP | FIX-2: the listener is removed in the returned chain .finally callback; only try/finally is recognised |
| demo-toolbox/src/gateway-signal-canc.ts:18 | canc/no-abort-listener-leak | leakedAbortListener | strict | x1 | FP | FIX-2: the listener is removed in the returned chain .finally callback, which runs on every settle path; only try/finally is recognised |
| demo-toolbox/src/inventory-timeout-canc.ts:17 | canc/no-failure-widening | failureWidening | recommended | x1 | FP | FIX-5: the annotation names the same TimeoutError as the source; the brand of the annotation type reads as any so the match fails |
| demo-toolbox/src/poll-deploy-canc.ts:13 | canc/no-failure-widening | failureWidening | recommended | x1 | TP | default failure parameter widens the TimeoutError of waitFor to unknown |
| demo-toolbox/src/suppress-vanilla.ts:16 | canc/prefer-is-cancel-error | preferIsAbortError | recommended | x1 | policy | vanilla contrast file shows the platform name check on purpose; the rule documents flagging it |
| demo-toolbox/src/toolbox.spec.ts:26 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-toolbox/src/toolbox.spec.ts:27 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-toolbox/src/toolbox.spec.ts:44 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-toolbox/src/toolbox.spec.ts:45 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |
| demo-toolbox/src/toolbox.spec.ts:65 | canc/no-await-cancelable-in-async | awaitErasesCancelability | recommended | x1 | TP | plain async function awaits a cancelable promise |
| demo-toolbox/src/toolbox.spec.ts:66 | canc/no-swallowed-cancel | swallowedCancel | recommended | x1 | TP | catch absorbs the cancel instead of rethrowing it or using a boundary helper |

## Fix ids

- FIX-1: executor-cancel-wiring should stay silent when the promise is shielded
- FIX-2: no-abort-listener-leak should accept removal inside a promise .finally callback
- FIX-3: no-abort-listener-leak should accept removal in the finally block of the function enclosing the registering closure
- FIX-4: no-abort-listener-leak should treat signals of local controllers as confined when they flow through an array map
- FIX-5: no-failure-widening should match a failure by structure when the brand lookup of the annotation type is any
