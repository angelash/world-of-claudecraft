// The browser wiring of the audio subsystem: the Web Audio bus created on the first user input,
// the development loader for approved audio, the window focus (with the listeners that apply
// the background rule at once, 10.3, even while a hidden tab runs no frames) and the system's
// reduce-motion preference. The session calls createBrowserAudio once per game; everything it
// needs from the page is read here, so ./index.ts stays testable in Node.

import type { AtlasMapDef } from '../../systems/world/atlas';
import { loadedStatuses } from '../assets/types';
import type { GameView } from '../view/game_view';
import { WebAudioBus } from './audio_bus';
import { DEV_AUDIO_BASE, loadAudioIndex } from './audio_loader';
import type { AudioSettingsSource } from './audio_settings';
import { createGameAudio, type GameAudio } from './index';

export function createBrowserAudio(opts: {
  view: GameView;
  root: HTMLElement;
  atlas: readonly AtlasMapDef[];
  settings: () => AudioSettingsSource | null | undefined;
  /** The output device id of the local settings part (desktop); null is the system default. */
  device?: () => string | null;
}): GameAudio {
  const motion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const log = (m: string) => console.warn(m);
  const audio = createGameAudio({
    ...opts,
    output: () => WebAudioBus.create({ base: DEV_AUDIO_BASE, log }),
    loadIndex: import.meta.env.DEV
      ? () =>
          loadAudioIndex({ statuses: loadedStatuses(window.location.search, import.meta.env.DEV) })
      : undefined,
    environment: () => ({
      focused:
        typeof document === 'undefined' ||
        (document.visibilityState === 'visible' && document.hasFocus()),
      systemReducedMotion: !!motion?.matches,
    }),
    seed: Math.floor(performance.now()) >>> 0,
    log,
  });
  const changed = () => audio.settingsChanged();
  window.addEventListener('blur', changed);
  window.addEventListener('focus', changed);
  document.addEventListener('visibilitychange', changed);
  motion?.addEventListener?.('change', changed);
  const dispose = audio.dispose.bind(audio);
  audio.dispose = () => {
    window.removeEventListener('blur', changed);
    window.removeEventListener('focus', changed);
    document.removeEventListener('visibilitychange', changed);
    motion?.removeEventListener?.('change', changed);
    dispose();
  };
  return audio;
}
