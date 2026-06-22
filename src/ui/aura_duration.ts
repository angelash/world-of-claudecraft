import { formatNumber } from './i18n';

function twoDigit(n: number): string {
  return formatNumber(n, { minimumIntegerDigits: 2, maximumFractionDigits: 0, useGrouping: false });
}

function whole(n: number): string {
  return formatNumber(n, { maximumFractionDigits: 0, useGrouping: false });
}

export function formatAuraDuration(remainingSeconds: number): string {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return '';
  const totalSeconds = Math.ceil(remainingSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${whole(hours)}:${twoDigit(minutes)}:${twoDigit(seconds)}`;
  return `${whole(minutes)}:${twoDigit(seconds)}`;
}
