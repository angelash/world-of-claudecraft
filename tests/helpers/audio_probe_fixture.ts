import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_CONFORMANCE_FFMPEG_PATH } from '../../scripts/sfx/ffmpeg_paths.mjs';

// Both native FFmpeg and the POSIX stub exit zero for the production -version
// probe. Windows requires a real executable; a shebang is not executable there.
export function successfulAudioProbe(dir: string, name = 'ok-tool'): string {
  const tool = join(dir, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  if (process.platform === 'win32') {
    copyFileSync(SFX_CONFORMANCE_FFMPEG_PATH, tool);
  } else {
    writeFileSync(tool, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  return tool;
}
