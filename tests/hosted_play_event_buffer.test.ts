import { describe, expect, it } from 'vitest';
import { appendHostedPlayEvent } from '../server/hosted_play/event_buffer';
import type { SimEvent } from '../src/sim/types';

it('retains the newest 32 original events only while observed', () => {
  const session = { hostedPlayObserved: false, hostedPlayRecentEvents: [] as SimEvent[] };
  appendHostedPlayEvent(session, { type: 'log', text: 'disabled' });
  expect(session.hostedPlayRecentEvents).toEqual([]);
  session.hostedPlayObserved = true;
  const events = Array.from(
    { length: 100 },
    (_, i): SimEvent => ({ type: 'log', text: String(i) }),
  );
  for (const event of events) appendHostedPlayEvent(session, event);
  expect(session.hostedPlayRecentEvents).toEqual(events.slice(-32));
  expect(session.hostedPlayRecentEvents[0]).toBe(events[68]);
});
