// Script of the key entry page (docs/50_tech/llm_providers.md 5.5): a password field,
// paste, save and cancel. The field is cleared as soon as its value is sent; the page never
// shows a saved key. Player-facing text is Chinese (the text key migration is PK-M0-14).

type Answer = { ok: true } | { ok: false; reason: 'empty' | 'too_long' | 'bad_chars' | 'failed' };

interface HkKeyBridge {
  submit(secret: string): Promise<Answer>;
  paste(): Promise<Answer>;
  cancel(): void;
}

const REASONS: Record<string, string> = {
  empty: '请输入密钥。',
  too_long: '密钥过长（至多 512 个字符）。',
  bad_chars: '密钥里不能有空格、换行或控制字符。',
  failed: '保存失败，请重试。',
};

const bridge = (window as unknown as { hkKey: HkKeyBridge }).hkKey;
const input = document.getElementById('key') as HTMLInputElement;
const statusLine = document.getElementById('status') as HTMLElement;
const buttons = [...document.querySelectorAll('button')];

function busy(on: boolean): void {
  for (const b of buttons) b.disabled = on;
  input.disabled = on;
}

async function run(send: () => Promise<Answer>): Promise<void> {
  busy(true);
  statusLine.textContent = '';
  try {
    const answer = await send();
    if (!answer.ok) statusLine.textContent = REASONS[answer.reason] ?? REASONS.failed ?? '';
  } catch {
    statusLine.textContent = REASONS.failed ?? '';
  } finally {
    busy(false);
  }
}

function save(): void {
  const value = input.value;
  input.value = '';
  void run(() => bridge.submit(value));
}

document.getElementById('save')?.addEventListener('click', save);
document.getElementById('paste')?.addEventListener('click', () => void run(() => bridge.paste()));
document.getElementById('cancel')?.addEventListener('click', () => bridge.cancel());
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') save();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') bridge.cancel();
});
input.focus();

export {};
