import type { RestartState } from '../../../tools/service/restart_state';
import { serviceText as t } from './text';

export interface ServiceView extends RestartState {
  bootId: string;
  workerReady: boolean;
  serverTime: number;
}
export class RestartNotice {
  readonly dialog = document.createElement('dialog');
  private title = document.createElement('h2');
  private detail = document.createElement('p');
  private count = document.createElement('strong');
  private action = document.createElement('button');
  private close = document.createElement('button');
  private current: ServiceView | null = null;
  private generation: number | null = null;
  private previousFocus: HTMLElement | null = null;
  private offset = 0;
  private pending = false;
  constructor(
    private control: (action: 'interrupt' | 'resume', id: string) => Promise<ServiceView>,
    parent = document.body,
  ) {
    this.dialog.className = 'hk-restart-notice';
    this.title.id = 'hk-service-title';
    this.detail.id = 'hk-service-detail';
    this.dialog.setAttribute('aria-labelledby', this.title.id);
    this.dialog.setAttribute('aria-describedby', this.detail.id);
    this.count.setAttribute('aria-live', 'polite');
    this.action.type = this.close.type = 'button';
    this.close.textContent = t('ui.pop.service.dismiss');
    this.dialog.append(this.title, this.count, this.detail, this.action, this.close);
    parent.append(this.dialog);
    this.action.addEventListener('click', () => void this.act());
    this.close.addEventListener('click', () => this.hide());
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (this.current?.phase === 'countdown') void this.act();
      else this.hide();
    });
    // Prevent game bindings from handling modal keyboard input.
    this.dialog.addEventListener('keydown', (e) => e.stopPropagation());
  }
  update(state: ServiceView) {
    const old = this.current;
    const completed = this.generation !== null && state.generation > this.generation;
    const newlyPaused =
      state.phase === 'paused' && (old?.phase !== 'paused' || old.requestId !== state.requestId);
    this.current = state;
    this.offset = state.serverTime - Date.now();
    this.generation = state.generation;
    if (
      state.phase === 'countdown' ||
      state.phase === 'restarting' ||
      state.phase === 'failed' ||
      newlyPaused ||
      completed
    )
      this.show();
    this.render(completed || (state.phase === 'idle' && this.dialog.open));
  }
  tick() {
    if (this.current?.phase === 'countdown') this.render(false);
  }
  private show() {
    if (this.dialog.open) return;
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.dialog.showModal();
    this.action.focus();
  }
  private hide() {
    this.dialog.close();
    this.previousFocus?.focus();
  }
  private render(completed: boolean) {
    const s = this.current;
    if (!s) return;
    const seconds = Math.max(0, Math.ceil(((s.deadline ?? 0) - Date.now() - this.offset) / 1000));
    this.count.hidden = s.phase !== 'countdown';
    this.count.textContent = t('ui.pop.service.seconds', { n: seconds });
    this.title.textContent = completed
      ? t('ui.pop.service.ready')
      : s.phase === 'paused'
        ? t('ui.pop.service.paused')
        : s.phase === 'failed'
          ? t('ui.pop.service.failed')
          : t('ui.pop.service.title');
    this.detail.textContent = completed
      ? t('ui.pop.service.ready_detail')
      : s.phase === 'paused'
        ? t('ui.pop.service.paused_detail')
        : s.phase === 'failed'
          ? t('ui.pop.service.failed_detail')
          : s.phase === 'restarting'
            ? t('ui.pop.service.restarting')
            : t('ui.pop.service.detail');
    this.action.hidden = !['countdown', 'paused'].includes(s.phase);
    this.action.textContent =
      s.phase === 'paused' ? t('ui.pop.service.resume') : t('ui.pop.service.interrupt');
    this.action.disabled = this.pending;
    this.close.hidden = s.phase === 'countdown' || s.phase === 'restarting';
  }
  private async act() {
    const s = this.current;
    if (this.pending || !s?.requestId || !['countdown', 'paused'].includes(s.phase)) return;
    this.pending = true;
    this.action.disabled = true;
    try {
      this.update(await this.control(s.phase === 'paused' ? 'resume' : 'interrupt', s.requestId));
    } catch {
      this.detail.textContent = t('ui.pop.service.control_failed');
    } finally {
      this.pending = false;
      this.action.disabled = false;
    }
  }
  dispose() {
    this.dialog.remove();
  }
}
