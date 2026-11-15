// The autoplayer (D-010 acceptance): a scripted player that walks the no-model build
// from the prologue to an ending with player commands only. Pure logic over the engine.

export { DomainPlanner } from './domains';
export * from './fight';
export * from './nav';
export {
  type ActRecord,
  Autoplayer,
  type AutoplayOptions,
  type AutoplayResult,
  type Intent,
} from './player';
export * from './scene_policy';
