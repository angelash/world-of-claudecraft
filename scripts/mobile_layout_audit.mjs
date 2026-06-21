// Mobile layout audit matrix.
// Boots the offline game on representative phone viewports, captures screenshots,
// and checks coarse layout invariants: no horizontal overflow, reachable touch
// controls, no off-screen More tray rows, and explicit portrait-gate reporting.
//
// Needs `npm run dev` running on :5173.
//   node scripts/mobile_layout_audit.mjs
//   EXPECT_PORTRAIT_PLAYABLE=1 node scripts/mobile_layout_audit.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BROWSER_PATH } from './browser_path.mjs';

const BASE_URL = process.env.GAME_URL ?? 'http://localhost:5173';
const OUT_DIR = process.env.OUT_DIR ?? 'tmp/mobile-audit';
const EXPECT_PORTRAIT_PLAYABLE = process.env.EXPECT_PORTRAIT_PLAYABLE === '1';
const WAIT = 30000;

const VIEWPORTS = [
  {
    name: 'landscape',
    width: 844,
    height: 390,
    deviceScaleFactor: 2,
    portraitExpected: false,
  },
  {
    name: 'short-landscape',
    width: 740,
    height: 360,
    deviceScaleFactor: 2,
    portraitExpected: false,
  },
  {
    name: 'portrait',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    portraitExpected: true,
  },
];

mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function alphaSuffix() {
  return Date.now().toString(36)
    .replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
    .slice(-7);
}

function viewportConfig(v) {
  return {
    width: v.width,
    height: v.height,
    deviceScaleFactor: v.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  };
}

async function forceCoarsePointer(page) {
  try {
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'pointer', value: 'coarse' }],
    });
  } catch {
    // Device emulation is enough in many Chromium builds.
  }
}

async function bootOffline(page, viewport) {
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36');
  await page.setViewport(viewportConfig(viewport));
  await forceCoarsePointer(page);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: WAIT });
  await page.waitForSelector('#btn-offline', { timeout: WAIT });
  await openOfflinePanel(page);
  await page.evaluate(() => {
    const input = document.querySelector('#char-name');
    if (input) input.value = '';
  });
  await page.type('#char-name', `Mob${alphaSuffix()}`);
  await page.click('#offline-select .mini-class[data-class="warrior"]');
  await page.click('#btn-start-offline');
  await sleep(400);
  await page.evaluate(() => document.getElementById('mobile-preflight-continue')?.click());
  await page.waitForFunction(() => {
    return Boolean(window.__game?.sim?.player && document.body.classList.contains('game-active'));
  }, { timeout: 60000, polling: 250 });
  await sleep(800);
}

async function openOfflinePanel(page) {
  const deadline = Date.now() + WAIT;
  while (Date.now() < deadline) {
    const opened = await page.evaluate(() => {
      const offline = document.querySelector('#offline-select');
      if (offline && !offline.hasAttribute('hidden')) return true;
      document.querySelector('#btn-offline')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return !!offline && !offline.hasAttribute('hidden');
    });
    if (opened) return;
    await sleep(250);
  }
  throw new Error('Timed out opening #offline-select');
}

