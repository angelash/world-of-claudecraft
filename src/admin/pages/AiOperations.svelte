<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { apiGet, apiPost } from '../api';
  import AmbientBots from '../components/AmbientBots.svelte';
  import Panel from '../components/Panel.svelte';
  import PermissionDenied from '../components/PermissionDenied.svelte';
  import { localizeAdminError, t } from '../i18n';
  import { type AdminLoadFailure, classifyAdminLoadFailure } from '../load_failure';
  import { auth } from '../state/auth.svelte';
  import { LIVE_REFRESH_MS, poll } from '../state/poll';
  import {
    renderAiAuditRecordDetail,
    renderAiLifeLayerMetrics,
    type AiLifeLayerTab,
  } from '../tables';
  import type {
    AiActiveSequenceCancelResult,
    AiAuditCleanupResult,
    AiAuditRecord,
    AiDiagnosticsResponse,
    AiVolatileMemoryClearResult,
    AmbientBotDiagnostics,
  } from '../types';

  const AI_TABS: readonly AiLifeLayerTab[] = [
    'audit',
    'active',
    'usage',
    'coverage',
    'profiles',
    'diagnostics',
    'details',
  ];
  const WRITE_ACTION_SELECTOR = [
    '[data-clear-ai-memory]',
    '[data-clean-ai-audit]',
    '[data-save-ai-active-global]',
    '[data-save-ai-active-rule]',
    '[data-cancel-ai-active-sequences]',
  ].join(',');

  let root = $state<HTMLElement>();
  let diagnostics = $state<AiDiagnosticsResponse | null>(null);
  let ambientBots = $state<AmbientBotDiagnostics | null>(null);
  let aiLoadFailed = $state<AdminLoadFailure>('none');
  let ambientLoadFailed = $state<AdminLoadFailure>('none');
  let activeTab = $state<AiLifeLayerTab>('audit');
  let selectedAuditId = $state<string | null>(null);
  let loadedAuditId = $state<string | null>(null);
  let loadedAuditHtml = $state('');
  let loadingAuditId = $state<string | null>(null);
  let canConfigure = $derived(auth.can('botdetector.configure'));
  let aiHtml = $derived.by(() =>
    diagnostics
      ? renderAiLifeLayerMetrics(
          diagnostics.ai,
          diagnostics.aiCoverage,
          diagnostics.aiDiagnostics,
          diagnostics.aiProfiles,
          diagnostics.aiAudit,
          diagnostics.aiActive,
          activeTab,
          selectedAuditId,
          diagnostics.aiCoverageChecklist,
        )
      : '',
  );

  function isAiTab(value: string | undefined): value is AiLifeLayerTab {
    return AI_TABS.includes(value as AiLifeLayerTab);
  }

  async function syncLegacyIsland(): Promise<void> {
    aiHtml;
    canConfigure;
    await tick();
    if (!root) return;
    for (const button of root.querySelectorAll<HTMLButtonElement>(WRITE_ACTION_SELECTOR)) {
      button.hidden = !canConfigure;
      button.disabled = !canConfigure;
    }
    const detail = root.querySelector<HTMLElement>('#ai-audit-detail');
    if (!detail || !selectedAuditId) return;
    if (loadingAuditId === selectedAuditId) {
      detail.textContent = t('usage.aiAuditDetailLoading');
    } else if (loadedAuditId === selectedAuditId && loadedAuditHtml) {
      // renderAiAuditRecordDetail escapes every server-provided field before this
      // trusted renderer output crosses the legacy-island HTML boundary.
      detail.innerHTML = loadedAuditHtml;
    }
  }

  $effect(() => {
    void syncLegacyIsland();
  });

  $effect(() => {
    const island = root;
    if (!island) return;
    const keydown = (event: KeyboardEvent) => void handleKeydown(event);
    island.addEventListener('click', handleClick);
    island.addEventListener('keydown', keydown);
    return () => {
      island.removeEventListener('click', handleClick);
      island.removeEventListener('keydown', keydown);
    };
  });

  async function refreshAi(): Promise<void> {
    try {
      diagnostics = await apiGet<AiDiagnosticsResponse>('/admin/api/ai/diagnostics');
      aiLoadFailed = 'none';
    } catch (err) {
      if (!auth.handleAuthFailure(err)) aiLoadFailed = classifyAdminLoadFailure(err);
    }
  }

  async function refreshAmbientBots(): Promise<void> {
    try {
      ambientBots = await apiGet<AmbientBotDiagnostics>('/admin/api/ambient-bots');
      ambientLoadFailed = 'none';
    } catch (err) {
      if (!auth.handleAuthFailure(err)) ambientLoadFailed = classifyAdminLoadFailure(err);
    }
  }

  function notifyFailure(err: unknown, fallbackKey: string): void {
    if (auth.handleAuthFailure(err)) return;
    window.alert(err instanceof Error ? localizeAdminError(err.message) : t(fallbackKey));
  }

  async function clearAiMemory(): Promise<void> {
    if (!canConfigure || !window.confirm(t('usage.aiClearConfirm'))) return;
    try {
      const result = await apiPost<AiVolatileMemoryClearResult>('/admin/api/ai/memory/clear', {});
      await refreshAi();
      window.alert(
        t('usage.aiClearSuccess', {
          count: result.totalCleared,
          persisted: result.persistedMemoryRecords,
        }),
      );
    } catch (err) {
      notifyFailure(err, 'usage.aiClearFailed');
    }
  }

  async function cleanAiAuditRecords(): Promise<void> {
    if (!canConfigure || !window.confirm(t('usage.aiAuditCleanConfirm'))) return;
    try {
      const result = await apiPost<AiAuditCleanupResult>('/admin/api/ai/audit/clean', {});
      selectedAuditId = null;
      loadedAuditId = null;
      loadedAuditHtml = '';
      await refreshAi();
      window.alert(
        t('usage.aiAuditCleanSuccess', {
          deleted: result.deletedRecords,
          retained: result.retainedRecords,
        }),
      );
    } catch (err) {
      notifyFailure(err, 'usage.aiAuditCleanFailed');
    }
  }

  function activeCheckbox(scope: ParentNode, field: string): boolean {
    const input = scope.querySelector<HTMLInputElement>(
      `[data-ai-active-global-field="${field}"], [data-ai-active-rule-field="${field}"]`,
    );
    return Boolean(input?.checked);
  }

  function activeNumber(scope: ParentNode, field: string): number | null {
    const input = scope.querySelector<HTMLInputElement>(`[data-ai-active-rule-field="${field}"]`);
    if (!input) return null;
    const value = Number(input.value);
    return Number.isFinite(value) ? value : null;
  }

  function activeSelect(scope: ParentNode, field: string): string {
    return (
      scope.querySelector<HTMLSelectElement>(`[data-ai-active-rule-field="${field}"]`)?.value ??
      ''
    );
  }

  async function saveAiActiveGlobal(): Promise<void> {
    const controls = root?.querySelector('[data-ai-active-global]');
    if (!canConfigure || !controls) return;
    try {
      await apiPost('/admin/api/ai/active-triggers/config', {
        enabled: activeCheckbox(controls, 'enabled'),
        eventsEnabled: activeCheckbox(controls, 'eventsEnabled'),
        pollsEnabled: activeCheckbox(controls, 'pollsEnabled'),
        realActionsEnabled: activeCheckbox(controls, 'realActionsEnabled'),
      });
      await refreshAi();
      window.alert(t('usage.aiActiveSaveSuccess'));
    } catch (err) {
      notifyFailure(err, 'usage.aiActiveSaveFailed');
    }
  }

  async function saveAiActiveRule(row: HTMLElement): Promise<void> {
    const ruleId = row.dataset.aiActiveRuleId;
    if (!canConfigure || !ruleId) return;
    const periodSeconds = activeNumber(row, 'periodSeconds');
    const jitterSeconds = activeNumber(row, 'jitterSeconds');
    const priority = activeNumber(row, 'priority');
    const perPlayerSeconds = activeNumber(row, 'cooldown.perPlayerSeconds');
    const perEntitySeconds = activeNumber(row, 'cooldown.perEntitySeconds');
    if (
      [periodSeconds, jitterSeconds, priority, perPlayerSeconds, perEntitySeconds].some(
        (value) => value === null,
      )
    ) {
      window.alert(t('usage.aiActiveInvalidNumber'));
      return;
    }
    try {
      await apiPost('/admin/api/ai/active-triggers/config', {
        rules: [
          {
            ruleId,
            enabled: activeCheckbox(row, 'enabled'),
            periodSeconds,
            jitterSeconds,
            priority,
            providerPolicy: activeSelect(row, 'providerPolicy'),
            outputMode: activeSelect(row, 'outputMode'),
            cooldown: { perPlayerSeconds, perEntitySeconds },
          },
        ],
      });
      await refreshAi();
      window.alert(t('usage.aiActiveSaveSuccess'));
    } catch (err) {
      notifyFailure(err, 'usage.aiActiveSaveFailed');
    }
  }

  async function cancelAiActiveSequences(): Promise<void> {
    if (!canConfigure) return;
    try {
      const result = await apiPost<AiActiveSequenceCancelResult>(
        '/admin/api/ai/active-triggers/sequences/cancel',
        {},
      );
      await refreshAi();
      window.alert(
        t('usage.aiActiveCancelSequencesSuccess', {
          canceledSequences: result.canceledSequences,
          canceledBeats: result.canceledBeats,
        }),
      );
    } catch (err) {
      notifyFailure(err, 'usage.aiActiveCancelSequencesFailed');
    }
  }

  async function loadAiAuditDetail(auditId: string): Promise<void> {
    selectedAuditId = auditId;
    activeTab = 'audit';
    if (loadedAuditId === auditId && loadedAuditHtml) return;
    loadingAuditId = auditId;
    await syncLegacyIsland();
    try {
      const record = await apiGet<AiAuditRecord>(
        `/admin/api/ai/audit/${encodeURIComponent(auditId)}`,
      );
      if (selectedAuditId !== auditId) return;
      loadedAuditId = auditId;
      loadedAuditHtml = renderAiAuditRecordDetail(record);
    } catch (err) {
      if (!auth.handleAuthFailure(err) && selectedAuditId === auditId) {
        loadedAuditId = null;
        loadedAuditHtml = '';
        await tick();
        root?.querySelector<HTMLElement>('#ai-audit-detail')?.replaceChildren(
          document.createTextNode(t('usage.aiAuditDetailLoadFailed')),
        );
      }
    } finally {
      if (loadingAuditId === auditId) loadingAuditId = null;
      await syncLegacyIsland();
    }
  }

  function selectTab(tab: AiLifeLayerTab): void {
    activeTab = tab;
  }

  function handleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !root?.contains(target)) return;
    const tabButton = target.closest<HTMLButtonElement>('button[data-ai-tab]');
    if (tabButton && isAiTab(tabButton.dataset.aiTab)) {
      selectTab(tabButton.dataset.aiTab);
      return;
    }
    if (target.closest('[data-clear-ai-memory]')) return void clearAiMemory();
    if (target.closest('[data-clean-ai-audit]')) return void cleanAiAuditRecords();
    if (target.closest('[data-save-ai-active-global]')) return void saveAiActiveGlobal();
    const saveRule = target.closest('[data-save-ai-active-rule]');
    if (saveRule) {
      const row = saveRule.closest<HTMLElement>('[data-ai-active-rule-id]');
      if (row) void saveAiActiveRule(row);
      return;
    }
    if (target.closest('[data-cancel-ai-active-sequences]')) {
      return void cancelAiActiveSequences();
    }
    const auditCard = target.closest<HTMLButtonElement>('[data-ai-audit-id]');
    if (auditCard?.dataset.aiAuditId) void loadAiAuditDetail(auditCard.dataset.aiAuditId);
  }

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !root?.contains(target)) return;
    const current = target.closest<HTMLButtonElement>('button[data-ai-tab]');
    if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-ai-tab]')).filter(
      (button) => isAiTab(button.dataset.aiTab),
    );
    const index = tabs.indexOf(current);
    if (index < 0 || tabs.length === 0) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const tab = tabs[nextIndex]?.dataset.aiTab;
    if (!isAiTab(tab)) return;
    selectTab(tab);
    await tick();
    root.querySelector<HTMLButtonElement>(`button[data-ai-tab="${tab}"]`)?.focus();
  }

  onMount(() =>
    poll(() => {
      void refreshAi();
      void refreshAmbientBots();
    }, LIVE_REFRESH_MS),
  );
