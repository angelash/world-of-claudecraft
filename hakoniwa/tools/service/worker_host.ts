import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

async function freePort(): Promise<number> {
  const probe = createServer();
  return new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error('No private worker port'))));
    });
  });
}
export class WorkerHost {
  private child: ChildProcess | null = null;
  private stopping: Promise<void> | null = null;
  port = 0;
  constructor(
    private root: string,
    private stateDir: string,
    private exited: () => void,
  ) {}
  async start(): Promise<void> {
    if (this.stopping) await this.stopping;
    if (this.child) throw new Error('Worker already running');
    const port = await freePort();
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(this.root, 'tools/service/worker.ts')],
      {
        cwd: this.root,
        windowsHide: true,
        env: {
          ...process.env,
          HAKONIWA_PROJECT_ROOT: this.root,
          HAKONIWA_SERVICE_STATE: this.stateDir,
          HAKONIWA_WORKER_PORT: String(port),
          HAKONIWA_MANAGED_SERVICE: '1',
          HAKONIWA_DEV_API_REMOTE: '0',
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    );
    this.child = child;
    child.on('error', (err) => console.error('[service] owned worker process error', err.message));
    child.once('exit', () => {
      if (this.child === child) {
        this.child = null;
        this.port = 0;
        this.exited();
      }
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Worker startup timed out'));
        }, 45000);
        const cleanup = () => {
          clearTimeout(timer);
          child.off('message', ready);
          child.off('exit', failed);
          child.off('error', error);
        };
        const ready = (msg: unknown) => {
          if ((msg as { type?: string })?.type === 'ready') {
            cleanup();
            resolve();
          }
        };
        const failed = () => {
          cleanup();
          reject(new Error('Worker exited before ready'));
        };
        const error = (err: Error) => {
          cleanup();
          reject(err);
        };
        child.on('message', ready);
        child.once('exit', failed);
        child.once('error', error);
      });
      this.port = port;
    } catch (err) {
      await this.stop();
      throw err;
    }
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const child = this.child;
    if (!child) return Promise.resolve();
    this.port = 0;
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      this.child = null;
      return Promise.resolve();
    }
    this.stopping = new Promise<void>((resolve, reject) => {
      const force = setTimeout(() => child.kill(), 7000);
      const deadline = setTimeout(() => {
        clearTimeout(force);
        reject(new Error('Owned worker did not stop within12seconds'));
      }, 12000);
      child.once('close', () => {
        clearTimeout(force);
        clearTimeout(deadline);
        if (this.child === child) this.child = null;
        resolve();
      });
      if (child.connected)
        child.send({ type: 'stop' }, (err) => {
          if (err) child.kill();
        });
      else child.kill();
    }).finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }
}
