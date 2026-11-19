// Close-up framing declared by these props' entries in assets/prompts/specs/props.json.
// The hand's second frame shares its first frame's layout. Other props keep their template
// anchor; a cutscene-like name alone never opts an asset into this contract.
const CENTERED_CLOSEUPS: ReadonlySet<string> = new Set([
  'art_prop_cut_brun_glove',
  'art_prop_cut_door_mark',
  'art_prop_cut_door_mark_2',
]);

export function cutscenePropIsCentered(assetId: string): boolean {
  return CENTERED_CLOSEUPS.has(assetId);
}
