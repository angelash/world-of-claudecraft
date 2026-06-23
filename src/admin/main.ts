import { apiGet, apiLogin, apiPost, clearSession, getAdminName, getToken, ApiError } from './api';
import { barChart, chartPanel } from './charts';
import { escapeHtml, fmtBytes, fmtDate, fmtDuration } from './format';
import {
  classLabel, t, localizeAdminError, ensureAdminLocaleLoaded,
  adminLanguage, adminLanguageTag, setAdminLanguage,
} from './i18n';
import {
  renderAccountDetail, renderAccountsTable, renderCharactersTable, renderChatFilter,
  renderAiAuditRecordDetail, renderAiLifeLayerMetrics, renderModerationDetail, renderModerationQueue,
  renderOnlineTable, renderPager, renderProviderUsage,
} from './tables';
import type { AiLifeLayerTab } from './tables';
import type {
  AccountDetail, AccountRow, Activity, CharacterRow, ChatFilterData, LivePlayer,
  AiAuditCleanupResult, AiAuditRecord, AiVolatileMemoryClearResult, ModerationAccountDetail, ModerationQueueRow, Overview, Paginated,
} from './types';

const LIVE_REFRESH_MS = 5_000;
const ACTIVITY_REFRESH_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 300;

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
};

const renderedHtmlById = new Map<string, string>();
const renderedHtmlByElement = new WeakMap<HTMLElement, string>();

function setHtmlIfChanged(id: string, html: string): void {
  const el = $(id);
  if (renderedHtmlById.get(id) === html) return;
  renderedHtmlById.set(id, html);
  el.innerHTML = html;
}

function setElementHtmlIfChanged(el: HTMLElement, html: string): void {
  if (renderedHtmlByElement.get(el) === html) return;
  renderedHtmlByElement.set(el, html);
  el.innerHTML = html;
}

function isAiLifeLayerTab(value: string | undefined): value is AiLifeLayerTab {
  return value === 'audit'
    || value === 'active'
    || value === 'usage'
    || value === 'coverage'
    || value === 'profiles'
    || value === 'diagnostics'
    || value === 'details';
}

interface TableState {
  page: number;
  search: string;
  sort: string;
  dir: 'asc' | 'desc';
}

const accountsState: TableState = { page: 1, search: '', sort: 'id', dir: 'desc' };
const charactersState: TableState = { page: 1, search: '', sort: 'level', dir: 'desc' };
let liveTimer: number | null = null;
let activityTimer: number | null = null;
type AdminPage = 'overview' | 'usage' | 'moderation' | 'chat-filter';
let activePage: AdminPage = 'overview';
let pendingModerationAction: { endpoint: string; body: unknown; accountId: number; source: 'account' | 'moderation' } | null = null;
let selectedAiAuditId: string | null = null;
let activeAiTab: AiLifeLayerTab = 'audit';
let loadedAiAuditDetailId: string | null = null;
let loadedAiAuditDetailHtml = '';
let loadingAiAuditDetailId: string | null = null;

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

function showLogin(message = ''): void {
  if (liveTimer !== null) { clearInterval(liveTimer); liveTimer = null; }
  if (activityTimer !== null) { clearInterval(activityTimer); activityTimer = null; }
  clearSession();
  selectedAiAuditId = null;
  activeAiTab = 'audit';
  clearAiAuditDetailCache();
  $('app').classList.remove('authed');
  $('login').style.display = 'flex';
  $('login-error').textContent = message;
}

function handleAuthFailure(err: unknown): boolean {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    showLogin(t('auth.sessionExpired'));
    return true;
  }
  return false;
}

function clearAiAuditDetailCache(): void {
  loadedAiAuditDetailId = null;
  loadedAiAuditDetailHtml = '';
  loadingAiAuditDetailId = null;
}

