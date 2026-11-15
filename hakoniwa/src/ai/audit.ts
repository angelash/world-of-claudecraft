// Audit log: one record per AI request (prompt, raw output, parsed commands, validation,
// outcome, usage, cost, latency) in a bounded ring, with subscriptions for the editor's
// AI audit desk and an optional sink (for example POST /api/audit). Audit records never
// enter the world and never affect the kernel. See docs/50_tech/ai_architecture.md 12.1.

import type { DegradeLevel } from './budget';
import type {
  BindingRole,
  HttpResponseLike,
  HttpTransport,
  LlmUsage,
  ModelTier,
  ProblemCode,
} from './contracts';
import type { ProposedCommand, RejectedCommand } from './output';

export type AuditOutcome =
  | 'pending'
  /** proposal accepted by the kernel (at least one command, or a deliberate empty decision) */
  | 'proposal'
  /** declined before or after the call; the deterministic fallback runs */
  | 'declined'
  /** the answer came after the kernel closed the request (deadline passed, world reloaded) */
  | 'late';

export interface AuditRecord {
  auditId: string;
  requestId: string;
  agentId: string;
  role: string;
  rolePackVersion: string;
  purpose: string;
  /** kernel tick when the runner took the request */
  tick: number;
  /** runner epoch (bumped when the runner is rebound to a reloaded world) */
  epoch: number;
  /** real time (injected clock, ms) when the record was created */
  realMs: number;
  degradeLevel: DegradeLevel;
  tier?: ModelTier;
  requestedModel?: string;
  /** Route resolution (llm_providers.md 4.3): binding role, slot, connection, detours. */
  route?: {
    bindingRole: BindingRole;
    slot: ModelTier;
    connectionId: string;
    rerouted?: boolean;
    lowered?: boolean;
  };
  /** Player-facing problem code of a failed call (llm_providers.md 10.1). */
  problem?: ProblemCode;
  /** model that actually answered */
  model?: string;
  prompt?: { system: string; stable: string; context: string };
  /** sanitised player words included in the prompt, if any */
  playerText?: string;
  rawOutput?: string;
  stopReason?: string;
  parsed?: unknown;
  commands?: ProposedCommand[];
  rejected?: RejectedCommand[];
  validation?: { ok: boolean; errors: string[] };
  speech?: string;
  thought?: string;
  leaks?: string[];
  outcome: AuditOutcome;
  /** machine reason code for declines and failures, for example 'budget_hour', 'timeout' */
  reason?: string;
  /** readable detail for the audit desk */
  detail?: string;
  usage?: LlmUsage;
  costUsd?: number;
  reservedUsd?: number;
  reservedTokens?: number;
  latencyMs?: number;
}

export type AuditChange = 'added' | 'updated';
export type AuditListener = (record: Readonly<AuditRecord>, change: AuditChange) => void;

export interface AuditLogOptions {
  /** Ring size; oldest records are dropped first. Default 500. */
  capacity?: number;
  /** Called once per record when it leaves 'pending' (and for records added already final). */
  sink?: (record: Readonly<AuditRecord>) => void;
}

export class AuditLog {
  private records: AuditRecord[] = [];
  private readonly listeners = new Set<AuditListener>();
  private readonly capacity: number;
  private readonly sink?: (record: Readonly<AuditRecord>) => void;
  private seq = 0;

  constructor(opts: AuditLogOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? 500);
    this.sink = opts.sink;
  }

  /** Next audit id (a per-log counter). */
  nextId(): string {
    this.seq += 1;
    return `audit${this.seq}`;
  }

  add(record: AuditRecord): void {
    this.records.push(record);
    if (this.records.length > this.capacity) {
      this.records.splice(0, this.records.length - this.capacity);
    }
    this.emit(record, 'added');
    if (record.outcome !== 'pending') this.sink?.(record);
  }

  /** Merge a patch into a record; a no-op when the record already left the ring. */
  update(auditId: string, patch: Partial<AuditRecord>): void {
    const rec = this.records.find((r) => r.auditId === auditId);
    if (!rec) return;
    const wasPending = rec.outcome === 'pending';
    Object.assign(rec, patch);
    this.emit(rec, 'updated');
    if (wasPending && rec.outcome !== 'pending') this.sink?.(rec);
  }

  get(auditId: string): Readonly<AuditRecord> | undefined {
    return this.records.find((r) => r.auditId === auditId);
  }

  /** Oldest first. */
  list(): readonly Readonly<AuditRecord>[] {
    return this.records;
  }

  /** Subscribe to additions and updates; returns the unsubscribe function. */
  subscribe(listener: AuditListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.records = [];
  }

  private emit(record: AuditRecord, change: AuditChange): void {
    for (const l of this.listeners) {
      try {
        l(record, change);
      } catch {
        // a broken listener must not break the AI layer
      }
    }
  }
}

export interface HttpAuditSinkOptions {
  /** Base URL of the dev server; '' means same origin. */
  baseUrl?: string;
  /** Defaults to the global fetch. */
  transport?: HttpTransport;
  /** Drop prompt and raw output before sending (release builds keep summaries only). */
  summaryOnly?: boolean;
}

/** Fire-and-forget sink that appends final records to the dev server's audit log. */
export function httpAuditSink(
  opts: HttpAuditSinkOptions = {},
): (record: Readonly<AuditRecord>) => void {
  const url = `${opts.baseUrl ?? ''}/api/audit`;
  return (record) => {
    const transport = opts.transport ?? defaultTransport();
    if (!transport) return;
    const body = opts.summaryOnly
      ? {
          ...record,
          prompt: undefined,
          rawOutput: undefined,
          parsed: undefined,
          playerText: undefined,
        }
      : record;
    transport(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // the audit log is best-effort
    });
  };
}

/** The global fetch as an HttpTransport, or undefined where there is none. */
export function defaultTransport(): HttpTransport | undefined {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== 'function') return undefined;
  const call = f as (this: unknown, u: string, i: unknown) => Promise<HttpResponseLike>;
  return (url, init) => call.call(globalThis, url, init);
}
