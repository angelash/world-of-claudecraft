import os from 'node:os';

export const DEFAULT_LAN_BIND_HOST = '0.0.0.0';

function trimEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isIpv4(address) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address);
}

function isPrivateIpv4(address) {
  if (!isIpv4(address)) return false;
  if (address.startsWith('10.')) return true;
  if (address.startsWith('192.168.')) return true;
  const match = /^172\.(\d{1,3})\./.exec(address);
  if (!match) return false;
  const second = Number(match[1]);
  return Number.isInteger(second) && second >= 16 && second <= 31;
}

function lanAddressRank(address) {
  if (isPrivateIpv4(address)) return 0;
  if (address.startsWith('169.254.')) return 2;
  return 1;
}

export function resolveForcedLanBindHost(env = process.env) {
  return trimEnv(env.WOC_LAN_BIND_HOST)
    || trimEnv(env.LAN_BIND_HOST)
    || DEFAULT_LAN_BIND_HOST;
}

export function resolveLanBindHost(env = process.env) {
  return trimEnv(env.WOC_LAN_BIND_HOST)
    || trimEnv(env.LAN_BIND_HOST)
    || trimEnv(env.HOST)
    || trimEnv(env.BIND_HOST)
    || trimEnv(env.VITE_DEV_HOST)
    || DEFAULT_LAN_BIND_HOST;
}

export function hostForLocalProbe(bindHost) {
  if (bindHost === '0.0.0.0') return '127.0.0.1';
  if (bindHost === '::') return '[::1]';
  return bindHost.includes(':') && !bindHost.startsWith('[') ? `[${bindHost}]` : bindHost;
}

export function listLanIpv4s(networkInterfaces = os.networkInterfaces()) {
  const found = [];
  for (const infos of Object.values(networkInterfaces)) {
    for (const info of infos ?? []) {
      if (!info || info.family !== 'IPv4' || info.internal || !isIpv4(info.address)) continue;
      found.push(info.address);
    }
  }
  return [...new Set(found)].sort((a, b) => {
    const rankDiff = lanAddressRank(a) - lanAddressRank(b);
    return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
  });
}

export function preferredLanIpv4(networkInterfaces = os.networkInterfaces()) {
  return listLanIpv4s(networkInterfaces)[0] ?? '';
}

export function lanUrls(port, networkInterfaces = os.networkInterfaces()) {
  return listLanIpv4s(networkInterfaces).map((address) => `http://${address}:${port}`);
}
