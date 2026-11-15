/** Size supported declarations without evaluating source code or choosing a host. */
export function timeoutValue(
  masked: string,
  source: string,
  resolveIdentifier: (name: string) => number | null,
): number | null {
  const numeric = /^\s*([0-9][0-9_]*)\s*$/.exec(masked);
  if (numeric) return Number(numeric[1].replace(/_/g, ''));

  const platform =
    /^\s*(?:FULL_SWEEP\s*\?\s*[0-9][0-9_]*\s*:\s*)?process\.platform\s*===\s*(['"])\s*\1\s*\?\s*([0-9][0-9_]*)\s*:\s*([0-9][0-9_]*)\s*$/.exec(
      masked,
    );
  if (platform) {
    // A numeric FULL_SWEEP arm remains nightly-only. Its literal platform
    // diet still contributes the larger host allowance to the PR ledger.
    // Masking keeps quote positions but erases the platform name. Confirm the
    // original literal so another comparison cannot inherit this policy.
    const quoteAt = masked.indexOf(platform[1], masked.indexOf('==='));
    if (source.slice(quoteAt, quoteAt + 7) !== `${platform[1]}win32${platform[1]}`) return null;
    return Math.max(Number(platform[2].replace(/_/g, '')), Number(platform[3].replace(/_/g, '')));
  }

  // The standing full-sweep policy counts its PR diet, independently of the
  // platform policy above, which must conservatively account for both hosts.
  const diet = /^\s*[A-Za-z_$][\w$.]*\s*\?\s*([0-9][0-9_]*)\s*:\s*([0-9][0-9_]*)\s*$/.exec(masked);
  if (diet) return Number(diet[2].replace(/_/g, ''));
  const identifier = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(masked);
  return identifier ? resolveIdentifier(identifier[1]) : null;
}
