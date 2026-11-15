// Entry of the model gateway utility process (docs/50_tech/release_engineering.md 2.1):
// started by the main process with utilityProcess.fork, it talks only over its parent
// port. Everything it decides lives in core.ts; this file is the process glue.

import type { MessagePortMain } from 'electron';
import { createGatewayCore } from './core';

const core = createGatewayCore();
const parent = process.parentPort;

parent.on('message', (event: { data: unknown; ports: MessagePortMain[] }) => {
  let reply = null;
  try {
    reply = core.handle(event.data, event.ports ?? []);
  } catch {
    // A defect in one message must not take the gateway down; the caller times out.
    for (const p of event.ports ?? []) p.close();
  }
  if (reply) parent.postMessage(reply);
});