function syncAiAuditSelection(): void {
  document.querySelectorAll<HTMLButtonElement>('.ai-audit-card[data-ai-audit-id]').forEach((card) => {
    const selected = !!selectedAiAuditId && card.dataset.aiAuditId === selectedAiAuditId;
    card.classList.toggle('active', selected);
    card.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function restoreAiAuditDetailIfCached(): boolean {
  const target = document.getElementById('ai-audit-detail');
  if (!target || !selectedAiAuditId) return false;
  if (loadedAiAuditDetailId !== selectedAiAuditId || !loadedAiAuditDetailHtml) return false;
  setElementHtmlIfChanged(target, loadedAiAuditDetailHtml);
  return true;
}

function setActiveAiTab(tab: AiLifeLayerTab): void {
  activeAiTab = tab;
  document.querySelectorAll<HTMLButtonElement>('#ai-usage [data-ai-tab]').forEach((button) => {
    const selected = button.dataset.aiTab === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>('#ai-usage [data-ai-tab-panel]').forEach((panel) => {
    const selected = panel.dataset.aiTabPanel === tab;
    panel.classList.toggle('active', selected);
    panel.hidden = !selected;
  });
  if (tab === 'audit') {
    syncAiAuditSelection();
    if (!restoreAiAuditDetailIfCached() && selectedAiAuditId && loadingAiAuditDetailId !== selectedAiAuditId) {
      void loadAiAuditDetail(selectedAiAuditId);
    }
  }
}

async function showApp(): Promise<void> {
  $('login').style.display = 'none';
  $('app').classList.add('authed');
  $('who-name').textContent = getAdminName();
  await refreshLive();
  await Promise.all([refreshActivity(), refreshModeration(), refreshAccounts(), refreshCharacters()]);
  liveTimer = window.setInterval(() => void refreshLive(), LIVE_REFRESH_MS);
  activityTimer = window.setInterval(() => void refreshActivity(), ACTIVITY_REFRESH_MS);
}

async function refreshModeration(): Promise<void> {
  try {
    const data = await apiGet<{ rows: ModerationQueueRow[] }>('/admin/api/moderation/queue');
    setHtmlIfChanged('moderation', renderModerationQueue(data.rows));
  } catch (err) {
    if (!handleAuthFailure(err)) setHtmlIfChanged('moderation', `<div class="empty">${t('moderation.loadFailed')}</div>`);
  }
}

function showPage(page: AdminPage): void {
  activePage = page;
  document.querySelectorAll<HTMLButtonElement>('.admin-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.adminPage === page);
  });
  document.querySelectorAll<HTMLElement>('.admin-page').forEach((el) => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });
  if (page === 'moderation') void refreshModeration();
  if (page === 'chat-filter') void refreshChatFilter();
}

function syncLanguageControls(): void {
  document.querySelectorAll<HTMLSelectElement>('[data-admin-lang-select]').forEach((select) => {
    select.value = adminLanguage();
  });
}

function persistAdminLanguage(lang: string): void {
  try {
    localStorage.setItem('locale', lang);
  } catch {
    // Storage may be disabled in private browsing or test environments.
  }
}

async function refreshLocalizedAdminPanels(): Promise<void> {
  if (!$('app').classList.contains('authed')) return;
  await refreshLive();
  if (activePage === 'overview') {
    await Promise.all([refreshActivity(), refreshAccounts(), refreshCharacters()]);
  } else if (activePage === 'moderation') {
    await refreshModeration();
  } else if (activePage === 'chat-filter') {
    await refreshChatFilter();
  }
}

async function applyAdminLanguage(lang: string): Promise<void> {
  if (lang === adminLanguage()) {
    syncLanguageControls();
    return;
  }
  await ensureAdminLocaleLoaded(lang);
  setAdminLanguage(lang);
  if (adminLanguage() !== lang) {
    syncLanguageControls();
    return;
  }
  persistAdminLanguage(lang);
  clearAiAuditDetailCache();
  localizeStatic();
  await refreshLocalizedAdminPanels();
}

async function refreshChatFilter(): Promise<void> {
  try {
    const data = await apiGet<ChatFilterData>('/admin/api/chat-filter');
    setHtmlIfChanged('chat-filter', renderChatFilter(data));
  } catch (err) {
    if (!handleAuthFailure(err)) setHtmlIfChanged('chat-filter', `<div class="empty">${t('chatFilter.loadFailed')}</div>`);
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function statCard(value: string, label: string): string {
  return `<div class="panel stat"><div class="v">${escapeHtml(value)}</div><div class="k">${escapeHtml(label)}</div></div>`;
}

async function refreshLive(): Promise<void> {
  try {
    const [overview, online] = await Promise.all([
      apiGet<Overview>('/admin/api/overview'),
      apiGet<{ players: LivePlayer[] }>('/admin/api/online'),
    ]);
    const s = overview.server;
    setHtmlIfChanged('stats', [
      statCard(String(s.online), t('stats.onlineNow')),
      statCard(String(s.peakOnline), t('stats.peakOnline')),
      statCard(String(overview.accounts), t('stats.accounts')),
      statCard(String(overview.characters), t('stats.characters')),
      statCard(String(overview.accountsToday), t('stats.newAccounts24h')),
      statCard(String(overview.activeAccountsToday), t('stats.activeAccounts24h')),
      statCard(String(overview.sessionsToday), t('stats.sessions24h')),
      statCard(fmtDuration(s.uptimeSeconds), t('stats.uptime')),
      statCard(`${s.tickMsAvg} ms`, t('stats.avgTick')),
      statCard(fmtBytes(s.rssBytes), t('stats.serverRss')),
    ].join(''));
    setHtmlIfChanged('ai-usage', renderAiLifeLayerMetrics(
      overview.ai,
      overview.aiCoverage,
      overview.aiDiagnostics,
      overview.aiProfiles,
      overview.aiAudit,
      overview.aiActive,
      activeAiTab,
      selectedAiAuditId,
    ));
    if (activeAiTab === 'audit' && selectedAiAuditId && document.getElementById('ai-audit-detail')) {
      syncAiAuditSelection();
      if (!restoreAiAuditDetailIfCached() && loadingAiAuditDetailId !== selectedAiAuditId) {
        void loadAiAuditDetail(selectedAiAuditId);
      }
    }
    setHtmlIfChanged('usage', renderProviderUsage(overview.usage));
    setHtmlIfChanged('online', renderOnlineTable(online.players));
  } catch (err) {
    if (!handleAuthFailure(err)) console.error('live refresh failed:', err);
  }
}

async function clearAiMemory(): Promise<void> {
  if (!window.confirm(t('usage.aiClearConfirm'))) return;
  try {
    const result = await apiPost<AiVolatileMemoryClearResult>('/admin/api/ai/memory/clear', {});
    await refreshLive();
    window.alert(t('usage.aiClearSuccess', {
      count: result.totalCleared,
      persisted: result.persistedMemoryRecords,
    }));
  } catch (err) {
    if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('usage.aiClearFailed'));
  }
}

async function loadAiAuditDetail(auditId: string): Promise<void> {
  const target = document.getElementById('ai-audit-detail');
  if (!target) return;
  selectedAiAuditId = auditId;
  syncAiAuditSelection();
  if (loadedAiAuditDetailId === auditId && loadedAiAuditDetailHtml) {
    setElementHtmlIfChanged(target, loadedAiAuditDetailHtml);
    return;
  }
  loadingAiAuditDetailId = auditId;
  setElementHtmlIfChanged(target, `<div class="empty">${t('usage.aiAuditDetailLoading')}</div>`);
  try {
    const record = await apiGet<AiAuditRecord>(`/admin/api/ai/audit/${encodeURIComponent(auditId)}`);
    if (selectedAiAuditId !== auditId) return;
    loadedAiAuditDetailId = auditId;
    loadedAiAuditDetailHtml = renderAiAuditRecordDetail(record);
    const currentTarget = document.getElementById('ai-audit-detail') ?? target;
    setElementHtmlIfChanged(currentTarget, loadedAiAuditDetailHtml);
  } catch (err) {
    if (!handleAuthFailure(err)) {
      const currentTarget = document.getElementById('ai-audit-detail') ?? target;
      setElementHtmlIfChanged(currentTarget, `<div class="empty">${t('usage.aiAuditDetailLoadFailed')}</div>`);
    }
  } finally {
    if (loadingAiAuditDetailId === auditId) loadingAiAuditDetailId = null;
  }
}

async function cleanAiAuditRecords(): Promise<void> {
  if (!window.confirm(t('usage.aiAuditCleanConfirm'))) return;
  try {
    const result = await apiPost<AiAuditCleanupResult>('/admin/api/ai/audit/clean', {});
    selectedAiAuditId = null;
    clearAiAuditDetailCache();
    await refreshLive();
    window.alert(t('usage.aiAuditCleanSuccess', {
      deleted: result.deletedRecords,
      retained: result.retainedRecords,
    }));
  } catch (err) {
    if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('usage.aiAuditCleanFailed'));
  }
}

function activeCheckbox(root: ParentNode, field: string): boolean {
  const input = root.querySelector<HTMLInputElement>(`[data-ai-active-global-field="${field}"], [data-ai-active-rule-field="${field}"]`);
  return Boolean(input?.checked);
}

function activeNumber(root: ParentNode, field: string): number | null {
  const input = root.querySelector<HTMLInputElement>(`[data-ai-active-rule-field="${field}"]`);
  if (!input) return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function activeSelect(root: ParentNode, field: string): string {
  return root.querySelector<HTMLSelectElement>(`[data-ai-active-rule-field="${field}"]`)?.value ?? '';
}

async function saveAiActiveGlobal(): Promise<void> {
  const root = document.querySelector('[data-ai-active-global]');
  if (!root) return;
  try {
    await apiPost('/admin/api/ai/active-triggers/config', {
      enabled: activeCheckbox(root, 'enabled'),
      eventsEnabled: activeCheckbox(root, 'eventsEnabled'),
      pollsEnabled: activeCheckbox(root, 'pollsEnabled'),
      realActionsEnabled: activeCheckbox(root, 'realActionsEnabled'),
    });
    await refreshLive();
    window.alert(t('usage.aiActiveSaveSuccess'));
  } catch (err) {
    if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('usage.aiActiveSaveFailed'));
  }
}

async function saveAiActiveRule(row: HTMLElement): Promise<void> {
  const ruleId = row.dataset.aiActiveRuleId;
  if (!ruleId) return;
  const periodSeconds = activeNumber(row, 'periodSeconds');
  const jitterSeconds = activeNumber(row, 'jitterSeconds');
  const priority = activeNumber(row, 'priority');
  const perPlayerSeconds = activeNumber(row, 'cooldown.perPlayerSeconds');
  const perEntitySeconds = activeNumber(row, 'cooldown.perEntitySeconds');
  if ([periodSeconds, jitterSeconds, priority, perPlayerSeconds, perEntitySeconds].some((value) => value === null)) {
    window.alert(t('usage.aiActiveInvalidNumber'));
    return;
  }
  try {
    await apiPost('/admin/api/ai/active-triggers/config', {
      rules: [{
        ruleId,
        enabled: activeCheckbox(row, 'enabled'),
        periodSeconds,
        jitterSeconds,
        priority,
        providerPolicy: activeSelect(row, 'providerPolicy'),
        outputMode: activeSelect(row, 'outputMode'),
        cooldown: {
          perPlayerSeconds,
          perEntitySeconds,
        },
      }],
    });
    await refreshLive();
    window.alert(t('usage.aiActiveSaveSuccess'));
  } catch (err) {
    if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('usage.aiActiveSaveFailed'));
  }
}

async function refreshActivity(): Promise<void> {
  try {
    const a = await apiGet<Activity>('/admin/api/activity');
    const dayLabel = (day: string) => day.slice(5); // YYYY-MM-DD -> MM-DD
    setHtmlIfChanged('charts', [
      chartPanel(t('charts.registrations', { days: a.days }), barChart(
        a.registrations.map((p) => ({ label: dayLabel(p.day), value: p.count })),
      )),
      chartPanel(t('charts.sessions', { days: a.days }), barChart(
        a.sessions.map((p) => ({
          label: dayLabel(p.day),
          value: p.sessions,
          title: t('charts.sessionsTooltip', { day: p.day, sessions: p.sessions, accounts: p.uniqueAccounts, played: fmtDuration(p.playtimeSeconds) }),
        })),
      )),
      chartPanel(t('charts.classDistribution'), barChart(
        a.classes.map((p) => ({ label: classLabel(p.key), value: p.count })),
      )),
      chartPanel(t('charts.levelDistribution'), barChart(
        a.levels.map((p) => ({ label: p.key, value: p.count })),
      )),
    ].join(''));
  } catch (err) {
    if (!handleAuthFailure(err)) console.error('activity refresh failed:', err);
  }
}

async function refreshAccounts(): Promise<void> {
  try {
    const params = new URLSearchParams({ page: String(accountsState.page), search: accountsState.search });
    const data = await apiGet<Paginated<AccountRow>>(`/admin/api/accounts?${params}`);
    setHtmlIfChanged('accounts', renderAccountsTable(data.rows));
    setHtmlIfChanged('accounts-pager', renderPager(data.total, data.page, data.limit));
  } catch (err) {
    if (!handleAuthFailure(err)) setHtmlIfChanged('accounts', `<div class="empty">${t('accounts.loadFailed')}</div>`);
  }
}

async function refreshCharacters(): Promise<void> {
  try {
    const params = new URLSearchParams({
      page: String(charactersState.page), sort: charactersState.sort, dir: charactersState.dir,
    });
    const data = await apiGet<Paginated<CharacterRow>>(`/admin/api/characters?${params}`);
    setHtmlIfChanged('characters', renderCharactersTable(data.rows, charactersState.sort, charactersState.dir));
    setHtmlIfChanged('characters-pager', renderPager(data.total, data.page, data.limit));
  } catch (err) {
    if (!handleAuthFailure(err)) setHtmlIfChanged('characters', `<div class="empty">${t('characters.loadFailed')}</div>`);
  }
}

async function toggleAccountDetail(row: HTMLTableRowElement, accountId: number): Promise<void> {
  const existing = row.nextElementSibling;
  if (existing?.classList.contains('detail-row')) {
    existing.remove();
    return;
  }
  row.parentElement?.querySelectorAll('.detail-row').forEach((el) => el.remove());
  try {
    const detail = await apiGet<AccountDetail>(`/admin/api/accounts/${accountId}`);
    const detailRow = document.createElement('tr');
    detailRow.className = 'detail-row';
    detailRow.innerHTML = `<td colspan="7">${renderAccountDetail(detail, true)}</td>`;
    row.after(detailRow);
  } catch (err) {
    if (!handleAuthFailure(err)) console.error('account detail failed:', err);
  }
}

async function refreshOpenAccountDetail(accountId: number): Promise<void> {
  const row = document.querySelector<HTMLTableRowElement>(`#accounts tr.clickable[data-account-id="${CSS.escape(String(accountId))}"]`);
  const detailRow = row?.nextElementSibling;
  if (!row || !detailRow?.classList.contains('detail-row')) return;
  try {
    const detail = await apiGet<AccountDetail>(`/admin/api/accounts/${accountId}`);
    setElementHtmlIfChanged(detailRow as HTMLElement, `<td colspan="7">${renderAccountDetail(detail, true)}</td>`);
  } catch (err) {
    if (!handleAuthFailure(err)) console.error('account detail refresh failed:', err);
  }
}

async function openModerationAccount(accountId: number): Promise<void> {
  $('moderation-detail').innerHTML = `<div class="empty">${t('report.loading')}</div>`;
  try {
    const detail = await apiGet<ModerationAccountDetail>(`/admin/api/moderation/accounts/${accountId}`);
    $('moderation-detail').innerHTML = renderModerationDetail(detail);
  } catch (err) {
    if (!handleAuthFailure(err)) $('moderation-detail').innerHTML = `<div class="empty">${t('report.loadFailed')}</div>`;
  }
}

function showModerationConfirm(opts: {
  title: string;
  rows: { label: string; value: string }[];
  endpoint: string;
  body: unknown;
  accountId: number;
  source: 'account' | 'moderation';
  confirmEl: HTMLElement;
  danger?: boolean;
}): void {
  pendingModerationAction = { endpoint: opts.endpoint, body: opts.body, accountId: opts.accountId, source: opts.source };
  const el = opts.confirmEl;
  el.className = `mod-confirm show${el.classList.contains('account-mod-confirm') ? ' account-mod-confirm' : ''}`;
  el.innerHTML = `
    <h4>${escapeHtml(opts.title)}</h4>
    <dl>${opts.rows.map((r) => `<dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd>`).join('')}</dl>
    <div class="confirm-actions">
      <button data-confirm-moderation ${opts.danger ? 'class="danger"' : ''}>${t('dialog.confirm')}</button>
      <button data-cancel-moderation>${t('dialog.cancel')}</button>
    </div>`;
  el.scrollIntoView({ block: 'nearest' });
}

function moderationReasonInput(target: HTMLElement): HTMLInputElement | null {
  const detailRow = target.closest('.detail-row');
  return (detailRow?.querySelector('.account-mod-reason') as HTMLInputElement | null) ??
    ($('mod-reason') as HTMLInputElement | null);
}

function moderationCustomExpiryInput(target: HTMLElement): HTMLInputElement | null {
  const detailRow = target.closest('.detail-row');
  return (detailRow?.querySelector('.account-custom-expiry') as HTMLInputElement | null) ??
    ($('mod-custom-expiry') as HTMLInputElement | null);
}

function moderationConfirmEl(target: HTMLElement): HTMLElement {
  const detailRow = target.closest('.detail-row');
  return (detailRow?.querySelector('.account-mod-confirm') as HTMLElement | null) ?? $('mod-confirm');
}

async function finishModerationAction(): Promise<void> {
  const pending = pendingModerationAction;
  if (!pending) return;
  await apiPost(pending.endpoint, pending.body);
  pendingModerationAction = null;
  void refreshAccounts();
  void refreshModeration();
  if (pending.source === 'account' && Number.isFinite(pending.accountId)) {
    await refreshOpenAccountDetail(pending.accountId);
  } else {
    await openModerationAccount(pending.accountId);
  }
}

function handleModerationActionClick(e: Event, source: 'account' | 'moderation'): boolean {
  const target = e.target as HTMLElement;
  const confirmEl = moderationConfirmEl(target);
  if (target.closest('[data-cancel-moderation]')) {
    pendingModerationAction = null;
    confirmEl.className = `mod-confirm${confirmEl.classList.contains('account-mod-confirm') ? ' account-mod-confirm' : ''}`;
    confirmEl.innerHTML = '';
    return true;
  }
  if (target.closest('[data-confirm-moderation]')) {
    void finishModerationAction()
      .catch((err: unknown) => { if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('alert.actionFailed')); });
    return true;
  }
  const actionWrap = target.closest('[data-action-account-id]') as HTMLElement | null;
  const detailWrap = target.closest('.mod-detail') as HTMLElement | null;
  const accountId = Number((actionWrap ?? detailWrap?.querySelector('[data-action-account-id]') as HTMLElement | null)?.dataset.actionAccountId);
  const note = (moderationReasonInput(target)?.value ?? '').trim();
  const requireNote = (): boolean => {
    if (note) return true;
    window.alert(t('alert.noteRequired'));
    return false;
  };
  // Lift mute / reset strikes: non-destructive, no note/confirm. Available for
  // any account (incl. admins) so an auto-muted operator can clear it themselves.
  const chatModBtn = target.closest('button[data-lift-mute], button[data-reset-strikes]') as HTMLButtonElement | null;
  if (chatModBtn && Number.isFinite(accountId)) {
    const endpoint = chatModBtn.dataset.liftMute !== undefined ? 'lift-mute' : 'reset-strikes';
    void apiPost(`/admin/api/moderation/accounts/${accountId}/${endpoint}`, {})
      .then(() => { if (source === 'account') void refreshOpenAccountDetail(accountId); else void openModerationAccount(accountId); })
      .catch((err: unknown) => { if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('alert.actionFailed')); });
    return true;
  }
  const forceRenameBtn = target.closest('button[data-force-rename-character]') as HTMLButtonElement | null;
  if (forceRenameBtn) {
    if (!requireNote()) return true;
    const characterId = Number(forceRenameBtn.dataset.forceRenameCharacter);
    const characterName = forceRenameBtn.dataset.characterName ?? `#${characterId}`;
    showModerationConfirm({
      title: t('dialog.confirmForceName'),
      rows: [
        { label: t('dialog.character'), value: characterName },
        { label: t('dialog.action'), value: t('dialog.actionForceName') },
        { label: t('dialog.reason'), value: note },
      ],
      endpoint: `/admin/api/moderation/characters/${characterId}/force-rename`,
      body: { reason: note },
      accountId,
      source,
      confirmEl,
    });
    return true;
  }
  if (!actionWrap) return false;
  const suspendBtn = target.closest('button[data-suspend-hours]') as HTMLButtonElement | null;
  if (suspendBtn) {
    if (!requireNote()) return true;
    const hours = Number(suspendBtn.dataset.suspendHours);
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    showModerationConfirm({
      title: t('dialog.confirmSuspension'),
      rows: [
        { label: t('dialog.account'), value: `#${accountId}` },
        { label: t('dialog.action'), value: t('dialog.actionSuspend') },
        { label: t('dialog.length'), value: t('detail.lengthHours', { count: hours }) },
        { label: t('dialog.until'), value: fmtDate(expiresAt) },
        { label: t('dialog.reason'), value: note },
      ],
      endpoint: `/admin/api/moderation/accounts/${accountId}/suspend`,
      body: { reason: note, expiresAt },
      accountId,
      source,
      confirmEl,
    });
    return true;
  }
  const customSuspend = target.closest('button[data-suspend-custom]') as HTMLButtonElement | null;
  if (customSuspend) {
    if (!requireNote()) return true;
    const raw = moderationCustomExpiryInput(target)?.value ?? '';
    const expiry = raw ? new Date(raw) : null;
    if (!expiry || !Number.isFinite(expiry.getTime())) {
      window.alert(t('alert.customExpiryRequired'));
      return true;
    }
    if (expiry.getTime() <= Date.now()) {
      window.alert(t('alert.customExpiryFuture'));
      return true;
    }
    showModerationConfirm({
      title: t('dialog.confirmCustomSuspension'),
      rows: [
        { label: t('dialog.account'), value: `#${accountId}` },
        { label: t('dialog.action'), value: t('dialog.actionSuspend') },
        { label: t('dialog.until'), value: fmtDate(expiry.toISOString()) },
        { label: t('dialog.reason'), value: note },
      ],
      endpoint: `/admin/api/moderation/accounts/${accountId}/suspend`,
      body: { reason: note, expiresAt: expiry.toISOString() },
      accountId,
      source,
      confirmEl,
    });
    return true;
  }
  const chatMuteBtn = target.closest('button[data-chat-mute-hours]') as HTMLButtonElement | null;
  if (chatMuteBtn) {
    if (!requireNote()) return true;
    const hours = Number(chatMuteBtn.dataset.chatMuteHours);
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    showModerationConfirm({
      title: t('dialog.confirmChatMute'),
      rows: [
        { label: t('dialog.account'), value: `#${accountId}` },
        { label: t('dialog.action'), value: t('dialog.actionChatMute') },
        { label: t('dialog.length'), value: t('detail.lengthHours', { count: hours }) },
        { label: t('dialog.until'), value: fmtDate(expiresAt) },
        { label: t('dialog.reason'), value: note },
      ],
      endpoint: `/admin/api/moderation/accounts/${accountId}/chat-mute`,
      body: { reason: note, expiresAt },
      accountId,
      source,
      confirmEl,
    });
    return true;
  }
  const customChatMute = target.closest('button[data-chat-mute-custom]') as HTMLButtonElement | null;
  if (customChatMute) {
    if (!requireNote()) return true;
    const raw = moderationCustomExpiryInput(target)?.value ?? '';
    const expiry = raw ? new Date(raw) : null;
    if (!expiry || !Number.isFinite(expiry.getTime())) {
      window.alert(t('alert.customChatMuteRequired'));
      return true;
    }
    showModerationConfirm({
      title: t('dialog.confirmCustomChatMute'),
      rows: [
        { label: t('dialog.account'), value: `#${accountId}` },
        { label: t('dialog.action'), value: t('dialog.actionChatMute') },
        { label: t('dialog.until'), value: fmtDate(expiry.toISOString()) },
        { label: t('dialog.reason'), value: note },
      ],
      endpoint: `/admin/api/moderation/accounts/${accountId}/chat-mute`,
      body: { reason: note, expiresAt: expiry.toISOString() },
      accountId,
      source,
      confirmEl,
    });
    return true;
  }
  const banBtn = target.closest('button[data-ban-account]') as HTMLButtonElement | null;
  if (banBtn) {
    if (!requireNote()) return true;
    showModerationConfirm({
      title: t('dialog.confirmBan'),
      rows: [
        { label: t('dialog.account'), value: `#${accountId}` },
        { label: t('dialog.action'), value: t('dialog.actionBan') },
        { label: t('dialog.reason'), value: note },
      ],
      endpoint: `/admin/api/moderation/accounts/${accountId}/ban`,
      body: { reason: note },
      accountId,
      source,
      confirmEl,
      danger: true,
    });
    return true;
  }
  const unbanBtn = target.closest('button[data-unban-account]') as HTMLButtonElement | null;
  if (unbanBtn) {
    if (!requireNote()) return true;
    showModerationConfirm({
      title: t('dialog.confirmUnban'),
      rows: [
        { label: t('dialog.account'), value: `#${accountId}` },
        { label: t('dialog.action'), value: t('dialog.actionUnban') },
        { label: t('dialog.reason'), value: note },
      ],
      endpoint: `/admin/api/moderation/accounts/${accountId}/unban`,
      body: { reason: note },
      accountId,
      source,
      confirmEl,
    });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function wireEvents(): void {
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = ($('login-username') as HTMLInputElement).value.trim();
    const password = ($('login-password') as HTMLInputElement).value;
    $('login-error').textContent = '';
    apiLogin(username, password)
      .then(() => showApp())
      .catch((err: unknown) => {
        $('login-error').textContent = err instanceof ApiError ? localizeAdminError(err.message) : t('auth.loginFailed');
      });
  });

  $('logout').addEventListener('click', () => showLogin());

  document.querySelectorAll<HTMLSelectElement>('[data-admin-lang-select]').forEach((select) => {
    select.addEventListener('change', () => {
      void applyAdminLanguage(select.value);
    });
  });

  $('admin-tabs').addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('.admin-tab');
    const page = tab?.dataset.adminPage;
    if (page === 'overview' || page === 'usage' || page === 'moderation' || page === 'chat-filter') showPage(page);
  });

  wireChatFilterEvents();

  $('ai-usage').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const aiTabButton = target.closest<HTMLButtonElement>('button[data-ai-tab]');
    if (aiTabButton && isAiLifeLayerTab(aiTabButton.dataset.aiTab)) {
      setActiveAiTab(aiTabButton.dataset.aiTab);
      return;
    }
    const clearButton = target.closest('button[data-clear-ai-memory]');
    if (clearButton) {
      void clearAiMemory();
      return;
    }
    const cleanButton = target.closest('button[data-clean-ai-audit]');
    if (cleanButton) {
      void cleanAiAuditRecords();
      return;
    }
    const saveActiveGlobal = target.closest('button[data-save-ai-active-global]');
    if (saveActiveGlobal) {
      void saveAiActiveGlobal();
      return;
    }
    const saveActiveRule = target.closest('button[data-save-ai-active-rule]');
    if (saveActiveRule) {
      const row = saveActiveRule.closest<HTMLElement>('[data-ai-active-rule-id]');
      if (row) void saveAiActiveRule(row);
      return;
    }
    const auditCard = target.closest<HTMLButtonElement>('.ai-audit-card[data-ai-audit-id]');
    const auditId = auditCard?.dataset.aiAuditId ?? '';
    if (auditId) void loadAiAuditDetail(auditId);
  });

  $('ai-usage').addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const current = target.closest<HTMLButtonElement>('button[data-ai-tab]');
    if (!current) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('#ai-usage button[data-ai-tab]'))
      .filter((button) => isAiLifeLayerTab(button.dataset.aiTab));
    const currentIndex = tabs.indexOf(current);
    if (currentIndex < 0 || tabs.length === 0) return;
    e.preventDefault();
    const nextIndex = e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (next && isAiLifeLayerTab(next.dataset.aiTab)) {
      next.focus();
      setActiveAiTab(next.dataset.aiTab);
    }
  });

  let searchTimer: number | null = null;
  $('account-search').addEventListener('input', (e) => {
    accountsState.search = (e.target as HTMLInputElement).value.trim();
    accountsState.page = 1;
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void refreshAccounts(), SEARCH_DEBOUNCE_MS);
  });

  $('accounts-pager').addEventListener('click', (e) => {
    const page = pagerTarget(e);
    if (page !== null) { accountsState.page = page; void refreshAccounts(); }
  });

  $('characters-pager').addEventListener('click', (e) => {
    const page = pagerTarget(e);
    if (page !== null) { charactersState.page = page; void refreshCharacters(); }
  });

  $('accounts').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const isAccountModClick = target.closest('.account-admin-controls, .account-mod-confirm, button[data-force-rename-character]');
    if (isAccountModClick && handleModerationActionClick(e, 'account')) {
      e.stopPropagation();
      return;
    }
    const row = target.closest('tr.clickable') as HTMLTableRowElement | null;
    const accountId = Number(row?.dataset.accountId);
    if (row && Number.isFinite(accountId)) void toggleAccountDetail(row, accountId);
  });

  $('moderation').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('tr[data-moderation-account-id]') as HTMLTableRowElement | null;
    const accountId = Number(row?.dataset.moderationAccountId);
    if (row && Number.isFinite(accountId)) void openModerationAccount(accountId);
  });

  $('moderation-detail').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const chatModBtn = target.closest('button[data-lift-mute], button[data-reset-strikes]') as HTMLButtonElement | null;
    if (chatModBtn) {
      const accountId = Number((target.closest('.mod-detail')?.querySelector('[data-action-account-id]') as HTMLElement | null)?.dataset.actionAccountId);
      const endpoint = chatModBtn.dataset.liftMute !== undefined ? 'lift-mute' : 'reset-strikes';
      void apiPost(`/admin/api/moderation/accounts/${accountId}/${endpoint}`, {})
        .then(() => { if (Number.isFinite(accountId)) void openModerationAccount(accountId); })
        .catch((err: unknown) => { if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('alert.actionFailed')); });
      return;
    }
    const ignoreBtn = target.closest('button[data-ignore-report]') as HTMLButtonElement | null;
    if (ignoreBtn) {
      const reportId = Number(ignoreBtn.dataset.ignoreReport);
      const note = (($('mod-reason') as HTMLInputElement | null)?.value ?? '').trim();
      void apiPost(`/admin/api/moderation/reports/${reportId}/ignore`, { note })
        .then(() => {
          const accountId = Number((ignoreBtn.closest('.mod-detail')?.querySelector('[data-action-account-id]') as HTMLElement | null)?.dataset.actionAccountId);
          void refreshModeration();
          if (Number.isFinite(accountId)) void openModerationAccount(accountId);
        })
        .catch((err: unknown) => { if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t('alert.actionFailed')); });
      return;
    }
    handleModerationActionClick(e, 'moderation');
  });

  $('characters').addEventListener('click', (e) => {
    const th = (e.target as HTMLElement).closest('th.sortable') as HTMLElement | null;
    const sort = th?.dataset.sort;
    if (!sort) return;
    charactersState.dir = charactersState.sort === sort && charactersState.dir === 'desc' ? 'asc' : 'desc';
    charactersState.sort = sort;
    charactersState.page = 1;
    void refreshCharacters();
  });
}

