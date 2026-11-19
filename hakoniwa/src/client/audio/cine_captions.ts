// Sound captions of the written cutscene sounds (catalog_cutscenes.md 13.8; ux_and_onboarding.md
// 18.4): every `@音` of a prologue or act 1 scene names an `sfx_` id; the cutscene player hands it
// to the audio with the caption key `audio.cap.<id>` and its level from this table. A sound with
// no row has no caption (a door creak under a line of narration says nothing the text does not).
// The caption texts are `ui.ovl.caption.<id>` in the interface table (audio_direction.md 1.2);
// they name the sound, never what it means (the reveal ledger: the door woman's voice is a
// whisper through a door, not a name). "important" lines are the ones a player acts on or
// would otherwise miss (an alarm, a door, a roar); the rest show only under "all". Pure.

export type CineCaptionLevel = 'important' | 'all';

/** The written cutscene sounds that carry a caption, and the level each shows at. */
export const CINE_CAPTIONS: Readonly<Record<string, CineCaptionLevel>> = {
  // prologue
  sfx_cin_bell_call: 'important',
  sfx_cin_call_bell: 'all',
  sfx_cin_board_slot: 'all',
  sfx_cin_book_close: 'all',
  sfx_cin_cat_mew: 'all',
  sfx_cin_chairs_seat: 'all',
  sfx_cin_coin: 'all',
  sfx_cin_cough_player: 'all',
  sfx_cin_curtain: 'all',
  sfx_cin_door_push: 'all',
  sfx_cin_earth_door: 'important',
  sfx_cin_fall_wind: 'all',
  sfx_cin_floor_dissolve: 'all',
  sfx_cin_footsteps_away: 'all',
  sfx_cin_hall_flicker: 'all',
  sfx_cin_halo_stop: 'all',
  sfx_cin_hand_catch: 'all',
  sfx_cin_hollow: 'all',
  sfx_cin_ink_drop: 'all',
  sfx_cin_number_tag: 'all',
  sfx_cin_phone_buzz: 'all',
  sfx_cin_spirit_mirror: 'all',
  sfx_cin_store_chime: 'all',
  sfx_cin_strike_out: 'all',
  sfx_cin_sword_table: 'all',
  sfx_cin_table_knock: 'all',
  sfx_cin_table_slam: 'important',
  sfx_cin_train_brake: 'all',
  sfx_cin_truck_horn: 'all',
  sfx_cin_voicemail: 'all',
  sfx_cin_wall_murmur: 'all',
  sfx_cin_wardrobe_creak: 'all',
  sfx_cin_white_in: 'all',
  sfx_god_door_woman_keys: 'all',
  sfx_god_door_woman_whisper: 'important',
  sfx_god_eluen_gaze: 'all',
  sfx_god_eluen_halo: 'all',
  sfx_god_merca_coin_flip: 'all',
  sfx_god_merca_ledger: 'all',
  sfx_god_moira_page: 'all',
  sfx_god_moira_quill: 'all',
  // act 1
  sfx_cin_a1_alarm_bell: 'important',
  sfx_cin_a1_ash_gaze: 'important',
  sfx_cin_a1_ash_pages: 'all',
  sfx_cin_a1_ash_storm: 'important',
  sfx_cin_a1_badge_set: 'all',
  sfx_cin_a1_brawl: 'important',
  sfx_cin_a1_colossus_fall: 'important',
  sfx_cin_a1_colossus_step: 'important',
  sfx_cin_a1_core_grasp: 'all',
  sfx_cin_a1_core_smash: 'important',
  sfx_cin_a1_crystal_dead: 'important',
  sfx_cin_a1_cup_break: 'all',
  sfx_cin_a1_cup_catch: 'all',
  sfx_cin_a1_dian_surge: 'important',
  sfx_cin_a1_dream_touch: 'all',
  sfx_cin_a1_edgestone_glint: 'all',
  sfx_cin_a1_far_wings: 'important',
  sfx_cin_a1_glove: 'all',
  sfx_cin_a1_grey_flame: 'all',
  sfx_cin_a1_letter_unfold: 'all',
  sfx_cin_a1_mob: 'important',
  sfx_cin_a1_post_horse: 'all',
  sfx_cin_a1_quill_night: 'all',
  sfx_cin_a1_raven_screech: 'important',
  sfx_cin_a1_trial_bell: 'important',
  sfx_cin_crowd_gasp: 'all',
  sfx_cin_flashback: 'all',
  sfx_cin_martha_cut: 'important',
  sfx_door_dream_door: 'all',
  sfx_door_nm_talent_sight: 'all',
  sfx_door_open_major: 'important',
  sfx_door_pact_purify: 'all',
  sfx_door_trace_glow: 'all',
  sfx_env_door_wood_open: 'all',
};

/** The caption of a written cutscene sound, or null when it has none. */
export function cineCaption(
  soundId: string,
): { caption: string; captionLevel: CineCaptionLevel } | null {
  const level = CINE_CAPTIONS[soundId];
  return level ? { caption: `audio.cap.${soundId}`, captionLevel: level } : null;
}
