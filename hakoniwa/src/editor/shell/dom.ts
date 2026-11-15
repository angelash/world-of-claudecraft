// Tiny DOM helpers for the workbench (no framework, docs/50_tech/architecture.md 1.6).

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  style?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (ev: Event) => void>>;
  [prop: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'attrs') {
        for (const [ak, av] of Object.entries(v as Record<string, string>)) el.setAttribute(ak, av);
      } else if (k === 'on') {
        for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) {
          el.addEventListener(ev, fn);
        }
      } else (el as unknown as Record<string, unknown>)[k] = v;
    }
  }
  append(el, ...children);
  return el;
}

export function append(el: Element, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Replace an element's children. */
export function fill(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, ...children);
}

export function button(label: string, onClick: () => void, props: Props = {}): HTMLButtonElement {
  return h('button', { type: 'button', text: label, ...props, on: { click: () => onClick() } });
}

export function select(
  options: readonly { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
  props: Props = {},
): HTMLSelectElement {
  const el = h('select', props);
  for (const o of options) el.append(h('option', { value: o.value, text: o.label }));
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function checkbox(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLLabelElement {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check' }, input, label);
}

/** A labelled form row: label on the left, control and optional note on the right. */
export function formRow(label: string, control: Node, note?: Node | string | null): HTMLDivElement {
  return h(
    'div',
    { class: 'form-row' },
    h('label', { class: 'form-label', text: label }),
    h('div', { class: 'form-control' }, control, note ?? null),
  );
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

/** True when keyboard focus is in a text field (tool shortcuts must not fire). */
export function typingInField(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

/** Run at most once per animation frame. */
export function rafThrottle(fn: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      fn();
    });
  };
}
