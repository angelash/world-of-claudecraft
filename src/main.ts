import { Sim } from './sim/sim';
import { Renderer } from './render/renderer';
import { Input } from './game/input';
import { Hud } from './ui/hud';
import { audio } from './game/audio';
import { music } from './game/music';
import { handlePickedEntity } from './game/interactions';
import { Api, ClientWorld, CharacterSummary } from './net/online';
import type { IWorld } from './world_api';
import { assetsReady } from './render/assets/preload';
import { DT, INTERACT_RANGE, PlayerClass, dist2d } from './sim/types';
import { togglePasswordVisibility, syncInputAriaState, validateForm, handleKeyboardActivation, validateCharacterName } from './ui/auth_utils';


const WORLD_SEED = 20061; // fixed: World of Claudecraft is a persistent place

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

// ---------------------------------------------------------------------------
// Loading screen (shown from "enter world" until the first frame renders)
// ---------------------------------------------------------------------------

const LOADING_FADE_MS = 350; // keep in sync with the #loading-screen CSS transition

let loadingHideTimer: number | null = null;

function showLoadingScreen(statusText: string): void {
  const el = $('#loading-screen');
  if (loadingHideTimer !== null) {
    window.clearTimeout(loadingHideTimer);
    loadingHideTimer = null;
  }
  el.classList.remove('fade');
  el.classList.add('visible');
  setLoadingStatus(statusText);
}

function setLoadingStatus(text: string): void {
  $('#ls-status').textContent = text;
}

function setLoadingProgress(done: number, total: number): void {
  $('#ls-fill').style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
  setLoadingStatus(`Loading world… ${done}/${total}`);
}

function hideLoadingScreen(): void {
  const el = $('#loading-screen');
  if (!el.classList.contains('visible')) return;
  el.classList.add('fade');
  loadingHideTimer = window.setTimeout(() => {
    el.classList.remove('visible', 'fade');
    loadingHideTimer = null;
  }, LOADING_FADE_MS);
}

// The loading screen blocks pointer input but a covered button keeps keyboard
// focus, so Enter/Space could re-fire it mid-entry. One entry per page load;
// every failure path recovers via fatalOverlay's reload.
let hasBegunWorldEntry = false;

function beginWorldEntry(): boolean {
  if (hasBegunWorldEntry) return false;
  hasBegunWorldEntry = true;
  return true;
}

// ---------------------------------------------------------------------------
// Shared game wiring (used by both offline sim and online world)
// ---------------------------------------------------------------------------

