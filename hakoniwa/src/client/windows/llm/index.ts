import './llm.css';
import { profileFor } from '../../../ai/providers/capabilities';
import type { ConnectionPublic } from '../../../ai/providers/types';
import type { PlatformHost } from '../../../platform';
import { el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { LlmSettingsController } from './controller';

/** Standalone settings dialog, shared by title/new-game and the in-game settings entry. */
export class LlmSettingsWindow {
  readonly controller: LlmSettingsController;
  private dialog: HTMLDialogElement | null = null;
  private generation = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: PlatformHost,
    changed?: () => void,
  ) {
    this.controller = new LlmSettingsController(host, changed);
  }

  async open(kind?: 'cloud' | 'local'): Promise<void> {
    this.dispose();
    const generation = this.generation;
    const previous = document.activeElement;
    const body = el('div', { className: 'hk-llm-body' });
    const status = el('p', {
      className: 'hk-llm-status',
      attrs: { role: 'status', 'aria-live': 'polite' },
    });
    const dialog = el(
      'dialog',
      {
        className: 'hk-llm-dialog',
        attrs: { 'aria-label': t('ui.set.llm.title'), 'aria-modal': 'true' },
      },
      [
        el('header', {}, [
          el('h2', { text: t('ui.set.llm.title') }),
          el('button', {
            className: 'hk-btn',
            text: t('ui.common.panel.close'),
            on: { click: () => dialog.close() },
          }),
        ]),
        el('p', { className: 'hk-set-note', text: t('ui.llm.config.notice') }),
        body,
        status,
      ],
    );
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (previous instanceof HTMLElement) previous.focus();
    });
    this.root.append(dialog);
    this.dialog = dialog;
    dialog.showModal();
    const action = async (task: () => Promise<void>) => {
      if (generation !== this.generation) return;
      const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
      for (const b of controls) b.disabled = true;
      setText(status, t('ui.llm.config.busy'));
      try {
        await task();
        if (generation === this.generation) setText(status, t('ui.llm.config.saved'));
      } catch {
        setText(status, t('ui.llm.config.failed'));
      } finally {
        for (const b of controls) b.disabled = false;
      }
    };
    try {
      await this.controller.load();
    } catch {
      setText(status, t('ui.llm.config.failed'));
      return;
    }
    if (generation !== this.generation || this.dialog !== dialog) return;
    const controller = this.controller;
    const list = el('div', { className: 'hk-llm-connections' });
    const redraw = () => {
      list.replaceChildren();
      for (const c of controller.settings.connections) {
        const state =
          c.auth.scheme === 'none'
            ? t('ui.llm.config.no_key')
            : c.keyState === 'none'
              ? t('ui.llm.config.key_missing')
              : t('ui.llm.config.key_session');
        list.append(
          el('section', { className: 'hk-llm-card' }, [
            el('h3', { text: c.name }),
            el('p', { text: c.baseUrl }),
            el('p', { text: state }),
            el('div', { className: 'hk-llm-actions' }, [
              el('button', {
                className: 'hk-btn',
                text: t('ui.llm.config.use'),
                attrs: { type: 'button' },
                on: {
                  click: () =>
                    void action(async () => {
                      const picked = c.models[0]?.model;
                      if (!picked) throw new Error('no_model');
                      if (
                        c.kind !== 'local' &&
                        (!consent.checked || hour.value === '' || day.value === '')
                      )
                        throw new Error('caps_and_consent_required');
                      await controller.use(
                        c.id,
                        picked,
                        {
                          hour: hour.value === '' ? {} : { tokens: Number(hour.value) },
                          day: day.value === '' ? {} : { tokens: Number(day.value) },
                          displayCurrency: 'USD',
                        },
                        consent.checked,
                      );
                      redraw();
                    }),
                },
              }),
              el('button', {
                className: 'hk-btn',
                text: t('ui.llm.config.key_enter'),
                attrs: { type: 'button' },
                on: {
                  click: () =>
                    void action(async () => {
                      await controller.enterKey(c.id);
                      redraw();
                    }),
                },
              }),
              el('button', {
                className: 'hk-btn',
                text: t('ui.llm.config.key_clear'),
                attrs: { type: 'button' },
                on: {
                  click: () =>
                    void action(async () => {
                      await controller.clearKey(c.id);
                      redraw();
                    }),
                },
              }),
              el('button', {
                className: 'hk-btn',
                text: t('ui.llm.config.test'),
                attrs: { type: 'button' },
                on: {
                  click: () =>
                    void action(async () => {
                      const report = (await controller.test(c.id)) as {
                        ok?: boolean;
                        checks?: { id: string; verdict: string }[];
                      };
                      results.replaceChildren(
                        el('p', {
                          text: t(
                            report.ok ? 'ui.llm.config.test_pass' : 'ui.llm.config.test_fail',
                          ),
                        }),
                      );
                    }),
                },
              }),
              el('button', {
                className: 'hk-btn',
                text: t('ui.llm.config.remove'),
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    if (window.confirm(t('ui.llm.config.remove_confirm')))
                      void action(async () => {
                        await controller.remove(c.id);
                        redraw();
                      });
                  },
                },
              }),
            ]),
          ]),
        );
      }
      if (!controller.settings.connections.length)
        list.append(el('p', { text: t('ui.llm.config.empty') }));
    };
    const label = (key: Parameters<typeof t>[0], input: HTMLElement) =>
      el('label', { className: 'hk-llm-field' }, [el('span', { text: t(key) }), input]);
    const provider = el('select', { attrs: { 'aria-label': t('ui.llm.config.provider') } });
    for (const id of ['anthropic', 'openai_compat', 'local'] as const) {
      provider.append(
        el('option', { text: t(`ui.llm.config.provider_${id}`), attrs: { value: id } }),
      );
    }
    provider.value = kind === 'local' || hostIsWeb(this.host) ? 'local' : 'anthropic';
    if (hostIsWeb(this.host)) provider.disabled = true;
    const name = el('input', { attrs: { maxlength: '80', autocomplete: 'off' } });
    const address = el('input', {
      attrs: { type: 'url', autocomplete: 'off', spellcheck: 'false' },
    });
    const model = el('input', { attrs: { maxlength: '200', autocomplete: 'off' } });
    address.value =
      provider.value === 'local' ? 'http://127.0.0.1:11434' : 'https://api.anthropic.com';
    provider.addEventListener('change', () => {
      address.value =
        provider.value === 'local'
          ? 'http://127.0.0.1:11434'
          : provider.value === 'anthropic'
            ? 'https://api.anthropic.com'
            : '';
    });
    const hour = el('input', { attrs: { type: 'number', min: '0', step: '1' } });
    const day = el('input', { attrs: { type: 'number', min: '0', step: '1' } });
    const consent = el('input', { attrs: { type: 'checkbox' } });
    const enable = el('input', { attrs: { type: 'checkbox' } });
    const results = el('div', { className: 'hk-llm-results' });
    const form = el('form', { className: 'hk-llm-editor' }, [
      el('h3', { text: t('ui.llm.config.add') }),
      label('ui.llm.config.provider', provider),
      label('ui.llm.config.name', name),
      label('ui.llm.config.address', address),
      label('ui.llm.config.model', model),
      label('ui.llm.config.hour_tokens', hour),
      label('ui.llm.config.day_tokens', day),
      label('ui.llm.config.consent', consent),
      label('ui.llm.config.enable', enable),
      el('button', {
        className: 'hk-btn',
        text: t('ui.llm.config.save'),
        attrs: { type: 'submit' },
      }),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void action(async () => {
        const selected = provider.value as ConnectionPublic['kind'];
        if (!name.value.trim() || !model.value.trim()) throw new Error('name_and_model_required');
        const id = `conn_${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
        const flavor = selected === 'local' ? ('ollama' as const) : undefined;
        const conn: ConnectionPublic = {
          id,
          kind: selected,
          name: name.value.trim(),
          baseUrl: address.value.trim(),
          auth: {
            scheme:
              selected === 'local' ? 'none' : selected === 'anthropic' ? 'x_api_key' : 'bearer',
          },
          flavor,
          keyState: 'none',
          extraHeaderNames: [],
          currency: 'USD',
          maxInFlight: selected === 'local' ? 2 : 4,
          models: [profileFor(selected, model.value.trim(), flavor)],
        };
        await controller.connection(conn);
        if (enable.checked) {
          if (selected !== 'local' && (!consent.checked || hour.value === '' || day.value === ''))
            throw new Error('caps_and_consent_required');
          await controller.use(
            id,
            model.value.trim(),
            {
              hour: hour.value === '' ? {} : { tokens: Number(hour.value) },
              day: day.value === '' ? {} : { tokens: Number(day.value) },
              displayCurrency: 'USD',
            },
            consent.checked,
          );
        }
        redraw();
      });
    });
    body.append(
      list,
      form,
      el('div', { className: 'hk-llm-actions' }, [
        el('button', {
          className: 'hk-btn',
          text: t('ui.llm.config.off'),
          on: { click: () => void action(() => controller.off()) },
        }),
        el('button', {
          className: 'hk-btn',
          text: t('ui.llm.config.ledger'),
          on: {
            click: () =>
              void action(async () => {
                const ledger = (await controller.ledger()) as {
                  snapshot?: { windows?: { hour?: { tokens?: number } } };
                  entries?: unknown[];
                };
                results.replaceChildren(
                  el('p', {
                    text: t('ui.llm.config.ledger_total', {
                      n: ledger.snapshot?.windows?.hour?.tokens ?? 0,
                      calls: ledger.entries?.length ?? 0,
                    }),
                  }),
                );
              }),
          },
        }),
      ]),
      results,
    );
    redraw();
    if (controller.readOnly) {
      for (const b of body.querySelectorAll<HTMLButtonElement>('button')) b.disabled = true;
    }
  }

  dispose(): void {
    this.generation++;
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
  }
}

function hostIsWeb(host: PlatformHost): boolean {
  return host.kind === 'web';
}