function auditLayoutInPage(viewportName, portraitExpected, expectPortraitPlayable) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const body = document.body;
  const root = document.documentElement;
  const rotate = document.getElementById('rotate-device');
  const rotateVisible = !!rotate && getComputedStyle(rotate).display !== 'none';
  const mobileTouch = body.classList.contains('mobile-touch');
  const gameActive = body.classList.contains('game-active');

  const failures = [];
  const warnings = [];
  const notes = [];

  const docWidth = Math.max(root.scrollWidth, body.scrollWidth);
  if (docWidth > vw + 1) failures.push(`horizontal overflow: document ${docWidth}px > viewport ${vw}px`);

  const visibleRect = (selector) => {
    const el = document.querySelector(selector);
    if (!el || getComputedStyle(el).display === 'none') return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      top: Math.round(r.top),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };

  const selectors = [
    '#mobile-controls',
    '#mobile-combat-controls',
    '#mobile-move-joystick',
    '#mobile-camera-joystick',
    '#bottom-bar',
    '#mobile-extra-controls',
    '#player-frame',
    '#target-frame',
    '#minimap-wrap',
    '#meters-window',
    '#chatlog-wrap',
    '#rotate-device',
  ];
  const rects = Object.fromEntries(selectors.map((selector) => [selector, visibleRect(selector)]));

  const criticalOffscreen = [];
  for (const [selector, rect] of Object.entries(rects)) {
    if (!rect) continue;
    if (selector === '#rotate-device') continue;
    if (rect.right < -1 || rect.left > vw + 1 || rect.bottom < -1 || rect.top > vh + 1) {
      criticalOffscreen.push(`${selector} outside viewport (${JSON.stringify(rect)})`);
    }
    if (
      selector === '#mobile-extra-controls' &&
      (rect.left < -1 || rect.top < -1 || rect.right > vw + 1 || rect.bottom > vh + 1)
    ) {
      criticalOffscreen.push(`${selector} clipped by viewport (${JSON.stringify(rect)})`);
    }
  }
  if (criticalOffscreen.length > 0) failures.push(...criticalOffscreen);

  const smallTargets = [];
  for (const el of document.querySelectorAll('#mobile-combat-controls .mobile-btn, #mobile-extra-controls .mobile-btn, .action-btn')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.width < 40 || r.height < 40) {
      smallTargets.push(`${el.id || el.className}: ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  if (smallTargets.length > 0) failures.push(`touch targets below 40px: ${smallTargets.join(', ')}`);

  const move = document.getElementById('mobile-move-joystick')?.getBoundingClientRect();
  const camera = document.getElementById('mobile-camera-joystick')?.getBoundingClientRect();
  const combat = document.getElementById('mobile-combat-controls')?.getBoundingClientRect();
  const actionbar = document.getElementById('bottom-bar')?.getBoundingClientRect();
  const overlaps = [];
  const overlap = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  if (overlap(move, combat)) overlaps.push('move joystick overlaps combat row');
  if (overlap(camera, combat)) overlaps.push('camera joystick overlaps combat row');
  if (overlap(move, actionbar)) overlaps.push('move joystick overlaps action bar');
  if (overlap(camera, actionbar)) overlaps.push('camera joystick overlaps action bar');
  if (overlap(move, camera)) overlaps.push('move joystick overlaps camera joystick');
  if (overlaps.length > 0) {
    if (expectPortraitPlayable) failures.push(...overlaps);
    else warnings.push(...overlaps);
  }

  if (portraitExpected && rotateVisible) {
    const message = 'portrait is gated by rotate-device overlay';
    if (expectPortraitPlayable) failures.push(message);
    else notes.push(message);
  }
  if (!portraitExpected && rotateVisible) failures.push(`${viewportName} unexpectedly shows rotate-device overlay`);

  return {
    viewportName,
    viewport: { width: vw, height: vh },
    mobileTouch,
    gameActive,
    rotateVisible,
    horizontalOverflowPx: Math.max(0, docWidth - vw),
    rects,
    failures,
    warnings,
    notes,
  };
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(`PAGEERROR: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`CONSOLE: ${msg.text()}`);
  });

  try {
    await bootOffline(page, viewport);
    const hudShot = path.join(OUT_DIR, `${viewport.name}-hud.png`);
    await page.screenshot({ path: hudShot });
    const hud = await page.evaluate(auditLayoutInPage, viewport.name, viewport.portraitExpected, EXPECT_PORTRAIT_PLAYABLE);

    await page.evaluate(() => document.getElementById('mobile-more')?.click());
    await sleep(350);
    const moreShot = path.join(OUT_DIR, `${viewport.name}-more.png`);
    await page.screenshot({ path: moreShot });
    const more = await page.evaluate(auditLayoutInPage, `${viewport.name}-more`, viewport.portraitExpected, EXPECT_PORTRAIT_PLAYABLE);

    const allFailures = [...hud.failures, ...more.failures, ...pageErrors];
    return {
      name: viewport.name,
      screenshots: { hud: hudShot, more: moreShot },
      hud,
      more,
      pageErrors,
      ok: allFailures.length === 0,
    };
  } finally {
    await page.close();
  }
}

const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

const results = [];
try {
  for (const viewport of VIEWPORTS) {
    console.log(`auditing ${viewport.name} (${viewport.width}x${viewport.height})...`);
    results.push(await runViewport(browser, viewport));
  }
} finally {
  await browser.close();
}

const report = {
  baseUrl: BASE_URL,
  expectPortraitPlayable: EXPECT_PORTRAIT_PLAYABLE,
  generatedAt: new Date().toISOString(),
  results,
};
const reportPath = path.join(OUT_DIR, 'report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

let failures = 0;
for (const result of results) {
  const allFailures = [
    ...result.hud.failures.map((m) => `HUD: ${m}`),
    ...result.more.failures.map((m) => `More: ${m}`),
    ...result.pageErrors,
  ];
  const notes = [...result.hud.notes, ...result.more.notes];
  const warnings = [...result.hud.warnings, ...result.more.warnings];
  failures += allFailures.length;
  console.log(`\n${result.name}: ${allFailures.length === 0 ? 'OK' : 'FAIL'}`);
  if (notes.length > 0) console.log(`  notes: ${notes.join('; ')}`);
  if (warnings.length > 0) console.log(`  warnings: ${warnings.join('; ')}`);
  for (const failure of allFailures) console.log(`  FAIL: ${failure}`);
}

console.log(`\nreport: ${reportPath}`);
console.log(`screenshots: ${OUT_DIR}`);
process.exit(failures > 0 ? 1 : 0);
