# Phase 5 QA: Live Harness

## Goal

Verify the live harness can catch the failures the user is seeing, especially
"clicked but no auto invite" and "hosted play does not keep grouping while
questing".

## Checks

- Verify the harness starts from the normal LAN/IP stack.
- Verify it fails clearly when hosted play does not invite.
- Verify it records party size over time.
- Verify it records quest, chat, support, death, stuck, and error signals.
- Verify it leaves the local stack usable after completion.
