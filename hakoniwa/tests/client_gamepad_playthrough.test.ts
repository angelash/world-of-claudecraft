// PK-M1-07 acceptance (development_plan.md 4.2; ux_and_onboarding.md 23.2 "input replay"):
// a simulated gamepad, and then a keyboard alone, play from the start of the prologue to the
// first fight of act 1 on the no-model build, through the real input path: synthetic Gamepad
// API snapshots or key chords go into the action layer (InputHub), which drives the client's
// PlayerInput, which queues commands into a real engine with every system; the event router
// feeds loose lines into the conversation box as in the session. No command is queued by the
// test itself (the keyboard run's name goes in through the scene panel's own submit, the
// path its text field takes). The pad advances lines with A, moves the option cursor with
// the d-pad and picks with A (the choices the autoplayer's release route makes), types the
// name on the floating keyboard in scene P6, walks with the left stick, opens and leaves a
// window, lets soft targeting pick the monster in front and attacks it with A and the cross
// hotbar (LT plus a cluster button). The keyboard does the same with Space, number keys,
// WASD, I and Esc, Tab, E and 1.

import { describe, expect, it } from 'vitest';
import { installKeyText, keyRefText } from '../src/client/input/glyphs';
import { oskKeyAt, oskRows } from '../src/client/input/osk';
import { scenePolicy } from '../src/game/autoplay/scene_policy';
import { t } from '../src/shared_ui/i18n';
import { sceneView } from '../src/systems/scenes';
import { type InputHarness, inputHarness, nearestMonster } from './input_harness';
import { CHEATS } from './playthrough/harness';

/** Play the prologue with `step`, which answers one scene node; returns the counts. */
function playPrologue(
  h: InputHarness,
  step: (sv: NonNullable<ReturnType<typeof sceneView>>, want: number) => void,
  idle: () => void,
): { nodes: number } {
  const { engine } = h;
  const policy = scenePolicy('release', engine.world, engine.content);
  let nodes = 0;
  for (let guard = 0; guard < 4000; guard++) {
    const sv = sceneView(engine.world, engine.content);
    if (!sv) {
      // before the first scene starts, and between scenes, the world runs on
      if (engine.world.meta.flags.act === 'act1') break;
      idle();
      continue;
    }
    const ids = sv.choices.map((c) => c.id);
    const want = ids.length ? ids.indexOf(policy(sv.sceneId, sv.nodeId, ids)) : -1;
    step(sv, want);
    nodes++;
  }
  return { nodes };
}

/** Player damage events from now on. */
function watchDamage(h: InputHarness): { hits: { targetId: string }[] } {
  const playerId = h.engine.world.slices.world.playerId;
  const out = { hits: [] as { targetId: string }[] };
  h.engine.onEvents((events) => {
    for (const ev of events) {
      if (ev.kind === 'combat.damage' && ev.data.sourceId === playerId)
        out.hits.push({ targetId: ev.data.targetId });
    }
  });
  return out;
}

