// Read-only snapshots for the first-act interaction panels. Commands remain proposals to
// the owning systems; a disabled control never changes or bypasses their verdict.

export interface CourtItemRow {
  id: string;
  name: string;
  count: number;
}

export interface CourtPanelData {
  siteId: string;
  inside: boolean;
  enterable: boolean;
  cooldown: number;
  storage: { used: number; cap: number };
  cases: { id: string; slots: number; used: number }[];
  entries: { id: string; name: string; caseId: string; remaining: number | null }[];
  pack: CourtItemRow[];
  stock: CourtItemRow[];
}

export interface CompanionInteractionData {
  id: string;
  name: string;
  manual: boolean;
  walking: boolean;
  resting: boolean;
}

export interface BanterPanelData {
  id: string;
  line: string;
  remaining: number;
  options: { index: number; label: string }[];
}
