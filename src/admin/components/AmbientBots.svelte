<script lang="ts">
  import { apiPost } from '../api';
  import { fmtNumber } from '../format';
  import { localizeAdminError, t } from '../i18n';
  import { auth } from '../state/auth.svelte';
  import type {
    AmbientBotDiagnostics,
    AmbientBotLogoutAllResponse,
    AmbientBotPlannerConfig,
    AmbientBotRuntimeControls,
  } from '../types';
  import Panel from './Panel.svelte';

  let {
    snapshot,
    canConfigure,
    onUpdated,
  }: {
    snapshot: AmbientBotDiagnostics;
    canConfigure: boolean;
    onUpdated: (next: AmbientBotDiagnostics) => void;
  } = $props();

  const emptyPlannerConfig = (): AmbientBotPlannerConfig => ({
    enabled: false,
    plannerIntervalMs: 0,
    clusterRadius: 0,
    releaseRadius: 0,
    soloTargetBots: 0,
    extraBotsPerAdditionalPlayer: 0,
    maxBotsPerCluster: 0,
    maxProvisionPerTick: 0,
    cooldownMs: 0,
    reservationMs: 0,
    recentActionLimit: 0,
  });
  const emptyRuntimeControls = (): AmbientBotRuntimeControls => ({
    acceptProvisionActions: false,
    acceptLoginActions: false,
    allowLlmDecisions: false,
  });
  let plannerDirty = $state(false);
  let runtimeDirty = $state(false);
  let logoutReason = $state('');
  let plannerDraft = $state<AmbientBotPlannerConfig>(emptyPlannerConfig());
  let runtimeDraft = $state<AmbientBotRuntimeControls>(emptyRuntimeControls());

  $effect(() => {
    if (!plannerDirty) plannerDraft = { ...snapshot.planner.config };
    if (!runtimeDirty && snapshot.runtime) runtimeDraft = { ...snapshot.runtime.controls };
  });

  function status(enabled: boolean): string {
    return t(enabled ? 'ambient.enabled' : 'ambient.disabled');
  }

  function actionFailed(err: unknown, fallbackKey: string): void {
    if (auth.handleAuthFailure(err)) return;
    window.alert(err instanceof Error ? localizeAdminError(err.message) : t(fallbackKey));
  }

  async function savePlanner(): Promise<void> {
    try {
      const next = await apiPost<AmbientBotDiagnostics>(
        '/admin/api/ambient-bots/config',
        plannerDraft,
      );
      plannerDirty = false;
      onUpdated(next);
      window.alert(t('ambient.saveSuccess'));
    } catch (err) {
      actionFailed(err, 'ambient.saveFailed');
    }
  }

  async function saveRuntime(): Promise<void> {
    try {
      const next = await apiPost<AmbientBotDiagnostics>(
        '/admin/api/ambient-bots/control',
        runtimeDraft,
      );
      runtimeDirty = false;
      onUpdated(next);
      window.alert(t('ambient.saveSuccess'));
    } catch (err) {
      actionFailed(err, 'ambient.saveFailed');
    }
  }

  async function logoutAll(): Promise<void> {
    if (!window.confirm(t('ambient.logoutConfirm'))) return;
    try {
      const response = await apiPost<AmbientBotLogoutAllResponse>(
        '/admin/api/ambient-bots/logout-all',
        { reason: logoutReason.trim() },
      );
      logoutReason = '';
      onUpdated(response.diagnostics);
      window.alert(
        t('ambient.logoutSuccess', {
          disconnected: response.result.disconnectedRunners,
          reset: response.result.resetRecords,
        }),
      );
    } catch (err) {
      actionFailed(err, 'ambient.logoutFailed');
    }
  }
</script>

