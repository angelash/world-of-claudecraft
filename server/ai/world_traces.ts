import type { DroppedItemSemantic } from './scene_frame';
import { isSingularityLineId } from './singularity';

export type AiWorldTraceKind = 'singularity' | 'cursed' | 'food' | 'valuable' | 'generic';

export type AiWorldTraceLineId =
  | 'hudChrome.aiSpeech.sceneTraceSingularity'
  | 'hudChrome.aiSpeech.sceneTraceCursed'
  | 'hudChrome.aiSpeech.sceneTraceFood'
  | 'hudChrome.aiSpeech.sceneTraceValuable'
  | 'hudChrome.aiSpeech.sceneTraceGeneric';

export interface AiWorldTrace {
  traceId: string;
  sceneId: string;
  kind: AiWorldTraceKind;
  itemId: string;
  itemDisplayName: string;
  sourcePlayerEntityId: number;
  lineId: AiWorldTraceLineId;
  reasonLineIds: string[];
  strength: number;
  createdAt: number;
  expiresAt: number;
}

export interface AiWorldTraceStoreOptions {
  traceTtlSeconds?: number;
  maxTraces?: number;
}

export class AiWorldTraceStore {
  private readonly traces: AiWorldTrace[] = [];
  private readonly traceTtlSeconds: number;
  private readonly maxTraces: number;
  private traceSequence = 0;

  constructor(options: AiWorldTraceStoreOptions = {}) {
    this.traceTtlSeconds = Math.max(1, Math.floor(options.traceTtlSeconds ?? 90));
    this.maxTraces = Math.max(1, Math.floor(options.maxTraces ?? 16));
  }

  noteItemTrace(input: {
    sceneId: string;
    item: DroppedItemSemantic;
    sourcePlayerEntityId: number;
    reasonLineIds: string[];
    nowSeconds: number;
  }): AiWorldTrace | null {
    this.prune(input.nowSeconds);
    const kind = worldTraceKindForItem(input.item, input.reasonLineIds);
    if (!kind) return null;
    const trace: AiWorldTrace = {
      traceId: `trace-${++this.traceSequence}`,
      sceneId: input.sceneId,
      kind,
      itemId: input.item.itemId,
      itemDisplayName: input.item.displayName,
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      lineId: worldTraceLineId(kind),
      reasonLineIds: [...input.reasonLineIds],
      strength: 1,
      createdAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.traceTtlSeconds,
    };
    this.traces.unshift(trace);
    this.traces.splice(this.maxTraces);
    return copyTrace(trace);
  }

  traceForScene(sceneId: string | null | undefined, playerEntityId: number, nowSeconds: number): AiWorldTrace | null {
    if (!sceneId) return null;
    this.prune(nowSeconds);
    const trace = this.traces.find((candidate) => candidate.sceneId === sceneId && candidate.sourcePlayerEntityId === playerEntityId);
    if (!trace) return null;
    const age = Math.max(0, nowSeconds - trace.createdAt);
    return {
      ...copyTrace(trace),
      strength: Math.max(0.15, 1 - age / this.traceTtlSeconds),
    };
  }

  snapshot(): AiWorldTrace[] {
    return this.traces.map(copyTrace);
  }

  private prune(nowSeconds: number): void {
    for (let i = this.traces.length - 1; i >= 0; i--) {
      if (this.traces[i].expiresAt <= nowSeconds) this.traces.splice(i, 1);
    }
  }
}

export function worldTraceKindForItem(item: DroppedItemSemantic, reasonLineIds: readonly string[]): AiWorldTraceKind | null {
  const tags = new Set([...item.itemTags, ...item.smellTags, ...item.dangerTags, ...item.valueSignals]);
  if (
    reasonLineIds.some(isSingularityLineId)
    || tags.has('singularity')
    || tags.has('unknownPower')
    || tags.has('rareCuriosity')
  ) return 'singularity';
  if (tags.has('cursed') || tags.has('undead') || tags.has('grave')) return 'cursed';
  if (tags.has('food') || tags.has('meat') || tags.has('fish') || tags.has('freshBread')) return 'food';
  if (tags.has('valuable') || tags.has('coin') || tags.has('gear') || tags.has('metal')) return 'valuable';
  return reasonLineIds.length > 0 ? 'generic' : null;
}

export function worldTraceLineId(kind: AiWorldTraceKind): AiWorldTraceLineId {
  switch (kind) {
    case 'singularity': return 'hudChrome.aiSpeech.sceneTraceSingularity';
    case 'cursed': return 'hudChrome.aiSpeech.sceneTraceCursed';
    case 'food': return 'hudChrome.aiSpeech.sceneTraceFood';
    case 'valuable': return 'hudChrome.aiSpeech.sceneTraceValuable';
    case 'generic': return 'hudChrome.aiSpeech.sceneTraceGeneric';
  }
}

function copyTrace(trace: AiWorldTrace): AiWorldTrace {
  return { ...trace, reasonLineIds: [...trace.reasonLineIds] };
}
