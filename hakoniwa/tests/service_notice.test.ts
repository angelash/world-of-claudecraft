// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestartNotice, type ServiceView } from '../src/client/service/notice';
import { t } from '../src/shared_ui/i18n';
import { initialRestartState } from '../tools/service/restart_state';

afterEach(() => document.body.replaceChildren());
const state = (): ServiceView => ({
  ...initialRestartState(Date.now()),
  phase: 'countdown',
  requestId: 'one',
  deadline: Date.now() + 5000,
  bootId: 'boot',
  workerReady: true,
  serverTime: Date.now(),
});
describe('Web restart dialog', () => {
  it('shows five seconds, interrupts on click, then requires the explicit continue button', async () => {
    const pending = state();
    const control = vi.fn(
      async (action: string) =>
        ({
          ...pending,
          phase: action === 'interrupt' ? 'paused' : 'countdown',
          deadline: action === 'interrupt' ? null : Date.now() + 5000,
        }) as ServiceView,
    );
    const notice = new RestartNotice(control);
    notice.update(pending);
    expect(notice.dialog.open).toBe(true);
    expect(notice.dialog.textContent).toContain(t('ui.pop.service.seconds', { n: 5 }));
    const button = notice.dialog.querySelector('button')!;
    expect(button.textContent).toBe(t('ui.pop.service.interrupt'));
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe(t('ui.pop.service.resume')));
    expect(control).toHaveBeenCalledWith('interrupt', 'one');
    expect(control).toHaveBeenCalledOnce();
    button.click();
    await vi.waitFor(() => expect(control).toHaveBeenCalledWith('resume', 'one'));
    notice.dispose();
  });
  it('reports a failed interrupt honestly instead of claiming it is paused', async () => {
    const notice = new RestartNotice(async () => {
      throw new Error('offline');
    });
    notice.update(state());
    notice.dialog.querySelector('button')!.click();
    await vi.waitFor(() =>
      expect(notice.dialog.textContent).toContain(t('ui.pop.service.control_failed')),
    );
    expect(notice.dialog.textContent).not.toContain(t('ui.pop.service.paused_detail'));
    notice.dispose();
  });
});
