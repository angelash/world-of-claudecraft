// Ambient player bot admin smoke test against a running realm.
// Verifies: admin login, combined diagnostics, config echo, runtime control
// toggles, and optional logout-all incident control.
import process from 'node:process';

const BASE = process.env.SERVER_URL ?? 'http://localhost:8787';
const ADMIN_USER = process.env.AMBIENT_ADMIN_USER ?? '';
const ADMIN_PASS = process.env.AMBIENT_ADMIN_PASS ?? '';
const ALLOW_LOGOUT = process.env.AMBIENT_SMOKE_ALLOW_LOGOUT === '1';

let pass = 0;
let fail = 0;
let warn = 0;

function ok(name, extra = '') {
  pass++;
  console.log(`OK   ${name}${extra ? ` ${extra}` : ''}`);
}

function no(name, extra = '') {
  fail++;
  console.log(`FAIL ${name}${extra ? ` ${extra}` : ''}`);
}

function caution(name, extra = '') {
  warn++;
  console.log(`WARN ${name}${extra ? ` ${extra}` : ''}`);
}

async function api(path, opts = {}, token = null) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  if (!ADMIN_USER || !ADMIN_PASS) {
    console.error('Set AMBIENT_ADMIN_USER and AMBIENT_ADMIN_PASS before running this smoke.');
    process.exit(2);
  }

  const status = await api('/api/status');
  if (status.status === 200 && status.body.ok) ok('server status', `realm=${status.body.realm ?? 'unknown'}`);
  else no('server status', `status=${status.status}`);

  const login = await api('/admin/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (login.status === 200 && login.body.success && login.body.data?.token) {
    ok('admin login');
  } else {
    no('admin login', `status=${login.status} error=${login.body.error ?? 'unknown'}`);
    throw new Error('admin login failed');
  }
  const token = login.body.data.token;

  const diagnostics = await api('/admin/api/ambient-bots', {}, token);
  if (diagnostics.status === 200 && diagnostics.body.success && diagnostics.body.data?.planner) {
    ok('ambient bot diagnostics');
  } else {
    no('ambient bot diagnostics', `status=${diagnostics.status}`);
    throw new Error('ambient bot diagnostics failed');
  }

  const planner = diagnostics.body.data.planner;
  const runtime = diagnostics.body.data.runtime;
  const originalControls = runtime?.controls ?? null;
  const configPatch = {
    soloTargetBots: planner.config.soloTargetBots,
    maxBotsPerCluster: planner.config.maxBotsPerCluster,
    recentActionLimit: planner.config.recentActionLimit,
  };
  const configResponse = await api('/admin/api/ambient-bots/config', {
    method: 'POST',
    body: JSON.stringify(configPatch),
  }, token);
  if (configResponse.status === 200 && configResponse.body.success) {
    ok('planner config route');
  } else {
    no('planner config route', `status=${configResponse.status} error=${configResponse.body.error ?? 'unknown'}`);
  }

  if (!originalControls) {
    caution('runtime controls', 'ambient bot runtime is not active on this process');
  } else {
    const pausePatch = {
      acceptProvisionActions: false,
      acceptLoginActions: false,
      allowLlmDecisions: false,
    };
    try {
      const pauseResponse = await api('/admin/api/ambient-bots/control', {
        method: 'POST',
        body: JSON.stringify(pausePatch),
      }, token);
      if (pauseResponse.status === 200 && pauseResponse.body.success) {
        ok('runtime control route');
      } else {
        no('runtime control route', `status=${pauseResponse.status} error=${pauseResponse.body.error ?? 'unknown'}`);
      }

      if (ALLOW_LOGOUT) {
        const logoutResponse = await api('/admin/api/ambient-bots/logout-all', {
          method: 'POST',
          body: JSON.stringify({ reason: 'ambient bot smoke drill' }),
        }, token);
        if (logoutResponse.status === 200 && logoutResponse.body.success) {
          const result = logoutResponse.body.data?.result ?? {};
          ok('logout-all route', `runners=${result.disconnectedRunners ?? 0} resets=${result.resetRecords ?? 0}`);
        } else {
          no('logout-all route', `status=${logoutResponse.status} error=${logoutResponse.body.error ?? 'unknown'}`);
        }
      } else {
        caution('logout-all route', 'set AMBIENT_SMOKE_ALLOW_LOGOUT=1 to exercise incident control');
      }
    } finally {
      const restoreResponse = await api('/admin/api/ambient-bots/control', {
        method: 'POST',
        body: JSON.stringify(originalControls),
      }, token);
      if (restoreResponse.status === 200 && restoreResponse.body.success) {
        ok('restore runtime controls');
      } else {
        no('restore runtime controls', `status=${restoreResponse.status} error=${restoreResponse.body.error ?? 'unknown'}`);
      }
    }
  }

  console.log(`\nSummary: ${pass} passed, ${warn} warnings, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
