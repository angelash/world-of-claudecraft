# Phase 6 QA: Final Verification

## Goal

Confirm the final hosted-party implementation meets the full user target and
offer packet teardown.

## Checks

- Verify the final long run happened after the last code change.
- Verify the character reached level 20.
- Verify practical pre-20 quests were completed.
- Verify party fill, continued inviting, chat, buffs, healing, tanking, focus
  fire, regrouping, recovery, looting, and vendor stops appeared.
- Verify no runtime errors, stuck loops, or service restart blockers remain.
- Verify LAN/IP URLs still work.

## Teardown

After all checks pass, ask the user whether to remove
`docs/hosted-party-autonomy/` before release cleanup. Do not remove it without
explicit confirmation.