describe('a simulated gamepad plays from the prologue to the first battle', () => {
  it('advances, chooses, types a name, walks, soft-targets and fights with the pad alone', () => {
    const h = inputHarness();
    const { engine, pad, frame, tap, hub } = h;
    const name: string[] = [];
    let choices = 0;
    playPrologue(
      h,
      (sv, want) => {
        if (sv.waiting === 'advance') tap('a');
        else if (sv.waiting === 'choice' || sv.waiting === 'court') {
          const cursor = h.player.optionCursor();
          expect(cursor?.kind).toBe('scene');
          // walk the option cursor with the d-pad, then pick with A
          const n = sv.choices.length;
          const steps = (want - (cursor?.index ?? 0) + n) % n;
          for (let i = 0; i < steps; i++) tap('down');
          expect(h.player.optionCursor()?.index).toBe(want);
          tap('a');
          choices++;
        } else if (sv.waiting === 'input') {
          // scene P6: A opens the floating keyboard on the Han page; type two characters
          tap('a');
          const han = t('ui.pop.osk.han_page');
          const osk = () => {
            if (!hub.osk) throw new Error('keyboard closed');
            return hub.osk;
          };
          const first = oskKeyAt(osk(), han);
          tap('a');
          tap('right');
          const second = oskKeyAt(osk(), han);
          tap('a');
          if (first?.kind === 'char') name.push(first.ch);
          if (second?.kind === 'char') name.push(second.ch);
          expect(osk().text).toBe(name.join(''));
          expect(oskRows(osk().page, han, false).length).toBeGreaterThan(1);
          tap('start');
          expect(hub.osk).toBeNull();
        } else frame();
      },
      frame,
    );
    expect(sceneView(engine.world, engine.content)).toBeNull();
    expect(engine.world.meta.flags.act).toBe('act1');
    expect(engine.world.meta.flags['player.name']).toBe(name.join(''));
    expect(name.length).toBe(2);
    expect(h.sent['scenes.advance'] ?? 0).toBeGreaterThan(10);
    expect(choices).toBeGreaterThan(10);

    // a window on the pad: View opens the map, the window owns the stick, B closes it
    tap('view');
    expect(h.open).toEqual(['map']);
    pad.axes[1] = -1;
    frame();
    pad.axes[1] = 0;
    frame();
    expect(h.ui.log).toContain('focus:up');
    tap('b');
    expect(h.open).toEqual([]);

    // act 1: walk with the left stick toward the nearest monster until soft targeting picks
    // it, then attack with A and with hotbar slot 1 (LT plus d-pad left)
    const damage = watchDamage(h);
    let softSeen: string | null = null;
    let attacked = false;
    const cast = () => h.sent['combat.cast'] ?? 0;
    for (let guard = 0; guard < 3000 && !(damage.hits.length && cast() > 0); guard++) {
      // a loose line in the box: A advances it (the dialogue sits over the field)
      if (h.loose.current) {
        tap('a');
        continue;
      }
      const m = nearestMonster(h);
      if (!m) {
        frame();
        continue;
      }
      const soft = h.player.softTarget;
      if (soft && !softSeen) softSeen = soft;
      if ((soft || h.host.selection) && m.d < 1.6) {
        pad.axes[0] = 0;
        pad.axes[1] = 0;
        if (!attacked) {
          // A attacks the soft target (and locks it)
          tap('a');
          attacked = true;
        } else {
          // the cross hotbar: hold LT, press d-pad left = slot 1
          pad.set('lt', true);
          frame();
          tap('left');
          pad.set('lt', false);
          frame();
        }
        frame();
        continue;
      }
      // push the stick toward the monster (screen axes equal map axes at yaw 0)
      pad.axes[0] = m.dx;
      pad.axes[1] = m.dy;
      frame();
    }
    const hit = damage.hits[0];
    expect(hit, 'the player hit a monster').toBeDefined();
    expect(engine.world.slices.world.entities[hit?.targetId ?? '']?.kind).toBe('monster');
    expect(softSeen).toBe(hit?.targetId);
    // A attacked through the soft target, the cross hotbar cast slot 1 on it
    expect(h.sent['combat.attack'] ?? 0).toBeGreaterThan(0);
    expect(cast()).toBeGreaterThan(0);
    expect(h.host.selection).toBe(hit?.targetId);
    // the pad stayed the device and every command came from the input layer
    expect(hub.device).toBe('pad');
    expect(h.sent['world.set_intent'] ?? 0).toBeGreaterThan(0);
    expect(h.sent['scenes.choose'] ?? 0).toBe(choices);
    expect(h.sent['scenes.input'] ?? 0).toBe(1);
    for (const kind of CHEATS) expect(h.sent[kind] ?? 0, kind).toBe(0);
  });

  it('plays the same stretch with the keyboard alone', () => {
    const h = inputHarness();
    const { engine, press, keyFrame, hub } = h;
    let choices = 0;
    playPrologue(
      h,
      (sv, want) => {
        if (sv.waiting === 'advance') press({ code: 'Space' });
        else if (sv.waiting === 'choice' || sv.waiting === 'court') {
          press({ code: `Digit${want + 1}` });
          choices++;
        } else if (sv.waiting === 'input') {
          // the scene panel's text field takes the typing and submits it on Enter
          h.host.queue(h.adapters.scene?.input(h.view, 'Ann'));
          keyFrame();
        } else keyFrame();
      },
      keyFrame,
    );
    expect(engine.world.meta.flags.act).toBe('act1');
    expect(engine.world.meta.flags['player.name']).toBe('Ann');
    expect(h.sent['scenes.choose'] ?? 0).toBe(choices);

    // a window from the keyboard: I opens the bag over the field, W still walks, Esc closes
    press({ code: 'KeyI' });
    expect(h.open).toEqual(['inventory']);
    hub.key({ code: 'ArrowDown' }, 'down');
    hub.key({ code: 'ArrowDown' }, 'up');
    expect(h.ui.log).toContain('focus:down');
    press({ code: 'Escape' });
    expect(h.open).toEqual([]);

    // act 1: WASD toward the nearest monster, Tab to target it, E to attack, 1 to cast
    const damage = watchDamage(h);
    const held = new Set<string>();
    const hold = (codes: string[]) => {
      for (const c of held) if (!codes.includes(c)) hub.key({ code: c }, 'up');
      for (const c of codes) if (!held.has(c)) hub.key({ code: c }, 'down');
      held.clear();
      for (const c of codes) held.add(c);
    };
    let attacked = false;
    const cast = () => h.sent['combat.cast'] ?? 0;
    for (let guard = 0; guard < 3000 && !(damage.hits.length && cast() > 0); guard++) {
      if (h.loose.current) {
        hold([]);
        press({ code: 'Space' });
        continue;
      }
      const m = nearestMonster(h);
      if (!m) {
        keyFrame();
        continue;
      }
      if (m.d < 1.6) {
        hold([]);
        if (!h.host.selection) press({ code: 'Tab' });
        else if (!attacked) {
          press({ code: 'KeyE' });
          attacked = true;
        } else press({ code: 'Digit1' });
        continue;
      }
      const keys: string[] = [];
      if (m.dx > 0.38) keys.push('KeyD');
      if (m.dx < -0.38) keys.push('KeyA');
      if (m.dy > 0.38) keys.push('KeyS');
      if (m.dy < -0.38) keys.push('KeyW');
      hold(keys);
      keyFrame();
    }
    hold([]);
    expect(damage.hits.length, 'the player hit a monster').toBeGreaterThan(0);
    expect(cast()).toBeGreaterThan(0);
    expect(h.sent['combat.attack'] ?? 0).toBeGreaterThan(0);
    expect(hub.device).toBe('kbm');
    for (const kind of CHEATS) expect(h.sent[kind] ?? 0, kind).toBe(0);
  });

  it('names the pad buttons in prompts once the pad is the device', () => {
    const h = inputHarness();
    installKeyText(() => ({
      device: h.hub.device,
      family: h.hub.family,
      kbm: h.hub.keymaps.kbm,
      pad: h.hub.keymaps.pad,
      stack: h.hub.stack(),
    }));
    try {
      expect(t('ui.mode.cutscene.advance_hint')).toBe('空格 继续');
      h.tap('a');
      expect(h.hub.device).toBe('pad');
      expect(t('ui.mode.cutscene.advance_hint')).toBe('A 继续');
      expect(
        keyRefText('dialogue.choose', {
          device: 'pad',
          family: 'xbox',
          kbm: h.hub.keymaps.kbm,
          pad: h.hub.keymaps.pad,
          stack: ['dialogue', 'global'],
        }),
      ).toBe('十字键↑/十字键↓');
    } finally {
      installKeyText(null);
    }
  });
});
