import {
  BROWSER_BODY_CLASSES,
  browserBodyClasses,
  cssEffectsTier,
  readBrowserEnv,
} from '../game/browser_env';
import { isPhoneTouchDevice } from '../game/mobile_controls';
import { Settings } from '../game/settings';

import { mountForkShell } from './shell_mount';

export { mountForkShell } from './shell_mount';

let mobileMenuWired = false;
let lastNativeMenuToggleAt = 0;

function setForkHeaderMenuOpen(open: boolean): void {
  const homepageHeader = document.querySelector('.homepage-header');
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const headerMenu = document.getElementById('header-menu-container') as HTMLElement | null;
  if (!homepageHeader || !mobileMenuToggle) return;
  homepageHeader.classList.toggle('menu-open', open);
  mobileMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (headerMenu) headerMenu.style.display = open ? 'flex' : '';
}

function wireForkHeaderMenuToggle(): void {
  if (mobileMenuWired) return;
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const homepageHeader = document.querySelector('.homepage-header');
  if (!mobileMenuToggle || !homepageHeader) return;
  mobileMenuWired = true;
  const toggleMobileMenu = () =>
    setForkHeaderMenuOpen(!homepageHeader.classList.contains('menu-open'));
  const handleNativeMenuToggle = (e: Event) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest('#mobile-menu-toggle')) return;
    const now = Date.now();
    if (now - lastNativeMenuToggleAt <= 250) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastNativeMenuToggleAt = now;
    e.preventDefault();
    e.stopPropagation();
    toggleMobileMenu();
  };
  document.addEventListener('pointerup', handleNativeMenuToggle, true);
  document.addEventListener('touchend', handleNativeMenuToggle, { capture: true, passive: false });
  mobileMenuToggle.addEventListener('click', () => {
    if (Date.now() - lastNativeMenuToggleAt <= 250) return;
    toggleMobileMenu();
  });
}

function initForkBackgroundEmbers(): void {
  if (isPhoneTouchDevice()) return;
  const backdrop = document.getElementById('start-screen-backdrop');
  if (!backdrop || backdrop.querySelector('.embers-container')) return;

  const container = document.createElement('div');
  container.className = 'embers-container';
  backdrop.appendChild(container);

  for (let i = 0; i < 24; i += 1) {
    const ember = document.createElement('div');
    ember.className = 'ember';
    ember.style.left = `${Math.random() * 100}%`;
    ember.style.bottom = `${Math.random() * 20 - 10}%`;

    const size = Math.random() * 4 + 2;
    ember.style.width = `${size}px`;
    ember.style.height = `${size}px`;

    ember.style.setProperty('--drift', `${Math.random() * 120 - 60}px`);
    ember.style.setProperty('--ember-scale', `${Math.random() * 0.8 + 0.6}`);
    ember.style.setProperty('--ember-opacity', `${Math.random() * 0.4 + 0.5}`);

    ember.style.animationDelay = `${Math.random() * 10}s`;
    ember.style.animationDuration = `${Math.random() * 8 + 6}s`;
    container.appendChild(ember);
  }
}

function stampLandingBrowserClasses(landingSettings: Settings): void {
  const landingEnv = readBrowserEnv();
  const landingTier = cssEffectsTier({
    engine: landingEnv.engine,
    version: landingEnv.engineVersion,
    mobile: landingEnv.mobile,
    renderTier: 'high',
    override: landingSettings.get('browserEffects') as number,
  });
  const body = document.body.classList;
  body.remove(...BROWSER_BODY_CLASSES);
  body.add(...browserBodyClasses(landingEnv, landingTier));
}

export function syncForkShellMode(nativeApp: boolean, useTouchInterface: () => boolean): void {
  const communityMenu = document.getElementById('community-menu') as HTMLDetailsElement | null;
  if (!communityMenu) return;
  communityMenu.open = !(nativeApp || useTouchInterface());
}

export function collapseForkHeaderMenu(): void {
  setForkHeaderMenuOpen(false);
}

export function bootstrapForkShell(applyLandingBackdrop: (highContrast: boolean) => void): void {
  mountForkShell();
  wireForkHeaderMenuToggle();
  initForkBackgroundEmbers();

  const landingSettings = new Settings();
  const contrastToggle = document.getElementById(
    'landing-contrast-toggle',
  ) as HTMLButtonElement | null;
  const syncContrastToggle = (on: boolean): void => {
    contrastToggle?.setAttribute('aria-pressed', String(on));
  };

  syncContrastToggle(landingSettings.get('landingHighContrast'));
  applyLandingBackdrop(landingSettings.get('landingHighContrast'));
  stampLandingBrowserClasses(landingSettings);

  if (contrastToggle?.dataset.forkShellBound === '1') return;
  if (!contrastToggle) return;
  contrastToggle.dataset.forkShellBound = '1';
  contrastToggle.addEventListener('click', () => {
    const next = !landingSettings.get('landingHighContrast');
    landingSettings.set('landingHighContrast', next);
    syncContrastToggle(next);
    applyLandingBackdrop(next);
  });
}
