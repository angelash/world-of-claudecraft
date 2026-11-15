// Public surface of the AI layer (pure logic: no DOM, no direct clock, no direct network).
// Role packs live in src/game/ai_roles/; the dev proxy in tools/dev_api.ts. The development
// transport (./transports/dev_proxy) and the test doubles (./mocks) are imported by path.

export * from './audit';
export * from './budget';
export * from './contracts';
export * from './leak';
export * from './llm_config';
export * from './output';
export * from './pricing';
export * from './prompt';
export * from './providers';
export * from './roles';
export * from './runner';
export * from './transports';
