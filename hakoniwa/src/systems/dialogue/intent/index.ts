// Free-input pipeline (builtin_ai.md 6.3 to 6.5, 19 step 3): normalization, entity
// extraction, sentence templates, classification and response. Replaces the five regexes
// of src/systems/dialogue/replies.ts answer().

export * from './classify';
export * from './content';
export * from './entities';
export * from './normalize';
export * from './pattern';
export * from './respond';
export * from './types';
