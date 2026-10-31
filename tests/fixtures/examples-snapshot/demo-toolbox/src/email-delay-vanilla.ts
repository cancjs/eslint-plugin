// Snapshot of examples/demo-toolbox/src/email-delay-vanilla.ts, copied 2026-10-30 from mono master "Exclude cancellation from failure types and simplify failure helpers (#60)"
import type { MockApiBundle } from '@shared/mock-api';

type MailApi = MockApiBundle['mail'];

/**
 * Delays an email send by 1000ms (e.g. undo window). Plain promise: if canceled, the timer
 * still runs and the email sends anyway (unwanted side effect).
 */
export function sendEmailWithDelay(mailApi: MailApi, email: string): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      mailApi.send(email);
      resolve();
    }, 1000);
  });
}