async function startGame(world: IWorld, offlineSim: Sim | null, online: ClientWorld | null): Promise<void> {
  // Model/texture/HDRI fetches were kicked off at module import; the renderer
  // builds its scene synchronously, so everything must be resolved first.
  // The loading screen covers the gap — not a silent black screen.
  showLoadingScreen('Loading world…');
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  $('#start-screen').style.display = 'none';
  try {
    await assetsReady((done, total) => setLoadingProgress(done, total));
  } catch (err) {
    fatalOverlay(`Asset loading failed — try reloading. ${err instanceof Error ? err.message : err}`);
    return;
  }
  setLoadingStatus('Entering the world…');

  const canvas = $('#game-canvas') as unknown as HTMLCanvasElement;
  const nameplates = $('#nameplates') as HTMLDivElement;

  let renderer!: Renderer;
  let hud!: Hud;
  try {
    renderer = new Renderer(world, canvas, nameplates);
    hud = new Hud(world, renderer);
  } catch (err) {
    // e.g. WebGL context creation failure — surface it instead of leaving the
    // loading screen up forever
    fatalOverlay(`Could not start the renderer — try reloading. ${err instanceof Error ? err.message : err}`);
    return;
  }

  const chatInput = $('#chat-input') as unknown as HTMLInputElement;
  function openChat(): void {
    chatInput.style.display = 'block';
    chatInput.focus();
  }
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = chatInput.value.trim();
      if (text) world.chat(text);
      chatInput.value = '';
      chatInput.style.display = 'none';
      chatInput.blur();
    } else if (e.key === 'Escape') {
      chatInput.value = '';
      chatInput.style.display = 'none';
      chatInput.blur();
    }
  });

  const input = new Input(canvas, {
    onTab: () => world.tabTarget(),
    // slot 0 (key 1) is Attack for every class — auto-attack without needing
    // right-click; keys and clicks share the Hud's remappable slot layout
    onAbility: (slot) => hud.castSlot(slot),
    onUiKey: (key) => {
      switch (key) {
        case 'interact': interactKey(); break;
        case 'bags': hud.toggleBags(); break;
        case 'char': hud.toggleChar(); break;
        case 'spellbook': hud.toggleSpellbook(); break;
        case 'questlog': hud.toggleQuestLog(); break;
        case 'map': hud.toggleMap(); break;
        case 'nameplates': renderer.showNameplates = !renderer.showNameplates; break;
        case 'meters': hud.toggleMeters(); break;
        case 'chat': openChat(); break;
        case 'escape':
          if (!hud.closeAll()) world.targetEntity(null);
          break;
      }
    },
    onClickPick: (x, y, button) => handlePick(x, y, button),
  });
  input.camYaw = world.player.facing;

  function interactKey(): void {
    const p = world.player;
    let bestCorpse: number | null = null, bestCorpseD = INTERACT_RANGE;
    let bestObj: number | null = null, bestObjD = INTERACT_RANGE;
    let bestNpc: number | null = null, bestNpcD = INTERACT_RANGE + 1;
    for (const e of world.entities.values()) {
      const d = dist2d(p.pos, e.pos);
      if (e.kind === 'mob' && e.lootable && d < bestCorpseD) { bestCorpse = e.id; bestCorpseD = d; }
      if (e.kind === 'object' && e.lootable && d < bestObjD) { bestObj = e.id; bestObjD = d; }
      if (e.kind === 'npc' && d < bestNpcD) { bestNpc = e.id; bestNpcD = d; }
    }
    if (bestCorpse !== null) { world.lootCorpse(bestCorpse); return; }
    if (bestObj !== null) {
      const obj = world.entities.get(bestObj)!;
      if (obj.templateId === 'dungeon_door' && obj.dungeonId) { world.enterDungeon(obj.dungeonId); return; }
      if (obj.templateId === 'dungeon_exit') { world.leaveDungeon(); return; }
      world.pickUpObject(bestObj);
      return;
    }
    if (bestNpc !== null) { hud.openQuestDialog(bestNpc); return; }
    hud.showError('Nothing to interact with.');
  }

  function handlePick(x: number, y: number, button: number): void {
    const id = renderer.pick(x, y);
    if (id === null) {
      if (button === 0) world.targetEntity(null);
      return;
    }
    handlePickedEntity(world, hud, id, button, x, y);
  }

  let last = performance.now();
  let acc = 0;

  // Camera follow state: keyboard turning advances facing in 20Hz sim steps,
  // so the camera tracks the player's render-interpolated facing per frame
  // (same curve the character model follows) instead of the raw tick deltas —
  // that's what killed the turn stutter. While running, the orbit offset
  // eases back to zero so the camera settles in behind the character.
  let lastInterpFacing: number | null = null;
  const CAM_SETTLE_RATE = 3; // 1/s exponential ease

  function wrapAngle(d: number): number {
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function updateCamera(frameDt: number, interpFacing: number): void {
    if (!input.rightDown) {
      // follow turns 1:1 (keeps any manual orbit offset constant)
      if (lastInterpFacing !== null) input.camYaw += wrapAngle(interpFacing - lastInterpFacing);
      // settle behind the character while moving, unless the player is
      // actively holding an orbit drag
      const mi = input.readMoveInput();
      if ((mi.forward || mi.strafeLeft || mi.strafeRight) && !input.leftDown) {
        input.camYaw += wrapAngle(interpFacing - input.camYaw) * (1 - Math.exp(-frameDt * CAM_SETTLE_RATE));
      }
    }
    lastInterpFacing = interpFacing; // track through mouselook too — no snap on release
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    let frameDt = (now - last) / 1000;
    last = now;
    if (frameDt > 0.25) frameDt = 0.25;

    const mouselook = input.rightDown && !world.player.dead;

    if (offlineSim) {
      acc += frameDt;
      while (acc >= DT) {
        const mi = input.readMoveInput();
        Object.assign(offlineSim.moveInput, mi);
        if (mouselook) offlineSim.player.facing = input.camYaw;
        const events = offlineSim.tick();
        hud.handleEvents(events);
        acc -= DT;
      }
      const pp = offlineSim.player;
      updateCamera(frameDt, pp.prevFacing + wrapAngle(pp.facing - pp.prevFacing) * (acc / DT));
      renderer.camYaw = input.camYaw;
      renderer.camPitch = input.camPitch;
      renderer.camDist = input.camDist;
      renderer.sync(acc / DT, frameDt, mouselook ? input.camYaw : null);
      hud.update();
      return;
    }

    // online: inputs stream on a timer inside ClientWorld; here we mirror state
    const net = online!;
    Object.assign(net.moveInput, input.readMoveInput());
    net.setMouselookFacing(mouselook ? input.camYaw : null);
    net.pendingFacingDelta = 0; // superseded by the interpolated follow below
    hud.handleEvents(net.drainEvents());
    if (net.consumeInventoryChanged()) hud.onInventoryChanged();
    const alpha = net.lastSnapAt > 0
      ? Math.min(1.25, (performance.now() - net.lastSnapAt) / Math.max(20, net.snapInterval))
      : 1;
    const pe = world.player;
    // facing interp capped at 1 — extrapolating angles past the snapshot oscillates
    updateCamera(frameDt, pe.prevFacing + wrapAngle(pe.facing - pe.prevFacing) * Math.min(1, alpha));
    renderer.camYaw = input.camYaw;
    renderer.camPitch = input.camPitch;
    renderer.camDist = input.camDist;
    renderer.sync(alpha, frameDt, mouselook ? input.camYaw : null);
    hud.update();
  }
  requestAnimationFrame(frame);
  // cut to the game only once the first frame is actually on screen
  requestAnimationFrame(() => requestAnimationFrame(() => hideLoadingScreen()));

  (window as any).__game = { sim: world, world, renderer, input, hud, online };
}

