import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { WorkerHost } from '../tools/service/worker_host';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
describe('owned worker spawn failures', () => {
  it('rejects a spawn error without exit and leaves no forever-pending stop', async () => {
    const child = Object.assign(new EventEmitter(), { pid: undefined, kill: vi.fn() });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        child.emit('error', new Error('spawn denied'));
        child.emit('close');
      });
      return child as unknown as ChildProcess;
    });
    const worker = new WorkerHost(process.cwd(), process.cwd(), vi.fn());
    await expect(worker.start()).rejects.toThrow('spawn denied');
    await worker.stop();
    expect(worker.port).toBe(0);
    expect(child.kill).not.toHaveBeenCalled();
  });
});
