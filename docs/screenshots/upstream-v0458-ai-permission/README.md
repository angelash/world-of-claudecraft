# AI operations permission failures

The upstream integration reuses the admin dashboard's `PermissionDenied` component
for either AI diagnostics or ambient-bot reads answering HTTP 403. Each pair shows
one refused read with the other panel healthy.

- AI diagnostics, desktop: [before](ai-desktop-before.png), [after](ai-desktop-after.png).
- AI diagnostics, mobile: [before](ai-mobile-before.png), [after](ai-mobile-after.png).
- Ambient bots, desktop: [before](ambient-desktop-before.png), [after](ambient-desktop-after.png).
- Ambient bots, mobile: [before](ambient-mobile-before.png), [after](ambient-mobile-after.png).

These captures mount the actual Svelte component and admin stylesheet in system
Chrome with synthetic responses. They are component visual evidence, with no live
backend or account. The baseline comes from the resolved merge index before the
permission-state correction. Desktop uses 1280 by 900 pixels; mobile uses 390 by
844 pixels. All eight captures were inspected for readable copy, independent panel
content and horizontal overflow.

The [capture receipt](capture-receipt.json) records source and image SHA-256 values,
compiler version, requests, dimensions and browser errors. Behavioral coverage is
in `tests/admin/permission_denied.test.ts`, including 401, 403, other failures and
independent recovery.
