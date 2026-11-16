// The built-in AI primitives (builtin_ai.md 1.7 and 2): response curves, utility scoring,
// behavior trees, HTN planning, rule tables and decision traces. One copy, reused by every
// brain (NPCs, goddesses, rulers, generals, companions, officials, the director). Pure and
// deterministic: no clock, no Math.random; every draw comes from a named stream the
// caller passes in (tests/architecture.test.ts scans this directory).

export * from './bt';
export * from './curves';
export * from './htn';
export * from './rules';
export * from './trace';
export * from './utility';
