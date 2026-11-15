// src/client/audio/: the client audio subsystem (audio_direction.md 10.1; release_engineering.md
// 9). Audio only reads the world through the client's world interface and events; it never calls
// kernel commands or changes an outcome, and it runs silently when no audio device exists.
//
// This first version holds the pure cores: the cue map over data/audio/cues.json (kernel events
// and animation key frames to sound ids), the director state machine (what should play and how
// to switch), and the bus model (volumes, ducking, voice caps). The Web Audio graph, the music
// player, the ambience mixer, the voice pool and the spatializer arrive with PK-M1-06.

export {
  AudioDirector,
  COMBAT_EXIT_MS,
  COMBAT_TRACKS,
  type CombatTier,
  combatTierOf,
  DEFAULT_VIEW_MUSIC,
  type DirectorInput,
  type DirectorOutput,
  type Hostile,
  type LocationAudio,
  locationLayers,
  type MapView,
  type MusicContext,
  type MusicPlan,
  TENSION_PERIOD_MS,
  type Transition,
  tensionOf,
} from './audio_director';
export {
  BUSES,
  type BusId,
  type BusState,
  DEFAULT_VOLUMES,
  DUCKS,
  type Duck,
  type DuckTrigger,
  defaultMixSettings,
  effectiveDb,
  type MixSettings,
  mixBuses,
  sliderToDb,
  VOICE_CAPS,
} from './bus_model';
export {
  type Cue,
  type CueHit,
  type CueTable,
  type CueValue,
  resolveCues,
  soundFor,
  soundsOf,
  type Trigger,
  validateCueTable,
} from './cue_map';
