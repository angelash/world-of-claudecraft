# Phase 3 QA: Party Chat

## Goal

Verify hosted party chat is believable, bounded, and behavior-affecting without
giving free-form text authority.

## Checks

- Verify party chat is sent through `/p` commands.
- Verify LLM-disabled fallback produces varied short lines.
- Verify chat frequency is bounded.
- Verify praise and correction do not spam.
- Verify intent values are validated enums or structured records.
- Verify gameplay layers ignore arbitrary free-form chat text.