function chatFilterError(err: unknown, fallbackKey: string): void {
  if (!handleAuthFailure(err)) window.alert(err instanceof Error ? localizeAdminError(err.message) : t(fallbackKey));
}

function wireChatFilterEvents(): void {
  // Add a word: the per-tier form submits (Enter or the Add button).
  $('chat-filter').addEventListener('submit', (e) => {
    const form = (e.target as HTMLElement).closest('form.word-add') as HTMLFormElement | null;
    if (!form) return;
    e.preventDefault();
    const tier = form.dataset.addTier;
    const input = form.querySelector('input') as HTMLInputElement | null;
    const word = (input?.value ?? '').trim();
    if (!word || (tier !== 'soft' && tier !== 'hard')) return;
    void apiPost('/admin/api/chat-filter/words', { word, tier })
      .then(() => refreshChatFilter())
      .catch((err: unknown) => chatFilterError(err, 'alert.addWordFailed'));
  });

  // Remove a word, save the escalation config, or lift/reset an account's chat mute.
  $('chat-filter').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const chatModBtn = target.closest('button[data-lift-mute], button[data-reset-strikes]') as HTMLButtonElement | null;
    if (chatModBtn) {
      const accountId = Number((chatModBtn.closest('[data-action-account-id]') as HTMLElement | null)?.dataset.actionAccountId);
      if (!Number.isFinite(accountId)) return;
      const endpoint = chatModBtn.dataset.liftMute !== undefined ? 'lift-mute' : 'reset-strikes';
      void apiPost(`/admin/api/moderation/accounts/${accountId}/${endpoint}`, {})
        .then(() => refreshChatFilter())
        .catch((err: unknown) => chatFilterError(err, 'chat moderation'));
      return;
    }
    const del = target.closest('button[data-del-word]') as HTMLButtonElement | null;
    if (del) {
      void apiPost(`/admin/api/chat-filter/words/${Number(del.dataset.delWord)}/delete`, {})
        .then(() => refreshChatFilter())
        .catch((err: unknown) => chatFilterError(err, 'alert.removeWordFailed'));
      return;
    }
    if (target.closest('button[data-save-config]')) {
      const warningsBeforeMute = Number(($('cf-warnings') as HTMLInputElement).value);
      const muteLadderSeconds = ($('cf-ladder') as HTMLInputElement).value
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      void apiPost('/admin/api/chat-filter/config', { warningsBeforeMute, muteLadderSeconds })
        .then(() => refreshChatFilter())
        .catch((err: unknown) => chatFilterError(err, 'alert.saveConfigFailed'));
    }
  });
}

function pagerTarget(e: Event): number | null {
  const btn = (e.target as HTMLElement).closest('button[data-page]') as HTMLButtonElement | null;
  if (!btn || btn.disabled) return null;
  const page = Number(btn.dataset.page);
  return Number.isFinite(page) && page >= 1 ? page : null;
}

function localizeStatic(): void {
  document.documentElement.lang = adminLanguageTag();
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const key = el.getAttribute('data-i18n-ph');
    if (key) (el as HTMLInputElement).placeholder = t(key);
  });
  syncLanguageControls();
}

// Async locale loader (parity seam): await the active locale before painting the static
// admin UI. Admin keeps every locale static, so this resolves instantly; the await mirrors
// the game client's bootstrap shape without flipping admin to lazy.
void (async () => {
  await ensureAdminLocaleLoaded(adminLanguage());
  localizeStatic();
  wireEvents();
  if (getToken()) {
    void showApp();
  } else {
    showLogin();
  }
})();
