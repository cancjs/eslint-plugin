// Snapshot of examples/demo-async-iter/src/main-vanilla.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
import { concatStreams, filterAndFormat, streamWithBreak, threeConsumers } from './reconciliation-vanilla';

async function main() {
  const log = (msg: string) => console.log(`  ${msg}`);

  console.log('\n--- Scenario 1: Filter and Map ---');
  const items = await filterAndFormat(log);
  console.log('Result:', items);

  console.log('\n--- Scenario 2: Three Consume Forms ---');
  await threeConsumers(log);

  console.log('\n--- Scenario 3: Concat Streams ---');
  const allIds = await concatStreams(log);
  console.log('All ids:', allIds);

  console.log('\n--- Scenario 4: Stream with Break ---');
  await streamWithBreak(log, (tx) => {
    console.log(`  processing: ${tx.id}`);
    return tx.id !== 'tx-2';
  });

  // (no cancellation scenario: vanilla has no external cancel mechanism)
}

main().catch(console.error);
