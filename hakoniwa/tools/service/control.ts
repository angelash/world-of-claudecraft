import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const command = process.argv[2] ?? 'status';
if (!['status', 'restart', 'resume', 'interrupt'].includes(command))
  throw new Error('Use status/restart/resume/interrupt');
const endpoint = 'http://127.0.0.1:5180/_service/';
async function status() {
  const response = await fetch(endpoint + 'state', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Managed service unavailable:' + response.status);
  return response.json();
}
let state = await status();
if (command === 'status') console.log(JSON.stringify(state, null, 2));
else {
  const token = readFileSync(
    fileURLToPath(new URL('../../.local/service/control.token', import.meta.url)),
    'utf8',
  ).trim();
  const response = await fetch(endpoint + command, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ reason: process.argv.slice(3).join(' '), requestId: state.requestId }),
    signal: AbortSignal.timeout(5000),
  });
  state = await response.json();
  if (!response.ok) throw new Error('Service control rejected:' + JSON.stringify(state));
  if (command === 'interrupt') console.log(JSON.stringify(state, null, 2));
  else {
    const until = Date.now() + 75000;
    while (state.phase === 'countdown' || state.phase === 'restarting') {
      if (Date.now() >= until)
        throw new Error('Restart wait timed out; inspect status, do not retry blindly');
      await new Promise((resolve) => setTimeout(resolve, 250));
      state = await status();
    }
    console.log(JSON.stringify(state, null, 2));
  }
  if (state.phase === 'paused') {
    console.error(
      'USER_INTERRUPTED: restart paused. Continue independent work; resume only after the user explicitly continues.',
    );
    process.exitCode = 3;
  } else if (state.phase === 'failed') process.exitCode = 1;
}
