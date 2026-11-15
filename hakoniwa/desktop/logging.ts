// Shell logging (docs/50_tech/release_engineering.md 12.1 and 2.6 "log redaction"):
// redact() scrubs every line before it is written: strings shaped like sk-, sk-ant- and
// Bearer credentials, credential headers, and any fragment of a secret the caller currently
// holds. createRotatingLog() appends to logs/main.log or logs/renderer.log and keeps one
// archive at 5 MB. Logging never throws into the caller.

export type LogLevel = 'error' | 'warn' | 'info';

/** Longest single message kept; the rest is cut. */
export const MAX_LOG_MESSAGE = 4000;
/** Rotation size per file (12.1: 5 MB plus one archive). */
export const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
/** A secret fragment this long or longer is scrubbed wherever it appears. */
export const SECRET_FRAGMENT = 8;

const MASK = '[redacted]';

const PATTERNS: readonly [RegExp, string][] = [
  [/\bsk-(ant-)?[A-Za-z0-9_-]{4,}/g, `sk-$1${MASK}`],
  [/\bBearer\s+[^\s"',;]+/gi, `Bearer ${MASK}`],
  [
    /\b(x-api-key|api-key|authorization|proxy-authorization)(["']?\s*[:=]\s*["']?)(?!Bearer\b)[^\s"',;]+/gi,
    `$1$2${MASK}`,
  ],
];

/** Mark every position of `text` covered by a fragment (>= SECRET_FRAGMENT chars) of `secret`. */
function markFragments(text: string, secret: string, marks: Uint8Array): void {
  if (secret.length === 0) return;
  if (secret.length < SECRET_FRAGMENT) {
    let at = text.indexOf(secret);
    while (at >= 0) {
      marks.fill(1, at, at + secret.length);
      at = text.indexOf(secret, at + 1);
    }
    return;
  }
  const grams = new Set<string>();
  for (let i = 0; i + SECRET_FRAGMENT <= secret.length; i++) {
    grams.add(secret.slice(i, i + SECRET_FRAGMENT));
  }
  for (let i = 0; i + SECRET_FRAGMENT <= text.length; i++) {
    if (grams.has(text.slice(i, i + SECRET_FRAGMENT))) marks.fill(1, i, i + SECRET_FRAGMENT);
  }
}

/**
 * Scrub credentials from a log message: secret fragments first (the caller's held keys),
 * then the credential shapes; control characters become spaces so one call is one line;
 * the result is cut to MAX_LOG_MESSAGE.
 */
export function redact(message: string, secrets: readonly string[] = []): string {
  let text = String(message);
  if (secrets.length > 0) {
    const marks = new Uint8Array(text.length);
    for (const s of secrets) markFragments(text, s, marks);
    let out = '';
    let i = 0;
    while (i < text.length) {
      if (marks[i] === 1) {
        while (i < text.length && marks[i] === 1) i++;
        out += MASK;
      } else {
        out += text[i];
        i++;
      }
    }
    text = out;
  }
  for (const [re, to] of PATTERNS) text = text.replace(re, to);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the target
  text = text.replace(/[\u0000-\u001f\u007f]+/g, ' ');
  return text.length > MAX_LOG_MESSAGE ? `${text.slice(0, MAX_LOG_MESSAGE)}...` : text;
}

/** One log line: ISO time, level, scope, redacted message. */
export function formatLogLine(
  at: Date,
  level: LogLevel,
  scope: string,
  message: string,
  secrets: readonly string[] = [],
): string {
  return `${at.toISOString()} ${level.toUpperCase()} [${scope}] ${redact(message, secrets)}\n`;
}

/** The file operations a rotating log needs (node:fs in the shell, a map in tests). */
export interface LogFs {
  appendFileSync(path: string, data: string): void;
  statSync(path: string): { size: number };
  renameSync(from: string, to: string): void;
  existsSync(path: string): boolean;
}

export interface RotatingLog {
  write(level: LogLevel, scope: string, message: string): void;
}

/**
 * Append-only log with one archive (`<file>.1`): before a write that would pass maxBytes,
 * the file is renamed over the archive. Every file error is swallowed.
 */
export function createRotatingLog(opts: {
  file: string;
  fs: LogFs;
  now?: () => Date;
  maxBytes?: number;
  secrets?: () => readonly string[];
}): RotatingLog {
  const maxBytes = opts.maxBytes ?? LOG_ROTATE_BYTES;
  const now = opts.now ?? (() => new Date());
  return {
    write(level, scope, message) {
      try {
        const line = formatLogLine(now(), level, scope, message, opts.secrets?.() ?? []);
        if (opts.fs.existsSync(opts.file)) {
          const size = opts.fs.statSync(opts.file).size;
          if (size + line.length > maxBytes) opts.fs.renameSync(opts.file, `${opts.file}.1`);
        }
        opts.fs.appendFileSync(opts.file, line);
      } catch {
        // Logging must never be the thing that breaks the shell.
      }
    },
  };
}
