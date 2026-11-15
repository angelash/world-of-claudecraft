// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLanguage, setLanguage } from '../src/ui/i18n';
import {
  loadProjectStats,
  type ProjectStats,
  STATS_CACHE_KEY,
  STATS_CACHE_TTL_MS,
} from '../src/ui/project_stats';

const stats = (characters: number): ProjectStats => ({
  accounts_created: 1,
  characters_created: characters,
  players_online: 2,
  realm: 'Claudemoon',
});

function counters(): string[] {
  return [...document.querySelectorAll('.js-stat-characters')].map((el) => el.textContent ?? '');
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML =
    '<span class="js-stat-characters">…</span><span class="js-stat-characters">…</span>';
});

describe('loadProjectStats', () => {
  it('formats counters with the selected locale when the document language is stale', async () => {
    const previousLanguage = getLanguage();
    const previousDocumentLanguage = document.documentElement.lang;
    try {
      setLanguage('de_DE');
      document.documentElement.lang = 'en';
      await loadProjectStats(async () => stats(12_345));
      expect(counters()).toEqual(['12.345', '12.345']);
    } finally {
      setLanguage(previousLanguage);
      document.documentElement.lang = previousDocumentLanguage;
    }
  });

  it('shows cached counters while one shared refresh replaces them with fresh values', async () => {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ ...stats(5), timestamp: Date.now() }));
    let resolveStats!: (value: ProjectStats) => void;
    const fetchStats = vi.fn(
      () =>
        new Promise<ProjectStats>((resolve) => {
          resolveStats = resolve;
        }),
    );
    const first = loadProjectStats(fetchStats);
    const second = loadProjectStats(fetchStats);
    expect(fetchStats).toHaveBeenCalledTimes(1);
    expect(counters()).toEqual(['5', '5']);
    resolveStats(stats(9));
    await Promise.all([first, second]);
    expect(counters()).toEqual(['9', '9']);
    expect(JSON.parse(localStorage.getItem(STATS_CACHE_KEY) ?? '{}').characters_created).toBe(9);
  });

  it('fetches past the cache window and caches the answer', async () => {
    localStorage.setItem(
      STATS_CACHE_KEY,
      JSON.stringify({ ...stats(5), timestamp: Date.now() - STATS_CACHE_TTL_MS - 1 }),
    );
    await loadProjectStats(async () => stats(9));
    expect(counters()).toEqual(['9', '9']);
    expect(JSON.parse(localStorage.getItem(STATS_CACHE_KEY) ?? '{}').characters_created).toBe(9);
  });

  it('falls back to a stale entry, then to a dash, when the fetch fails', async () => {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ ...stats(5), timestamp: 0 }));
    await loadProjectStats(async () => Promise.reject(new Error('down')));
    expect(counters()).toEqual(['5', '5']);
    localStorage.clear();
    await loadProjectStats(async () => Promise.reject(new Error('down')));
    expect(counters()).toEqual(['-', '-']);
  });

  it('does nothing on a page without the counter', async () => {
    document.body.innerHTML = '';
    const fetchStats = vi.fn(async () => stats(9));
    await loadProjectStats(fetchStats);
    expect(fetchStats).not.toHaveBeenCalled();
  });
});