<Panel title={t('ambient.title')} hint={t('ambient.refreshHint')}>
  <div class="ambient-status-grid">
    <div class="ambient-status">
      <strong>{status(snapshot.planner.enabled)}</strong>
      <span>{t('ambient.plannerStatus')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.planner.directory.total)}</strong>
      <span>{t('ambient.directoryTotal')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.planner.directory.ready)}</strong>
      <span>{t('ambient.directoryReady')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.planner.directory.online)}</strong>
      <span>{t('ambient.directoryOnline')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.planner.metrics.desiredBots)}</strong>
      <span>{t('ambient.desiredBots')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.planner.metrics.assignedBots)}</strong>
      <span>{t('ambient.assignedBots')}</span>
    </div>
    <div class="ambient-status">
      <strong>{snapshot.runtime ? status(snapshot.runtime.started) : t('ambient.unavailable')}</strong>
      <span>{t('ambient.runtimeStatus')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.runtime?.activeRunners ?? 0)}</strong>
      <span>{t('ambient.activeRunners')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.runtime?.connectedRunners ?? 0)}</strong>
      <span>{t('ambient.connectedRunners')}</span>
    </div>
    <div class="ambient-status">
      <strong>{snapshot.llm ? status(snapshot.llm.enabled) : t('ambient.unavailable')}</strong>
      <span>{t('ambient.llmStatus')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.llm?.budget.remainingCalls5h ?? 0)}</strong>
      <span>{t('ambient.calls5h')}</span>
    </div>
    <div class="ambient-status">
      <strong>{fmtNumber(snapshot.llm?.budget.remainingCallsWeek ?? 0)}</strong>
      <span>{t('ambient.callsWeek')}</span>
    </div>
  </div>

  {#if canConfigure}
    <div class="ambient-config-grid">
      <form
        class="ambient-config"
        oninput={() => (plannerDirty = true)}
        onsubmit={(event) => {
          event.preventDefault();
          void savePlanner();
        }}
      >
        <h4>{t('ambient.plannerConfigTitle')}</h4>
        <label class="check-row">
          <input type="checkbox" bind:checked={plannerDraft.enabled} />
          <span>{t('ambient.field.enabled')}</span>
        </label>
        <label>
          <span>{t('ambient.field.plannerIntervalMs')}</span>
          <input type="number" min="1000" step="1000" bind:value={plannerDraft.plannerIntervalMs} />
        </label>
        <label>
          <span>{t('ambient.field.clusterRadius')}</span>
          <input type="number" min="1" step="1" bind:value={plannerDraft.clusterRadius} />
        </label>
        <label>
          <span>{t('ambient.field.releaseRadius')}</span>
          <input type="number" min="1" step="1" bind:value={plannerDraft.releaseRadius} />
        </label>
        <label>
          <span>{t('ambient.field.soloTargetBots')}</span>
          <input type="number" min="0" step="1" bind:value={plannerDraft.soloTargetBots} />
        </label>
        <label>
          <span>{t('ambient.field.extraBotsPerAdditionalPlayer')}</span>
          <input
            type="number"
            min="0"
            step="1"
            bind:value={plannerDraft.extraBotsPerAdditionalPlayer}
          />
        </label>
        <label>
          <span>{t('ambient.field.maxBotsPerCluster')}</span>
          <input type="number" min="0" step="1" bind:value={plannerDraft.maxBotsPerCluster} />
        </label>
        <label>
          <span>{t('ambient.field.maxProvisionPerTick')}</span>
          <input
            type="number"
            min="0"
            step="1"
            bind:value={plannerDraft.maxProvisionPerTick}
          />
        </label>
        <label>
          <span>{t('ambient.field.cooldownMs')}</span>
          <input type="number" min="0" step="1000" bind:value={plannerDraft.cooldownMs} />
        </label>
        <label>
          <span>{t('ambient.field.reservationMs')}</span>
          <input type="number" min="0" step="1000" bind:value={plannerDraft.reservationMs} />
        </label>
        <label>
          <span>{t('ambient.field.recentActionLimit')}</span>
          <input type="number" min="0" step="1" bind:value={plannerDraft.recentActionLimit} />
        </label>
        <button type="submit">{t('ambient.savePlanner')}</button>
      </form>

      {#if snapshot.runtime}
        <form
          class="ambient-config"
          onchange={() => (runtimeDirty = true)}
          onsubmit={(event) => {
            event.preventDefault();
            void saveRuntime();
          }}
        >
          <h4>{t('ambient.runtimeControlsTitle')}</h4>
          <label class="check-row">
            <input type="checkbox" bind:checked={runtimeDraft.acceptProvisionActions} />
            <span>{t('ambient.field.acceptProvisionActions')}</span>
          </label>
          <label class="check-row">
            <input type="checkbox" bind:checked={runtimeDraft.acceptLoginActions} />
            <span>{t('ambient.field.acceptLoginActions')}</span>
          </label>
          <label class="check-row">
            <input type="checkbox" bind:checked={runtimeDraft.allowLlmDecisions} />
            <span>{t('ambient.field.allowLlmDecisions')}</span>
          </label>
          <button type="submit">{t('ambient.saveRuntime')}</button>
        </form>
      {/if}

      <form
        class="ambient-config ambient-danger"
        onsubmit={(event) => {
          event.preventDefault();
          void logoutAll();
        }}
      >
        <h4>{t('ambient.logoutTitle')}</h4>
        <label>
          <span>{t('ambient.logoutReason')}</span>
          <input
            type="text"
            placeholder={t('ambient.logoutReasonPlaceholder')}
            bind:value={logoutReason}
          />
        </label>
        <button type="submit" class="danger">{t('ambient.logoutAll')}</button>
      </form>
    </div>
  {/if}
</Panel>

<style>
  .ambient-status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .ambient-status {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: var(--surface-inset);
  }
  .ambient-status strong {
    color: var(--gold);
    font-family: var(--title-font);
    font-size: 20px;
    overflow-wrap: anywhere;
  }
  .ambient-status span {
    color: var(--text-dim);
    font-size: var(--font-size-small);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .ambient-config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    margin-top: 14px;
  }
  .ambient-config {
    display: grid;
    align-content: start;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    background: var(--surface-sunken);
  }
  .ambient-config h4 {
    color: var(--gold-dim);
    font-family: var(--title-font);
  }
  .ambient-config label {
    display: grid;
    gap: 5px;
    color: var(--text-soft);
  }
  .ambient-config .check-row {
    grid-template-columns: auto 1fr;
    align-items: center;
    min-height: 40px;
  }
  .ambient-config input[type='checkbox'] {
    width: 20px;
    height: 20px;
  }
  .ambient-config button {
    min-height: 40px;
  }
  .ambient-config button.danger {
    color: var(--color-danger);
    border-color: var(--color-danger-border);
  }
  @media (max-width: 700px) {
    .ambient-config-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
