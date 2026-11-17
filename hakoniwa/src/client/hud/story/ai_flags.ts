// "Block and flag" for generated text (ux_and_onboarding.md 7.3, 4.6; ai_architecture.md 11.3):
// a model line the player blocks is hidden at once wherever it shows, and a record of it is
// kept on this machine. The desktop build is to append these records to `flags.jsonl` through
// the shell; until then they live in the page's key-value store. Pure: the store and the clock
// are injected; Node-tested.

/** The page key the records live under. */
export const AI_FLAGS_KEY = 'hakoniwa.ai_flags';
/** At most this many records are kept (the oldest go first). */
export const AI_FLAGS_LIMIT = 500;

export interface AiFlagRecord {
  /** speaker and text (dialogue_model.ts lineSignature) */
  sig: string;
  speaker: string;
  text: string;
  /** real time of the flag, ISO string */
  at: string;
}

export interface FlagKeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class AiFlagStore {
  private records: AiFlagRecord[] = [];
  private sigs = new Set<string>();

  constructor(
    private readonly kv: FlagKeyValue | null,
    private readonly nowIso: () => string,
  ) {
    try {
      const raw = kv?.getItem(AI_FLAGS_KEY);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(list)) {
        for (const r of list) {
          if (r && typeof r === 'object' && typeof (r as AiFlagRecord).sig === 'string') {
            this.records.push(r as AiFlagRecord);
            this.sigs.add((r as AiFlagRecord).sig);
          }
        }
      }
    } catch {
      // a damaged list starts empty
    }
  }

  isBlocked(sig: string): boolean {
    return this.sigs.has(sig);
  }

  /** Block a line and record it; a line already blocked is not recorded twice. */
  block(sig: string): boolean {
    if (!sig || this.sigs.has(sig)) return false;
    const cut = sig.indexOf('|');
    this.records.push({
      sig,
      speaker: cut >= 0 ? sig.slice(0, cut) : '',
      text: cut >= 0 ? sig.slice(cut + 1) : sig,
      at: this.nowIso(),
    });
    if (this.records.length > AI_FLAGS_LIMIT)
      this.records.splice(0, this.records.length - AI_FLAGS_LIMIT);
    this.sigs = new Set(this.records.map((r) => r.sig));
    try {
      this.kv?.setItem(AI_FLAGS_KEY, JSON.stringify(this.records));
    } catch {
      // storage full: the line stays hidden for this session
    }
    return true;
  }

  list(): readonly AiFlagRecord[] {
    return this.records;
  }
}
