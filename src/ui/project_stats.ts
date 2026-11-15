import { formatNumber } from './i18n';

export interface ProjectStats {
  accounts_created: number;
  characters_created: number;
  players_online: number;
  realm: string;
}

export const STATS_CACHE_KEY = 'woc_cached_stats_online_v2';
export const STATS_CACHE_TTL_MS = 30000;
const STATS_REFRESH_INTERVAL_MS = STATS_CACHE_TTL_MS;
let projectStatsPollTimer: number | null = null;
let projectStatsInflight: Promise<void> | null = null;

export async function loadProjectStats(fetchStats: () => Promise<ProjectStats>): Promise<void> {
  // Realm stats can appear in more than one fork or upstream shell mount.
  const onlineEls = document.querySelectorAll<HTMLElement>('.js-stat-online');
  const accountEls = document.querySelectorAll<HTMLElement>('.js-stat-accounts');
  const characterEls = document.querySelectorAll<HTMLElement>('.js-stat-characters');
  if (!onlineEls.length && !accountEls.length && !characterEls.length) return;

  const setAll = (els: NodeListOf<HTMLElement>, text: string): void => {
    els.forEach((el) => {
      el.textContent = text;
    });
  };
  const statText = (value: number | undefined): string =>
    value !== undefined && Number.isFinite(value)
      ? formatNumber(value, { maximumFractionDigits: 0 })
      : '-';

  if (projectStatsInflight) return projectStatsInflight;
  projectStatsInflight = (async () => {
    let cached: {
      realm: string;
      accounts_created: number;
      characters_created?: number;
      players_online: number;
      timestamp: number;
    } | null = null;

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STATS_CACHE_KEY);
        if (raw) {
          cached = JSON.parse(raw);
        }
      } catch {
        cached = null;
      }
    }

    setAll(onlineEls, statText(cached?.players_online));
    setAll(accountEls, statText(cached?.accounts_created));
    setAll(characterEls, statText(cached?.characters_created));

    // Fetch fresh stats even when a cache exists so an already-open page
    // doesn't keep showing a stale population number forever.
    try {
      const data = await fetchStats();

      setAll(onlineEls, statText(data.players_online));
      setAll(accountEls, statText(data.accounts_created));
      setAll(characterEls, statText(data.characters_created));

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(
            STATS_CACHE_KEY,
            JSON.stringify({
              ...data,
              timestamp: Date.now(),
            }),
          );
        } catch {
          /* private mode / storage quota: fresh stats are still displayed */
        }
      }
    } catch (err) {
      console.error('Failed to fetch project stats:', err);
      // If API fails, keep the cached value (even if stale); otherwise show a dash.
      if (!cached || !Number.isFinite(cached.players_online)) {
        setAll(onlineEls, '-');
      }
      if (!cached || !Number.isFinite(cached.accounts_created)) setAll(accountEls, '-');
      if (!cached || !Number.isFinite(cached.characters_created)) setAll(characterEls, '-');
    }
  })().finally(() => {
    projectStatsInflight = null;
  });

  return projectStatsInflight;
}

export function wireProjectStatsRefresh(fetchStats: () => Promise<ProjectStats>): void {
  if (projectStatsPollTimer !== null) return;
  if (projectStatsPollTimer !== null) window.clearInterval(projectStatsPollTimer);
  projectStatsPollTimer = window.setInterval(() => {
    void loadProjectStats(fetchStats);
  }, STATS_REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadProjectStats(fetchStats);
  });
  window.addEventListener('focus', () => {
    void loadProjectStats(fetchStats);
  });
}