// ---------------------------------------------------------------------------
// Offline flow
// ---------------------------------------------------------------------------

// Offline names go straight into innerHTML paths (quest $N text, char window
// title), so enforce the server's character-name rule client-side too:
// strip anything outside [A-Za-z' -], then require /^[A-Za-z][A-Za-z' -]{1,15}$/.
function sanitizeOfflineName(raw: string): string {
  const stripped = raw.replace(/[^A-Za-z' -]/g, '').replace(/^[^A-Za-z]+/, '').slice(0, 16);
  return /^[A-Za-z][A-Za-z' -]{1,15}$/.test(stripped) ? stripped : 'Adventurer';
}

function startOffline(playerClass: PlayerClass, name: string): void {
  if (!beginWorldEntry()) return;
  const sim = new Sim({ seed: WORLD_SEED, playerClass, playerName: name });
  void startGame(sim, sim, null);
}

// ---------------------------------------------------------------------------
// Online flow: login -> character select -> world
// ---------------------------------------------------------------------------

const api = new Api();

function show(el: string): void {
  if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
    document.activeElement.blur();
  }
  for (const id of ['#mode-select', '#login-panel', '#charselect-panel']) {
    $(id).toggleAttribute('hidden', id !== el);
  }
}

function loginError(text: string): void {
  const el = $('#login-error');
  el.textContent = text;
}

async function refreshCharacters(): Promise<void> {
  const listEl = $('#char-list');
  listEl.innerHTML = '<li class="char-list-message">Loading…</li>';
  try {
    const chars = await api.characters();
    listEl.innerHTML = '';
    if (chars.length === 0) {
      listEl.innerHTML = '<li class="char-list-message">No characters yet — create one below.</li>';
    }
    for (const c of chars) {
      const row = document.createElement('li');
      row.className = 'char-row' + (c.online ? ' online' : '');
      row.innerHTML = `<span class="char-name">${c.name}</span>
        <span class="char-sub">Level ${c.level} ${c.class[0].toUpperCase()}${c.class.slice(1)}${c.online ? ' — in world' : ''}</span>
        <button class="btn" ${c.online ? 'disabled' : ''}>Enter World</button>`;
      row.querySelector('button')!.addEventListener('click', () => enterWorld(c));
      listEl.appendChild(row);
    }
  } catch (err: any) {
    listEl.innerHTML = `<li class="char-list-message char-list-error">${err.message}</li>`;
  }
}

function fatalOverlay(message: string): void {
  hideLoadingScreen(); // its art would bleed through the translucent backdrop
  if (document.getElementById('disconnect-overlay')) return; // first reason wins
  const el = document.createElement('div');
  el.id = 'disconnect-overlay';
  el.className = 'fatal-overlay';
  el.innerHTML = `<div>${message}</div>`;
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Return to Login';
  btn.addEventListener('click', () => location.reload());
  el.appendChild(btn);
  document.body.appendChild(el);
}

function enterWorld(c: CharacterSummary): void {
  if (!beginWorldEntry()) return;
  audio.init();
  music.init();
  showLoadingScreen('Connecting to realm…');
  const world = new ClientWorld(api.token!, c.id, c.class);
  // wait for hello + first snapshot so the world starts populated
  const waitStart = Date.now();
  const poll = setInterval(() => {
    if (world.connected && world.entities.has(world.playerId)) {
      clearInterval(poll);
      void startGame(world, null, world);
    } else if (Date.now() - waitStart > 10000) {
      clearInterval(poll);
      world.close();
      fatalOverlay('Could not enter world (timeout). Is the game server running?');
    }
  }, 50);
  // a rejected join must stop the poll too, or its timeout overlay would
  // mask the real reason (e.g. "character already in world")
  world.onDisconnect = (reason) => {
    clearInterval(poll);
    fatalOverlay(reason);
  };
}

function wireStartScreens(): void {
  // mode select
  const onlineBtn = $('#btn-online');
  const offlineBtn = $('#btn-offline');
  
  const handleOnlineSelect = () => show('#login-panel');
  const handleOfflineSelect = () => {
    $('#mode-select').toggleAttribute('hidden', true);
    $('#offline-select').toggleAttribute('hidden', false);
  };
  
  onlineBtn.addEventListener('click', handleOnlineSelect);
  onlineBtn.addEventListener('keydown', (e) => handleKeyboardActivation(e as KeyboardEvent, handleOnlineSelect));
  
  offlineBtn.addEventListener('click', handleOfflineSelect);
  offlineBtn.addEventListener('keydown', (e) => handleKeyboardActivation(e as KeyboardEvent, handleOfflineSelect));

  // offline class cards
  const offlineNameInput = $('#char-name') as HTMLInputElement;
  const offlineError = $('#offline-error');
  document.querySelectorAll('.class-card').forEach((card) => {
    const handleClassSelect = () => {
      const rawName = offlineNameInput.value.trim();
      if (!rawName) {
        offlineError.textContent = 'Please enter a character name.';
        offlineNameInput.classList.add('user-invalid-fallback');
        offlineNameInput.setAttribute('aria-invalid', 'true');
        offlineNameInput.focus();
        return;
      }
      if (!validateCharacterName(rawName)) {
        offlineError.textContent = 'Name must be 2-16 characters, start with a letter, and contain only letters, spaces, hyphens, or apostrophes.';
        offlineNameInput.classList.add('user-invalid-fallback');
        offlineNameInput.setAttribute('aria-invalid', 'true');
        offlineNameInput.focus();
        return;
      }

      offlineError.textContent = '';
      offlineNameInput.classList.remove('user-invalid-fallback');
      offlineNameInput.removeAttribute('aria-invalid');

      audio.init();
      music.init();
      const name = sanitizeOfflineName(rawName);
      startOffline((card as HTMLElement).dataset.class as PlayerClass, name);
    };
    card.addEventListener('click', handleClassSelect);
    card.addEventListener('keydown', (e) => handleKeyboardActivation(e as KeyboardEvent, handleClassSelect));
  });

  const offlineBackBtn = $('#btn-offline-back');
  const handleOfflineBack = () => {
    $('#offline-select').toggleAttribute('hidden', true);
    $('#mode-select').toggleAttribute('hidden', false);
    offlineError.textContent = '';
    offlineNameInput.value = '';
    offlineNameInput.classList.remove('user-invalid-fallback');
    offlineNameInput.removeAttribute('aria-invalid');
  };
  offlineBackBtn.addEventListener('click', handleOfflineBack);

  // login
  const doAuth = async (mode: 'login' | 'register') => {
    const username = ($('#login-user') as unknown as HTMLInputElement).value.trim();
    const password = ($('#login-pass') as unknown as HTMLInputElement).value;
    loginError('');
    try {
      if (mode === 'login') await api.login(username, password);
      else await api.register(username, password);
      $('#charselect-user').textContent = api.username ?? '';
      show('#charselect-panel');
      await refreshCharacters();
    } catch (err: any) {
      loginError(err.message);
    }
  };

  const loginForm = $('#login-panel') as HTMLFormElement;
  const userInput = $('#login-user') as HTMLInputElement;
  const passInput = $('#login-pass') as HTMLInputElement;
  const togglePassBtn = $('#btn-toggle-password') as HTMLButtonElement;

  // Wire password visibility toggle
  togglePassBtn.addEventListener('click', () => {
    togglePasswordVisibility(passInput, togglePassBtn);
  });

  // Sync aria-invalid and error elements dynamically on interaction
  [userInput, passInput].forEach((input) => {
    input.addEventListener('blur', () => {
      const isValid = syncInputAriaState(input);
      input.classList.toggle('user-invalid-fallback', !isValid);
    });
    input.addEventListener('input', () => {
      // Clear general login error on typing
      loginError('');
      if (input.classList.contains('user-invalid-fallback') || input.hasAttribute('aria-invalid')) {
        const isValid = syncInputAriaState(input);
        input.classList.toggle('user-invalid-fallback', !isValid);
        
        // Update error display element
        const errorEl = $('#' + input.id + '-error');
        if (errorEl) {
          errorEl.style.display = isValid ? 'none' : 'block';
        }
      }
    });
  });

  // Prevent default submission and perform validation
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm(loginForm)) {
      void doAuth('login');
    }
  });

  // Custom keydown helper for compatibility with edge cases / legacy scripts
  passInput.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      loginForm.requestSubmit();
    }
  });

  // Legacy clicks of Login/Register buttons
  $('#btn-login').addEventListener('click', (e) => {
    // Let the form submit handle it if it was clicked, but prevent default click just in case
  });

  $('#btn-register').addEventListener('click', (e) => {
    e.preventDefault();
    if (validateForm(loginForm)) {
      void doAuth('register');
    }
  });

  $('#btn-login-back').addEventListener('click', (e) => {
    e.preventDefault();
    // Clear validation state on back
    [userInput, passInput].forEach((input) => {
      input.classList.remove('user-invalid-fallback');
      input.removeAttribute('aria-invalid');
      const errEl = $('#' + input.id + '-error');
      if (errEl) errEl.style.display = 'none';
    });
    loginError('');
    show('#mode-select');
  });

  // character creation
  document.querySelectorAll('#charselect-panel .mini-class').forEach((el) => {
    const handleMiniClassSelect = () => {
      document.querySelectorAll('#charselect-panel .mini-class').forEach((x) => {
        x.classList.remove('sel');
        x.setAttribute('aria-pressed', 'false');
      });
      el.classList.add('sel');
      el.setAttribute('aria-pressed', 'true');
    };
    el.addEventListener('click', handleMiniClassSelect);
    el.addEventListener('keydown', (e) => handleKeyboardActivation(e as KeyboardEvent, handleMiniClassSelect));
  });
  const newCharNameInput = $('#new-char-name') as HTMLInputElement;
  const charselectError = $('#charselect-error');

  // Wire Enter key inside new-char-name to trigger character creation
  newCharNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#btn-create-char').click();
    }
  });

  // Wire dynamic validation clearing on typing
  [offlineNameInput, newCharNameInput].forEach((input) => {
    const errorEl = input.id === 'char-name' ? offlineError : charselectError;
    input.addEventListener('input', () => {
      errorEl.textContent = '';
      if (input.classList.contains('user-invalid-fallback') || input.hasAttribute('aria-invalid')) {
        const val = input.value.trim();
        if (!val || validateCharacterName(val)) {
          input.classList.remove('user-invalid-fallback');
          input.removeAttribute('aria-invalid');
        }
      }
    });
  });

  $('#btn-create-char').addEventListener('click', async () => {
    const name = newCharNameInput.value.trim();
    const clsEl = document.querySelector('#charselect-panel .mini-class.sel') as HTMLElement | null;
    loginError('');
    charselectError.textContent = '';
    
    if (!name) {
      charselectError.textContent = 'Please enter a character name.';
      newCharNameInput.classList.add('user-invalid-fallback');
      newCharNameInput.setAttribute('aria-invalid', 'true');
      newCharNameInput.focus();
      return;
    }
    if (!validateCharacterName(name)) {
      charselectError.textContent = 'Name must be 2-16 characters, start with a letter, and contain only letters, spaces, hyphens, or apostrophes.';
      newCharNameInput.classList.add('user-invalid-fallback');
      newCharNameInput.setAttribute('aria-invalid', 'true');
      newCharNameInput.focus();
      return;
    }
    if (!clsEl) { charselectError.textContent = 'Pick a class.'; return; }

    newCharNameInput.classList.remove('user-invalid-fallback');
    newCharNameInput.removeAttribute('aria-invalid');

    try {
      await api.createCharacter(name, clsEl.dataset.class as PlayerClass);
      newCharNameInput.value = '';
      charselectError.textContent = '';
      await refreshCharacters();
    } catch (err: any) {
      charselectError.textContent = err.message;
    }
  });
  $('#btn-charselect-back').addEventListener('click', () => show('#login-panel'));

  // Collapsible Controls Drawer toggle
  const controlsDrawer = $('#controls-drawer');
  const toggleControlsBtn = $('#btn-toggle-controls');
  const closeControlsBtn = $('#btn-close-controls');

  const toggleControls = (show: boolean) => {
    controlsDrawer.toggleAttribute('hidden', !show);
    toggleControlsBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) {
      closeControlsBtn.focus();
    } else {
      toggleControlsBtn.focus();
    }
  };

  toggleControlsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const isVisible = !controlsDrawer.hasAttribute('hidden');
    toggleControls(!isVisible);
  });

  closeControlsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleControls(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !controlsDrawer.hasAttribute('hidden')) {
      toggleControls(false);
    }
  });

  // Dynamically initialize background embers
  const initBackgroundEmbers = () => {
    const backdrop = $('#start-screen-backdrop');
    if (!backdrop) return;
    
    const container = document.createElement('div');
    container.className = 'embers-container';
    backdrop.appendChild(container);
    
    for (let i = 0; i < 24; i++) {
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
  };

  initBackgroundEmbers();
}

wireStartScreens();
