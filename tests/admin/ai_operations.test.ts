// @vitest-environment jsdom
import './_setup';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiDiagnosticsResponse, AmbientBotDiagnostics } from '../../src/admin/types';
import { grantPermissions } from './_grant';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  renderAi: vi.fn(),
  renderAudit: vi.fn(),
}));

vi.mock('../../src/admin/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  getToken: () => 'tok',
  getAdminName: () => 'admin',
  clearSession: () => {},
}));

vi.mock('../../src/admin/i18n', () => ({
  t: (key: string) => key,
  localizeAdminError: (message: string) => message,
  adminLanguageTag: () => 'en',
  setAdminLanguage: () => {},
}));

vi.mock('../../src/admin/tables', () => ({
  renderAiAuditRecordDetail: mocks.renderAudit,
  renderAiLifeLayerMetrics: mocks.renderAi,
}));

import AiOperations from '../../src/admin/pages/AiOperations.svelte';

const diagnostics = {} as AiDiagnosticsResponse;
const ambientBots: AmbientBotDiagnostics = {
  planner: {
    enabled: true,
    config: {
      enabled: true,
      plannerIntervalMs: 10_000,
      clusterRadius: 70,
      releaseRadius: 220,
      soloTargetBots: 30,
      extraBotsPerAdditionalPlayer: 1,
      maxBotsPerCluster: 50,
      maxProvisionPerTick: 5,
      cooldownMs: 120_000,
      reservationMs: 90_000,
      recentActionLimit: 60,
    },
    metrics: {
      cycles: 4,
      humansObserved: 2,
      clustersObserved: 1,
      desiredBots: 31,
      assignedBots: 4,
      loginPlans: 1,
      provisionPlans: 0,
      logoutPlans: 0,
      lastRunAtMs: 1_000,
      lastRunReason: 'clusters_satisfied',
    },
    directory: {
      total: 5,
      ready: 1,
      reserved: 0,
      online: 4,
      cooldown: 0,
      retired: 0,
      provisionPending: 0,
      assigned: 4,
    },
    clusters: [],
    recentActions: [],
  },
  runtime: {
    started: true,
    startedAtMs: 1_000,
    controls: {
      acceptProvisionActions: true,
      acceptLoginActions: true,
      allowLlmDecisions: true,
    },
    metrics: {
      starts: 1,
      stops: 0,
      actionBatches: 0,
      actionsReceived: 0,
      provisionAttempts: 0,
      provisionSuccesses: 0,
      provisionFailures: 0,
      provisionSkipped: 0,
      loginAttempts: 0,
      loginSuccesses: 0,
      loginFailures: 0,
      loginSkipped: 0,
      logoutRequests: 0,
      logoutAllRequests: 0,
      unexpectedClosures: 0,
      brainLoops: 0,
      brainBotTicks: 0,
      brainFailures: 0,
      llmAuditWrites: 0,
      lastActionAtMs: null,
      lastBrainAtMs: null,
      lastBrainDurationMs: null,
      lastFailureAtMs: null,
      lastFailureStage: '',
      lastFailureBotId: '',
      lastFailureReason: '',
    },
    activeRunners: 1,
    connectedRunners: 1,
    sessions: [],
  },
  llm: {
    enabled: true,
    providerAvailable: true,
    config: {
      enabled: true,
      planCooldownMs: 120_000,
      socialCooldownMs: 45_000,
      maxCalls5h: 10,
      maxCallsWeek: 20,
      cacheMaxEntries: 32,
      cacheMaxTtlMs: 300_000,
    },
    budget: {
      maxCalls5h: 10,
      usedCalls5h: 1,
      remainingCalls5h: 9,
      maxCallsWeek: 20,
      usedCallsWeek: 1,
      remainingCallsWeek: 19,
    },
    cache: { planEntries: 1, socialEntries: 0, partyEntries: 0 },
    metrics: {},
  },
};

function legacyMarkup(activeTab: string): string {
  return `
    <div role="tablist">
      <button type="button" data-ai-tab="audit">audit tab</button>
      <button type="button" data-ai-tab="active">active tab</button>
    </div>
    <button type="button" data-clear-ai-memory>clear memory</button>
    <button type="button" data-clean-ai-audit>clean audit</button>
    <div data-ai-active-global>
      <input type="checkbox" data-ai-active-global-field="enabled" checked>
      <input type="checkbox" data-ai-active-global-field="eventsEnabled" checked>
      <input type="checkbox" data-ai-active-global-field="pollsEnabled">
      <input type="checkbox" data-ai-active-global-field="realActionsEnabled" checked>
      <button type="button" data-save-ai-active-global>save global</button>
    </div>
    <div data-ai-active-rule-id="rule-1">
      <input type="checkbox" data-ai-active-rule-field="enabled" checked>
      <input data-ai-active-rule-field="periodSeconds" value="120">
      <input data-ai-active-rule-field="jitterSeconds" value="15">
      <input data-ai-active-rule-field="priority" value="88">
      <input data-ai-active-rule-field="cooldown.perPlayerSeconds" value="90">
      <input data-ai-active-rule-field="cooldown.perEntitySeconds" value="180">
      <select data-ai-active-rule-field="providerPolicy"><option value="codexPreferred" selected>provider</option></select>
      <select data-ai-active-rule-field="outputMode"><option value="mixedLivingWorld" selected>output</option></select>
      <button type="button" data-save-ai-active-rule>save rule</button>
    </div>
    <button type="button" data-cancel-ai-active-sequences>cancel sequences</button>
    <button type="button" data-ai-audit-id="audit-1">audit record</button>
    <div id="ai-audit-detail"></div>
    <span data-active-tab>${activeTab}</span>`;
}

