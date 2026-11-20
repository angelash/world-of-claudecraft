import './notice.css';
import { RestartNotice, type ServiceView } from './notice';

const notice = new RestartNotice(async (action, requestId) => {
  // Refresh the HttpOnly control session before an explicit user action after a long play.
  await fetch('/_service/state', { cache: 'no-store' });
  const response = await fetch('/_service/' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Service control failed');
  return response.json() as Promise<ServiceView>;
});
void fetch('/_service/state', { cache: 'no-store' })
  .then((r) => r.json())
  .then((s) => notice.update(s))
  .catch(console.error);
const events = new EventSource('/_service/events');
events.onmessage = (e) => {
  try {
    notice.update(JSON.parse(e.data));
  } catch (err) {
    console.error('[service notice]', err);
  }
};
const ticker = setInterval(() => notice.tick(), 100);
window.addEventListener(
  'pagehide',
  () => {
    clearInterval(ticker);
    events.close();
    notice.dispose();
  },
  { once: true },
);
