import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialRestartState, type RestartState, recoverRestartState } from './restart_state';

export function serviceStore(dir: string) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'restart.json');
  const save = (state: RestartState) => {
    const temp = file + '.tmp';
    writeFileSync(temp, JSON.stringify(state) + '\n', { mode: 0o600 });
    renameSync(temp, file);
  };
  let state = initialRestartState(Date.now());
  if (existsSync(file)) {
    const value = JSON.parse(readFileSync(file, 'utf8')) as RestartState;
    if (
      !['idle', 'countdown', 'paused', 'restarting', 'failed'].includes(value.phase) ||
      !Number.isInteger(value.generation) ||
      typeof value.reason !== 'string' ||
      (value.requestId !== null && typeof value.requestId !== 'string') ||
      !Number.isFinite(value.updatedAt)
    )
      throw new Error('Invalid persisted restart state; inspect before starting');
    state = recoverRestartState(value);
  }
  const tokenFile = join(dir, 'control.token');
  if (!existsSync(tokenFile))
    writeFileSync(tokenFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const token = readFileSync(tokenFile, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid service control token');
  return { state, save, token };
}
