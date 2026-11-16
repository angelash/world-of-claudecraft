// Dev-build painter for missing text (ux_and_onboarding.md 20.3): watches the page and wraps
// every unfilled placeholder and every key shown as itself in a red-outlined span, so a
// missing parameter or key is seen at a glance. Installed only by dev builds (main.ts); the
// spans are found by the pure src/shared_ui/missing_marks.ts. Release builds never load it.

import { missingTextMarks } from '../../shared_ui/missing_marks';

const MARK_CLASS = 'hk-missing-text';

function markNode(node: Text): void {
  const text = node.data;
  const marks = missingTextMarks(text);
  if (marks.length === 0) return;
  const parent = node.parentNode;
  if (!parent || (parent as Element).classList?.contains(MARK_CLASS)) return;
  const frag = document.createDocumentFragment();
  let at = 0;
  for (const m of marks) {
    if (m.start > at) frag.append(text.slice(at, m.start));
    const span = document.createElement('span');
    span.className = MARK_CLASS;
    span.dataset.kind = m.kind;
    span.textContent = text.slice(m.start, m.end);
    frag.append(span);
    at = m.end;
  }
  if (at < text.length) frag.append(text.slice(at));
  parent.replaceChild(frag, node);
}

function scan(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    markNode(root as Text);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) found.push(n as Text);
  for (const n of found) markNode(n);
}

/** Start marking missing text under `root`; returns the function that stops it. */
export function installMissingTextMarks(root: HTMLElement): () => void {
  scan(root);
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') markNode(r.target as Text);
      else for (const n of r.addedNodes) scan(n);
    }
  });
  obs.observe(root, { childList: true, subtree: true, characterData: true });
  return () => obs.disconnect();
}
