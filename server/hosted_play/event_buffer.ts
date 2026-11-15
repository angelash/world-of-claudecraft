import type { SimEvent } from '../../src/sim/types';

const MAX_RECENT_EVENTS = 32;
export function appendHostedPlayEvent(
  session: { hostedPlayObserved: boolean; hostedPlayRecentEvents: SimEvent[] },
  event: SimEvent,
): void {
  if (!session.hostedPlayObserved) return;
  session.hostedPlayRecentEvents.push(event);
  if (session.hostedPlayRecentEvents.length > MAX_RECENT_EVENTS)
    session.hostedPlayRecentEvents.splice(
      0,
      session.hostedPlayRecentEvents.length - MAX_RECENT_EVENTS,
    );
}
