// Client boot configuration. Dev mode exists only in Vite dev builds (on by default there,
// ?dev=0 turns it off); production builds never enable it. Dev-only URL options: ?seed=
// for new games, ?sandbox=1 for the client sandbox world built from the kernel systems
// only, ?hour= to start the sandbox at a later hour, ?lang=qps-wide for the pseudo-locale
// (ux_and_onboarding.md 20.6).

export interface ClientConfig {
  devMode: boolean;
  seed?: number;
  sandbox: boolean;
  startHour?: number;
  /** dev-only interface language override (the pseudo-locale) */
  lang?: string;
}

function num(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseConfig(search: string, viteDev: boolean): ClientConfig {
  const params = new URLSearchParams(search);
  const devMode = viteDev && params.get('dev') !== '0';
  if (!devMode) return { devMode, sandbox: false };
  const seed = num(params.get('seed'));
  const hour = num(params.get('hour'));
  return {
    devMode,
    seed: seed === undefined ? undefined : seed | 0,
    sandbox: params.get('sandbox') === '1',
    startHour: hour === undefined ? undefined : Math.max(0, Math.min(23, hour)),
    lang: params.get('lang') ?? undefined,
  };
}