</script>

{#if !canConfigure}
  <p class="read-only-notice" role="status">{t('aiOps.readOnlyNotice')}</p>
{/if}

<Panel title={t('aiOps.title')} hint={t('aiOps.refreshHint')}>
  {#if aiLoadFailed === 'forbidden'}
    <PermissionDenied />
  {:else if aiLoadFailed === 'error'}
    <p class="load-error" role="alert">{t('aiOps.loadFailed')}</p>
  {:else if !diagnostics}
    <p class="empty" role="status">{t('aiOps.loading')}</p>
  {:else}
    <!-- The only HTML crossing this boundary comes from tables.ts, whose tests
         cover escaping for every server-backed AI diagnostics field. -->
    <div
      id="ai-usage"
      role="region"
      aria-label={t('aiOps.title')}
      bind:this={root}
    >
      {@html aiHtml}
    </div>
  {/if}
</Panel>

{#if ambientLoadFailed === 'forbidden'}
  <Panel title={t('ambient.title')} hint={t('ambient.refreshHint')}>
    <PermissionDenied />
  </Panel>
{:else if ambientLoadFailed === 'error'}
  <p class="load-error" role="alert">{t('ambient.loadFailed')}</p>
{:else if ambientBots}
  <AmbientBots
    snapshot={ambientBots}
    {canConfigure}
    onUpdated={(next) => (ambientBots = next)}
  />
{/if}

<style>
  .read-only-notice,
  .load-error {
    margin: 0 0 10px;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    color: var(--text-soft);
    background: var(--surface-inset);
  }
  .load-error {
    color: var(--color-danger);
    border-color: var(--color-danger-border);
  }
</style>