beforeEach(() => {
  mocks.apiGet.mockReset();
  mocks.apiPost.mockReset();
  mocks.renderAi.mockReset();
  mocks.renderAudit.mockReset();
  mocks.renderAi.mockImplementation((...args: unknown[]) =>
    legacyMarkup(String(args[6] ?? 'audit')),
  );
  mocks.renderAudit.mockReturnValue('<section>escaped audit detail</section>');
  mocks.apiGet.mockImplementation(async (path: string) => {
    if (path === '/admin/api/ai/diagnostics') return diagnostics;
    if (path === '/admin/api/ambient-bots') return ambientBots;
    if (path === '/admin/api/ai/audit/audit-1') return { auditId: 'audit-1' };
    throw new Error(`unexpected GET ${path}`);
  });
  mocks.apiPost.mockImplementation(async (path: string) => {
    if (path === '/admin/api/ambient-bots/config') return ambientBots;
    if (path === '/admin/api/ambient-bots/control') return ambientBots;
    if (path === '/admin/api/ambient-bots/logout-all') {
      return {
        result: { disconnectedRunners: 1, resetRecords: 2, atMs: 3_000 },
        diagnostics: ambientBots,
      };
    }
    return {};
  });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AiOperations', () => {
  it('uses dedicated read routes and hides every write surface from read-only analysts', async () => {
    grantPermissions(['botdetector.read']);
    render(AiOperations);

    await screen.findByText('ambient.title');
    expect(mocks.apiGet).toHaveBeenCalledWith('/admin/api/ai/diagnostics');
    expect(mocks.apiGet).toHaveBeenCalledWith('/admin/api/ambient-bots');
    expect(mocks.apiGet).not.toHaveBeenCalledWith('/admin/api/overview');
    expect(screen.getByText('aiOps.readOnlyNotice')).toBeInTheDocument();

    const hiddenWriteButtons = [
      screen.getByText('clear memory'),
      screen.getByText('clean audit'),
      screen.getByText('save global'),
      screen.getByText('save rule'),
      screen.getByText('cancel sequences'),
    ];
    await waitFor(() => {
      for (const button of hiddenWriteButtons) {
        expect(button).toHaveAttribute('hidden');
        expect(button).toBeDisabled();
      }
    });
    expect(screen.queryByRole('button', { name: 'ambient.savePlanner' })).not.toBeInTheDocument();

    await fireEvent.click(hiddenWriteButtons[0]);
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('keeps tab navigation and escaped audit-detail rendering inside the island', async () => {
    grantPermissions(['botdetector.read']);
    render(AiOperations);

    const activeTab = await screen.findByRole('button', { name: 'active tab' });
    await fireEvent.click(activeTab);
    await waitFor(() => expect(screen.getByText('active')).toBeInTheDocument());

    await fireEvent.click(screen.getByRole('button', { name: 'audit record' }));
    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/admin/api/ai/audit/audit-1');
      expect(screen.getByText('escaped audit detail')).toBeInTheDocument();
    });
  });

  it('submits AI and ambient controls only with configure permission', async () => {
    grantPermissions(['botdetector.read', 'botdetector.configure']);
    render(AiOperations);

    await fireEvent.click(await screen.findByText('save global'));
    expect(mocks.apiPost).toHaveBeenCalledWith('/admin/api/ai/active-triggers/config', {
      enabled: true,
      eventsEnabled: true,
      pollsEnabled: false,
      realActionsEnabled: true,
    });

    await fireEvent.click(screen.getByRole('button', { name: 'ambient.savePlanner' }));
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        '/admin/api/ambient-bots/config',
        ambientBots.planner.config,
      ),
    );

    await fireEvent.click(screen.getByRole('button', { name: 'ambient.saveRuntime' }));
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/admin/api/ambient-bots/control',
      ambientBots.runtime?.controls,
    );

    await fireEvent.click(screen.getByRole('button', { name: 'ambient.logoutAll' }));
    expect(mocks.apiPost).toHaveBeenCalledWith('/admin/api/ambient-bots/logout-all', {
      reason: '',
    });
  });
});
