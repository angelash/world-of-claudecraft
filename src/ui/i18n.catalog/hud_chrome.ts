// i18n source catalog - in-game HUD chrome strings that were previously hard-coded
// at their call sites (emote wheel/editor, swing timer, rest indicator, mobile
// controls, minimap/compass/clock widgets, DPS/HPS meters formatting). English
// values only; the 13 locale translations live in src/ui/i18n.locales/<lang>.ts
// (the runtime-authoritative overlays), filled by the maintainer at release.
//
// Assembled into `en` by ./index.ts under the `hudChrome` namespace. Kept as its
// own module (no per-locale blocks) so new chrome keys are an English-only add.

export const hudChromeStrings = {
  // Overhead emote display names (wheel tooltips/labels, editor items, overhead
  // bubble text). Source ids/order mirror OVERHEAD_EMOTES in world_api.ts.
  emotes: {
    wave: "Wave",
    laugh: "LOL",
    question: "Bro?",
    cheer: "Cheer",
    dance: "Dance",
    point: "Point",
    flex: "Flex",
    salute: "Salute",
    cry: "Cry",
    bow: "Bow",
    clap: "Clap",
    roar: "Roar",
    kneel: "Kneel",
  },
  emoteWheel: {
    edit: "Edit",
    label: "Emotes",
  },
  emoteEditor: {
    title: "Emotes",
    done: "Done",
  },
  // On-screen quest tracker. The "(N)" count shown beside the header while the
  // tracker is collapsed (the number is spliced in via formatNumber), plus the
  // header button's state-aware hover/title hint (Collapse while expanded,
  // Expand while collapsed).
  questTracker: {
    count: "({count})",
    collapseHint: "Collapse quest tracker",
    expandHint: "Expand quest tracker",
  },
  chatTimestamps: {
    show: "Show Chat Timestamps",
    format: "Timestamp Format",
    clock12h: "12-hour",
    clock24h: "24-hour",
    note: "Prefixes each new chat line with the time it arrived, e.g. [14:32]. Only affects messages received while the option is on.",
  },
  chatWindow: {
    move: "Drag to move the chat window",
    resize: "Drag to resize the chat window",
    reset: "Reset Chat Window",
    resetAction: "Reset",
    note: "Drag the chat tab strip to move the window, or the corner grip to resize it. Reset returns it to the default position and size.",
  },
  swing: {
    ready: "Swing",
    seconds: "{seconds}s",
  },
  rest: {
    resting: "Resting",
  },
  // On-screen / mobile control labels and their accessible names. char/bags/music
  // reuse existing keys (hud.keybinds.actions.*, hud.options.music) at the call site.
  mobile: {
    autorun: "Autorun",
    jump: "Jump",
    leaderboard: "Ranks",
    nameplates: "Names",
    haptics: "Haptics",
    hapticsOff: "Haptics Off",
    toggleHaptics: "Toggle haptics",
  },
  // Minimap / compass / clock / coordinate widget tooltips and accessible names.
  widgets: {
    clockTitle: "Local time - click to toggle 12/24-hour",
    worldCoordinates: "World coordinates",
    coordinates: "Coordinates",
    heading: "Heading",
    minimapZoom: "Minimap zoom",
  },
  // Eight-point compass abbreviations as drawn on the heading strip. Each locale
  // overrides with its own established compass abbreviations (e.g. West = "O" in
  // Spanish, "O" in French/Italian/Portuguese, "З" in Russian).
  compass: {
    N: "N",
    NE: "NE",
    E: "E",
    SE: "SE",
    S: "S",
    SW: "SW",
    W: "W",
    NW: "NW",
  },
  // DPS/HPS/threat meter number + unit formatting (the digits themselves go
  // through formatNumber; these carry the localizable unit/parenthesization).
  meters: {
    perSecond: "{value}/s",
    perSecondRow: "{total} ({rate})",
    minutesSeconds: "{m}m {s}s",
    seconds: "{s}s",
  },
  // Key Bindings panel action labels that the in-file BIND_ACTION_LABEL_KEYS map
  // (hud.ts) routes through t(). Kept here (not the constrained `hud` catalog
  // domain) so they are an English-only add.
  keybinds: {
    emoteWheel: "Emote Wheel",
    targetFriendly: "Target Nearest Friendly",
    targetFriendlyNext: "Cycle Friendly Target",
    inspect: "Inspect Nearby",
  },
  // Click-to-move mouse-button toggle labels (Key Bindings panel). The button id
  // 0/2 maps to these at the HUD render boundary.
  options: {
    clickMoveLeft: "Left Click",
    clickMoveRight: "Right Click",
    // Adaptive browser-effects tier control (Graphics panel). Auto detects the
    // browser engine/version + device; the rest pin the CSS-effects tier.
    browserEffects: "Browser Effects",
    browserEffectsAuto: "Auto",
    browserEffectsFull: "Full",
    browserEffectsReduced: "Reduced",
    browserEffectsMinimal: "Minimal",
    browserEffectsNote: "Auto tones down heavy CSS effects (blur, glow, background motion) based on your browser and device. Lower it manually if the interface feels sluggish.",
    // Interface Mode control (Graphics panel): desktop keyboard/mouse vs the
    // on-screen touch controls. Auto detects the device; the rest force one.
    interfaceMode: "Interface Mode",
    interfaceModeAuto: "Auto",
    interfaceModeDesktop: "Desktop",
    interfaceModeTouch: "Touch",
    interfaceModeNote: "Auto picks desktop or touch controls from your device. Choose Desktop to force keyboard and mouse (useful on a tablet with a keyboard), or Touch for the on-screen controls.",
    // Audio panel toggle for the per-footfall step clips (off by default).
    footstepSounds: "Footstep Sounds",
    // Toggle for the OSRS-style click-feedback marker: entity targets and
    // click-to-move destinations (on by default).
    clickFeedback: "Click Marker",
    showWalletOnCharacterScreen: "Show Wallet on Character Screen",
    showWalletOnPlayerCard: "Show Wallet on Player Card",
    // Interface panel: global HUD zoom slider, and the mirror of the landing
    // page's high-contrast backdrop toggle.
    uiScale: "UI Scale",
    highContrastBackground: "High-Contrast Background",
  },
  // Controller / gamepad options panel (Options > Controller). Player-facing
  // chrome, so every label is a key here; the live numbers run through
  // formatNumber. The button names themselves (A / LB / D-pad, etc.) stay as
  // hardware glyphs in gamepad_map and need no translation.
  controller: {
    title: "Controller",
    enable: "Enable Controller",
    invertY: "Invert Camera (Y)",
    deadzone: "Stick Deadzone",
    cameraSpeed: "Camera Speed",
    vibration: "Vibration",
    buttons: "Button Layout",
    resetButtons: "Reset Button Layout",
    menuAction: "Game Menu",
    help: "Left stick moves, right stick looks. Open a window to use the on-screen pointer.",
  },
  // Performance overlay (the customizable in-game stats panel + its Options
  // sub-view). Player-facing, so every label is a key here; the live numbers in
  // the overlay run through formatNumber and these unit strings. Distinct from
  // the dev `?perf` diagnostic, which stays English like console.*.
  perf: {
    title: "Performance Overlay",
    enable: "Show Performance Overlay",
    description: "Choose which stats to show, where the overlay sits, and how it looks.",
    sectionPosition: "Position",
    sectionAppearance: "Appearance",
    sectionStats: "Stats",
    positionX: "Horizontal",
    positionY: "Vertical",
    resetPosition: "Reset Position",
    dragHint: "Drag the overlay to move it, or use the sliders below.",
    opacity: "Background Opacity",
    solidBg: "Solid Background",
    fontScale: "Text Size",
    textColor: "Text Color",
    bgColor: "Background Color",
    colorTheme: "Color Theme",
    graph: "Frame-Time Graph",
    thresholds: "Color-Coded Warnings",
    presetsLabel: "Quick Presets",
    presetMinimal: "Minimal",
    presetStandard: "Standard",
    presetEverything: "Everything",
    // Category subheads the Stats toggles are grouped under (mirrors the metric
    // registry's groups: frame/timing, network, renderer, system).
    groups: {
      frame: "Frame & Timing",
      network: "Network",
      renderer: "Renderer",
      system: "System",
      input: "Input",
    },
    // Short metric labels shown in the overlay's left column and the Stats toggles.
    labels: {
      fps: "FPS",
      frameTime: "Frame Time",
      fps1Low: "1% Low",
      fps01Low: "0.1% Low",
      ping: "Ping",
      jitter: "Jitter",
      snapshot: "Snapshot Rate",
      connection: "Connection",
      drawCalls: "Draw Calls",
      triangles: "Triangles",
      geometries: "Geometries",
      textures: "Textures",
      programs: "Shaders",
      renderScale: "Render Scale",
      gpu: "GPU",
      memory: "Memory",
      hitches: "Hitches",
      entities: "Entities",
      apm: "APM",
    },
    // Color-theme preset names (also the swatches' accessible names).
    themes: {
      gold: "Gold",
      frost: "Frost",
      ember: "Ember",
      jade: "Jade",
      crimson: "Crimson",
      mono: "Mono",
    },
    // Value units — the digits are spliced in via formatNumber at the call site.
    units: {
      ms: "{value} ms",
      mb: "{value} MB",
      memPair: "{used} / {limit} MB",
      hz: "{value} Hz",
    },
    // Inline status badges shown when the relevant condition is active.
    badges: {
      backgrounded: "Backgrounded",
      offline: "Offline",
    },
  },
  playerCard: {
    showWalletBadge: "Show wallet badge",
  },
  // Landing-page (start screen) accessibility controls.
  landing: {
    // Footer toggle: swap the moving trailer for a static high-contrast backdrop.
    highContrast: "High Contrast",
    highContrastAria: "Toggle high-contrast background: disables the moving trailer so start-screen text stays legible",
  },
  // Character-screen stat tooltips (hover a stat on the C panel). The stat NAMES
  // reuse itemUi.stats.*; only these descriptions / effect lines / notes are new.
  // The breakdown numbers are recomputed live from the player's current stats
  // (src/ui/stat_tooltip.ts) and spliced in via formatNumber at the call site, so
  // the {value}/{level} placeholders carry no baked formatting.
  statInfo: {
    // Header above a primary stat's live breakdown, e.g. "From your 22 Agility:".
    fromYour: "From your {value} {stat}:",
    desc: {
      str: "Increases your attack power, so your weapon strikes land harder.",
      agi: "Sharpens your reflexes and aim, improving several of your combat stats.",
      sta: "Toughens your body, raising your maximum health and how quickly you recover health while resting.",
      int: "Expands a spellcaster's mana pool and improves their chance to land a spell critical strike.",
      spi: "Quickens how fast a spellcaster's mana returns while resting, out of combat.",
      armor: "Softens incoming physical blows. The reduction is greater against lower-level attackers and is capped at 75%.",
      attackPower: "Powers your weapon attacks. Every 14 attack power adds 1 damage per second.",
      dps: "Your estimated weapon damage per second, combining your weapon's damage and speed with your attack power.",
      critChance: "Your chance for an attack to strike critically, dealing double damage.",
      dodge: "Your chance to completely avoid an incoming melee attack, taking no damage.",
    },
    // One line per derived effect a stat contributes. {value} is a live number.
    effects: {
      attackPower: "+{value} Attack Power",
      rangedAttackPower: "+{value} Ranged Attack Power",
      critPct: "+{value}% Critical Strike",
      dodgePct: "+{value}% Dodge",
      armor: "+{value} Armor",
      maxHealth: "+{value} Maximum Health",
      maxMana: "+{value} Maximum Mana",
      spellCritPct: "+{value}% Spell Critical Strike",
      healthRegen: "About {value} health every 5 sec while resting",
      manaRegen: "About {value} mana every 5 sec while resting",
      damageReduction: "Damage reduction against a level {level} attacker: {value}%",
      dpsFromAp: "Adds {value} damage per second to your attacks",
    },
    notes: {
      minorForClass: "Of little benefit to your class.",
      baseChance: "Includes a 5% base chance shared by all adventurers.",
      dpsApprox: "An estimate, it excludes critical strikes and ability damage.",
    },
  },
  // Default name pre-filled into the Save-Build-As dialog, e.g. "Build 3".
  talents: {
    defaultBuildName: "Build {n}",
  },
  // One-off chat-log tips shown at HUD bootstrap. The /join command tokens stay
  // literal (they are commands); the surrounding prose localizes.
  tips: {
    joinChannels: "Tip: type /join world or /join lfg to chat with players across the realm.",
  },
  aiQuestion: {
    heading: "Ask",
    recent: "What have you heard lately?",
    rumor: "Any rumors about this place?",
    place: "What do you notice here?",
    questHint: "Any advice for my current work?",
  },
  aiReaction: {
    approach: "interested",
    avoid: "uneasy",
    inspect: "watching",
    thinking: "thinking",
  },
  aiError: {
    responseFailed: "AI response failed: {reason}",
    responseRejected: "AI response rejected: {reason}",
  },
  aiSpeech: {
    brotherAldricAwake: "The dead are restless tonight. Keep your journal close, {playerName}.",
    merchantMarketPulse: "Coin moves faster than rumor, {playerName}, but rumor leaves better footprints.",
    genericNpcAwake: "{speakerName} studies the road, then turns back to you with fresh attention.",
    marshalRedbrookAwake: "{speakerName} scans the square like a map of things that could go wrong, then fixes on you, {playerName}.",
    traderWilkesAwake: "{speakerName} notices your pack before your face, then smiles like both are a ledger.",
    apothecaryLinAwake: "{speakerName} is sorting leaves by scent and danger when your shadow crosses the table.",
    fishermanBrandtAwake: "{speakerName} listens past you toward the water, as if the lake interrupted first.",
    foremanOdellAwake: "{speakerName} spits dust from his words and watches the road to the mine.",
    rangerElwynAwake: "{speakerName} raises two fingers for silence, tracking something beyond the treeline.",
    wardenFenwickAwake: "{speakerName} checks the bridge, the reeds, then you, in that order.",
    provisionerHaleAwake: "{speakerName} weighs your boots, your pack, and the weather before deciding what you need.",
    herbalistYaraAwake: "{speakerName} keeps one hand near a wrapped poultice and one eye on the thicket.",
    captainThessalyAwake: "{speakerName} looks down from the wall as if measuring how much longer it can hold.",
    quartermasterBreeAwake: "{speakerName} counts shortages under her breath, then includes you in the arithmetic.",
    armorerHodeAwake: "{speakerName} tests an edge with his thumb and gives you a look that does much the same.",
    itemInterestApproach: "{speakerName} notices {itemName} and edges closer.",
    itemInterestAvoid: "{speakerName} pulls back from {itemName}.",
    itemInterestInspect: "{speakerName} studies {itemName} with wary interest.",
    singularityApproach: "{speakerName} reacts unlike the others, guarding {itemName} with strange focus.",
    singularityAvoid: "{speakerName} freezes, then backs away from {itemName} with almost personal fear.",
    singularityInspect: "{speakerName} watches {itemName} too carefully, as if forming a memory.",
    singularityFoodFixated: "{speakerName} edges toward {itemName} like hunger has learned a name.",
    singularityCollector: "{speakerName} watches {itemName} with a private, possessive stillness.",
    singularityOmenSensitive: "{speakerName} hesitates at {itemName}, as if hearing an omen no one else hears.",
    singularityCowardly: "{speakerName} recoils from {itemName} with an almost personal dread.",
    singularityTerritorial: "{speakerName} places itself between the ground and {itemName}, claiming the moment.",
    singularityVengeful: "{speakerName} fixes on {itemName} as if it has found an old insult.",
    singularityStargazer: "{speakerName} glances from {itemName} to the sky, distracted by something vast.",
    singularityRemembersPlayer: "{speakerName} reacts to {itemName} like it recognizes your pattern now, {playerName}.",
    singularityRemembersScene: "{speakerName} notices you in this place again, {playerName}, and watches as if the scene itself left a mark.",
    singularityAliasFoodFixated: "Hunger-Named {baseName}",
    singularityAliasCollector: "Trinket-Eyed {baseName}",
    singularityAliasOmenSensitive: "Omen-Touched {baseName}",
    singularityAliasCowardly: "Startled {baseName}",
    singularityAliasTerritorial: "Nest-Claiming {baseName}",
    singularityAliasVengeful: "Grudge-Bearing {baseName}",
    singularityAliasStargazer: "Star-Watching {baseName}",
    singularityAliasDefault: "Awakened {baseName}",
    companionUndeadFear: "{companionName} stays close; even {speakerName} notices the fear in this place.",
    companionSelfUndeadFear: "{companionName} presses close, uneasy with the dead in the air.",
    companionSelfRainTired: "{companionName} shakes off the rain and looks ready for shelter.",
    companionSelfStarrySky: "{companionName} looks up for a breath, caught by the stars.",
    companionSelfNightNervous: "{companionName} keeps glancing into the dark.",
    companionSelfDemonDefiance: "{companionName} leans into the unease, almost pleased by the ordered air.",
    companionSelfUndeadDayHollow: "{companionName} seems thinner in the living light.",
    companionSelfBeastScentUneasy: "{companionName} lowers close to the ground, unsettled by fire, blood, or the old dead in the air.",
    companionSelfMurlocWaterCall: "{companionName} perks toward the wet air, hearing water where others hear only weather.",
    companionSelfSpiderStillness: "{companionName} goes very still, reading the fog through tiny movements.",
    companionSelfElementalResonance: "The air around {companionName} answers the weather with a low, strange resonance.",
    companionSelfDragonkinWatch: "{companionName} studies the height and old stone with a patience that feels inherited.",
    companionSelfMortalSafeHaven: "{companionName} eases in the daylight of this safe place, but keeps watching the exits.",
    sceneDemonCompanionUnease: "{speakerName} keeps one eye on {companionName}; that kind of shadow changes a room.",
    sceneUndeadCompanionUnease: "{speakerName} stiffens at {companionName}, reading the silence around it.",
    sceneUndeadPressure: "{speakerName} lowers their voice, uneasy with the dead so near.",
    sceneRainWeariness: "Rain beads on {speakerName}'s shoulders; the answer comes shorter than usual.",
    sceneFogUnease: "{speakerName} keeps watching the fog between words.",
    sceneClearNightAwe: "{speakerName} steals a glance at the stars before speaking.",
    sceneDayEnergy: "{speakerName} looks sharper in the daylight.",
    sceneNightFatigue: "{speakerName}'s voice softens with late-night weariness.",
    familySceneApproach: "{speakerName} reacts to the place itself, edging closer as if the ground said something.",
    familySceneAvoid: "{speakerName} reads the air wrong and backs away from the scene.",
    familySceneInspect: "{speakerName} goes still, watching the weather, walls, and tracks more than you.",
    familySceneBeastUneasy: "{speakerName} catches the place by scent and shifts between hunger and caution.",
    familySceneUndeadDrawn: "{speakerName} drifts toward the death in the air like it heard its own name.",
    familySceneElementalResonance: "{speakerName} answers the place with a low, inhuman resonance.",
    familySceneDemonAmused: "{speakerName} leans into the fear around this place, visibly pleased.",
    memoryRecognizesPlayer: "{speakerName} recognizes you now, {playerName}. The road has started carrying your name.",
    memoryRumorEcho: "{speakerName} glances toward {itemName}. Word of what you left behind has already started moving, {playerName}.",
    memorySingularityRumorEcho: "{speakerName} lowers their voice; {playerName}'s {itemName} made something nearby seem awake.",
    memoryQuestRumorEcho: "{speakerName} has heard about {questName}, {playerName}. Completed work leaves tracks of its own.",
    memoryPriestRecognizesPlayer: "{speakerName} knows your step now, {playerName}. Even the chapel road keeps it.",
    memoryPriestRumorEcho: "{speakerName} looks from {itemName} to you, as if weighing whether it is omen or confession.",
    memoryPriestQuestRumorEcho: "{speakerName} speaks of {questName} like a candle carried from one chapel road to another.",
    memoryCommanderRecognizesPlayer: "{speakerName} has started filing you under reliable witness, {playerName}.",
    memoryCommanderRumorEcho: "{speakerName} marks {itemName} as a report, not a curiosity.",
    memoryCommanderQuestRumorEcho: "{speakerName} treats {questName} as confirmed field work and starts moving people around it.",
    memoryMerchantRecognizesPlayer: "{speakerName} remembers you, {playerName}. Names with a trail are worth more than coin.",
    memoryMerchantRumorEcho: "{speakerName} studies {itemName}. By dusk, someone will ask who left it and what it means.",
    memoryMerchantQuestRumorEcho: "{speakerName} already weighs what {questName} will do to road prices and nervous buyers.",
    memoryHerbalistRecognizesPlayer: "{speakerName} remembers the remedies you keep needing, {playerName}.",
    memoryHerbalistRumorEcho: "{speakerName} studies {itemName} by scent first, then by worry.",
    memoryHerbalistQuestRumorEcho: "{speakerName} says {questName} has changed the local sickness of things, if not cured it.",
    memorySmithRecognizesPlayer: "{speakerName} nods at you, {playerName}, like a smith recognizing a blade by its nicks.",
    memorySmithRumorEcho: "{speakerName} eyes {itemName}. Good steel and strange leavings both get talked over at the anvil.",
    memorySmithQuestRumorEcho: "{speakerName} says {questName} has the sound of work finished cleanly, for once.",
    memoryScoutRecognizesPlayer: "{speakerName} has your measure now, {playerName}: tracks, timing, and all.",
    memoryScoutRumorEcho: "{speakerName} glances at {itemName}, already placing it on a mental map of the road.",
    memoryScoutQuestRumorEcho: "{speakerName} marks {questName} as confirmed, not campfire noise.",
    memoryLoremasterRecognizesPlayer: "{speakerName} remembers your name, {playerName}, and files it beside the unanswered questions.",
    memoryLoremasterRumorEcho: "{speakerName} studies {itemName} as evidence, not gossip, though gossip will carry it first.",
    memoryLoremasterQuestRumorEcho: "{speakerName} treats {questName} as a footnote that has stepped into the main text.",
    memoryTidewatcherRecognizesPlayer: "{speakerName} knows you now, {playerName}. Your name has crossed the water more than once.",
    memoryTidewatcherRumorEcho: "{speakerName} watches {itemName} like a ripple that has not finished widening.",
    memoryTidewatcherQuestRumorEcho: "{speakerName} says {questName} has reached the waterline, and the waterline repeats everything.",
    topicRecentFirstMeet: "{speakerName} keeps the answer cautious, {playerName}. You are new to each other, but the place already has small signs worth noticing.",
    topicRecentKnown: "{speakerName} answers with the tone of someone who has started keeping track of you, {playerName}.",
    topicRumorQuiet: "{speakerName} listens for gossip, but nothing certain has reached this corner yet.",
    topicPlace: "{speakerName} looks over the nearby road, weather, and walls before answering.",
    topicQuestHint: "{speakerName} keeps the advice tied to what your journal already knows.",
    topicQuestNoHint: "{speakerName} has no honest lead for your current work yet.",
    objectInspectForge: "{itemName} catches the forge light; metal, sweat, and road dust tell a small story.",
    objectInspectGrave: "{itemName} carries the cold of buried places, and the air around it seems to listen.",
    objectInspectLake: "Moist air gathers around {itemName}, as if the water nearby has an opinion.",
    objectInspectDoor: "The threshold feels watched; whatever waits beyond still follows the old rules.",
    objectInspectSingularity: "{itemName} refuses to feel ordinary; the scene bends around it for a breath.",
    objectInspectGeneric: "You study {itemName}. The nearby scene answers in small details.",
    sceneTraceSingularity: "You notice the place where {itemName} bent everyone's attention; the air still feels newly awake.",
    sceneTraceCursed: "The ground still seems marked by {itemName}; even the ordinary details keep their distance.",
    sceneTraceFood: "The fading smell of {itemName} draws small tracks and sharper listening from the nearby dark.",
    sceneTraceValuable: "You spot the small scuffs left around {itemName}; someone or something weighed its worth here.",
    sceneTraceGeneric: "The place still remembers {itemName} in small disturbed details.",
    worldTraceNpcSingularity: "{speakerName} studies the mark left by {itemName}, then speaks as if the room has become less empty.",
    worldTraceNpcCursed: "{speakerName} keeps distance from where {itemName} marked the scene.",
    worldTraceNpcFood: "{speakerName} notices the fading sign of {itemName}; even hunger leaves witnesses.",
    worldTraceNpcValuable: "{speakerName} eyes the scuffs around {itemName}. Value always teaches the ground a new pattern.",
    worldTraceNpcGeneric: "{speakerName} reads the disturbed details around {itemName} before answering.",
    worldDirectorUncanny: "The whole area feels newly awake around {itemName}.",
    worldDirectorSceneUncanny: "The place feels newly awake, as if something here has started recognizing you.",
    worldDirectorHaunted: "The area keeps a colder mood around {itemName}.",
    worldDirectorHungry: "Small tracks and smells gather into a hungry pattern around {itemName}.",
    worldDirectorCovetous: "Fresh scuffs around {itemName} make the place feel watchful and calculating.",
    worldDirectorStirred: "The place has not settled since {itemName} disturbed it.",
    worldDirectorQuestComplete: "The area feels lighter after {questName}; not safe, exactly, but less alone.",
    bossMemoryDefeated: "The air still knows where {bossName} fell; the room seems to look at you differently.",
    bossMemoryWipe: "{bossName}'s victory still presses on this place; even your shadow seems to remember falling.",
    worldDirectorBossDefeated: "The area carries the shock of {bossName} being brought down.",
    worldDirectorBossWipe: "The area feels bent around {bossName}'s last victory.",
    bossPhaseBloodied: "{bossName} changes its rhythm, wounded enough to start watching every move.",
    bossPhaseDesperate: "{bossName} is close to breaking, and the fight suddenly feels sharper.",
    sceneInspectForge: "You take in the forge: hot iron, work noise, and a house-warm edge of town.",
    sceneInspectChapel: "You take in the ruined chapel: old stone, grave soil, and a bell that feels remembered.",
    sceneInspectLake: "You take in the lake dock: fish smell, open water, and quiet ripples under the sky.",
    sceneInspectWatchpost: "You take in the watchpost: ordered walls, sight lines, and weather moving over high ground.",
    sceneInspectCrypt: "You take in the crypt entrance: sealed air, old blood, and a path that seems to swallow sound.",
    sceneInspectGeneric: "You take in the place: weather, tracks, and small details begin to arrange themselves.",
    unknownItem: "something left behind",
    unknownObject: "the thing before you",
    unknownCompanion: "your companion",
    unknownBoss: "the encounter",
    unknownQuest: "that work",
  },
  // CLDR-categorized count strings resolved through tPlural(base, count) in
  // src/ui/i18n.ts: it selects the active locale's cardinal category (one / few /
  // many / other) via Intl.PluralRules and looks up the matching leaf, so e.g.
  // Russian renders the correct 1 / 2-4 / 5+ form instead of a binary one/other.
  // English only ever selects `one`/`other`; `few`/`many` mirror `other` here and
  // carry the real distinct forms only in the locales that need them (ru_RU). The
  // count is auto-supplied as {count}. Keep all four categories present per base.
  plurals: {
    guildMembers: {
      one: "you are {rank}, {count} member",
      few: "you are {rank}, {count} members",
      many: "you are {rank}, {count} members",
      other: "you are {rank}, {count} members",
    },
    characterCount: {
      one: "{count} character",
      few: "{count} characters",
      many: "{count} characters",
      other: "{count} characters",
    },
    secondsRemaining: {
      one: "{count} second remaining",
      few: "{count} seconds remaining",
      many: "{count} seconds remaining",
      other: "{count} seconds remaining",
    },
    playersOnline: {
      one: "Who: {count} player online on {realm}.",
      few: "Who: {count} players online on {realm}.",
      many: "Who: {count} players online on {realm}.",
      other: "Who: {count} players online on {realm}.",
    },
  },
  // "Report a Bug" options sub-view (online only). Captures realm/character/
  // position/screenshot plus a free-text description and posts to the server.
  bugReport: {
    menuButton: "Report a Bug",
    realm: "Realm",
    character: "Character",
    position: "Position",
    unknown: "Unknown",
    description: "What went wrong?",
    descriptionPlaceholder: "Describe the bug: what you did, what you expected, and what happened.",
    includeScreenshot: "Include Screenshot",
    screenshotAlt: "Screenshot of the current view attached to this bug report",
    submit: "Send Report",
    submitted: "Bug report sent. Thank you!",
    submittedNoShot: "Bug report sent, but the screenshot was too large to include.",
    describeFirst: "Please describe the bug before sending.",
    tooLarge: "That report is too large to send. Try again without the screenshot.",
    rateLimited: "You've sent several reports recently. Please wait a bit before sending another.",
    failed: "Could not send the bug report. Please try again.",
  },
  // Character window (paperdoll) controls.
  paperdoll: {
    unequipAria: "Unequip {item}",
    unequipHint: "Click ×, right-click, or drag to bags to unequip",
  },
  // Home-page account portal (the logged-in "Account" nav tab). Lives here in the
  // English-only hud_chrome domain so an English-only PR compiles; translations
  // live in the overlays like any other hudChrome.* key.
  account: {
    title: "Account",
    loggedOutPrompt: "Log in to manage your account.",
    memberSince: "Member since {date}",
    sectionSettings: "Account Settings",
    sectionWallet: "$WOC Wallet",
    sectionCharacters: "Characters",
    sectionDanger: "Danger Zone",
    // Change password
    changePassword: "Change Password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmNewPassword: "Confirm new password",
    savePassword: "Update Password",
    passwordChanged: "Password updated. Other devices have been signed out.",
    errCurrentRequired: "Enter your current password.",
    errPasswordShort: "New password must be at least 6 characters.",
    errPasswordLong: "New password must be at most 128 characters.",
    errPasswordUnchanged: "New password must be different from the current one.",
    errPasswordConfirm: "New passwords do not match.",
    // Email
    emailLabel: "Email (optional)",
    emailHint: "Used only for account recovery. We never send marketing email.",
    saveEmail: "Save Email",
    emailSaved: "Email saved.",
    errEmailInvalid: "Enter a valid email address.",
    // Server-side (REST) failures, re-localized via main.ts userFacingApiError.
    errCurrentPassword: "Your current password is incorrect.",
    errUsernameMatch: "That username does not match your account.",
    errPasswordIncorrect: "Your password is incorrect.",
    errCharactersOnline: "Log out all of your characters before deactivating.",
    deactivatedLocked: "This account has been deactivated. Contact an admin to restore it.",
    // Characters
    charactersSummary: "Manage your characters and enter the world.",
    charactersCount: "Characters: {count}",
    goToCharacters: "View Characters",
    // Wallet
    walletSummary: "Verify a Solana wallet to show holder flair on your player card.",
    manageWallet: "Manage Wallet",
    // Deactivate
    deactivate: "Deactivate Account",
    deactivateWarning: "Deactivation locks your account and signs you out everywhere. Contact an admin to restore it. Confirm by re-entering your username and password.",
    confirmUsername: "Type your username to confirm",
    confirmPassword: "Password",
    deactivateConfirm: "Deactivate My Account",
    deactivated: "Your account has been deactivated.",
    // Log out
    logOut: "Log Out",
    logOutSummary: "Sign out of this device.",
  },
};
