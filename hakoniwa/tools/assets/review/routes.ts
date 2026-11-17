// HTTP routes of the asset review desk, mounted by tools/dev_api.ts on the dev server:
//   GET  /api/assets             rows (every id with a record or pool takes), coverage
//                                counts per kind, reason codes, the tool register
//   GET  /api/assets/log?id=     the review trail (assets/review_log.jsonl), one id or all
//   POST /api/assets/adopt       { id, keys[], reviewer, note, replace? }: pool takes become
//                                the original, registered with status review
//   POST /api/assets/review      { id, status, reasons[], note, reviewer }: a decision
// The dev API already serves loopback only; writes also refuse cross-origin pages, so a
// page on another local port cannot change the manifest. Files themselves are served by
// Vite from /assets/ (pool takes under /assets/_candidates/).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { STATUSES, type Status } from '../core/manifest';
import { adopt, deskPaths, listDesk, ReviewError, readLog, review } from './store';

export interface RouteKit {
  readJsonBody(req: IncomingMessage, limit: number): Promise<unknown>;
  send(res: ServerResponse, status: number, body: unknown): void;
}

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

const BODY_LIMIT = 16 * 1024;

/** A write must come from the page's own origin (or carry no Origin, as tools do). */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function assetReviewRoutes(root: string, kit: RouteKit): Record<string, Handler> {
  const paths = deskPaths(root);
  const guard = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (sameOrigin(req)) return true;
    kit.send(res, 403, { ok: false, error: 'cross_origin' });
    return false;
  };
  const fail = (res: ServerResponse, err: unknown) => {
    if (err instanceof ReviewError) {
      kit.send(res, 400, { ok: false, error: err.code, details: err.details });
      return;
    }
    // Unexpected failures (an ffmpeg decode, a locked file) reach the page as "internal";
    // the cause goes to the dev server log.
    console.error('[asset review]', err);
    throw err;
  };
  return {
    'GET /api/assets': async (_req, res) => {
      kit.send(res, 200, { ok: true, ...listDesk(paths) });
    },
    'GET /api/assets/log': async (_req, res, url) => {
      const id = url.searchParams.get('id') ?? undefined;
      kit.send(res, 200, { ok: true, events: readLog(paths, id || undefined) });
    },
    'POST /api/assets/adopt': async (req, res) => {
      if (!guard(req, res)) return;
      const body = (await kit.readJsonBody(req, BODY_LIMIT)) as Record<string, unknown> | null;
      try {
        const out = adopt(paths, {
          id: text(body?.id),
          keys: list(body?.keys),
          reviewer: text(body?.reviewer),
          note: text(body?.note).slice(0, 2000),
          replace: body?.replace === true,
        });
        kit.send(res, 200, { ok: true, ...out });
      } catch (err) {
        fail(res, err);
      }
    },
    'POST /api/assets/review': async (req, res) => {
      if (!guard(req, res)) return;
      const body = (await kit.readJsonBody(req, BODY_LIMIT)) as Record<string, unknown> | null;
      const status = text(body?.status) as Status;
      if (!STATUSES.includes(status)) {
        kit.send(res, 400, {
          ok: false,
          error: 'bad_decision',
          details: [`unknown status ${status}`],
        });
        return;
      }
      try {
        const out = review(paths, text(body?.id), {
          status,
          reasons: list(body?.reasons),
          note: text(body?.note).slice(0, 2000),
          reviewer: text(body?.reviewer).slice(0, 80),
        });
        kit.send(res, 200, { ok: true, ...out });
      } catch (err) {
        fail(res, err);
      }
    },
  };
}
