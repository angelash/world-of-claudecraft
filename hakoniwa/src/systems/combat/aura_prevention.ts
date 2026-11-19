// Validation of the data-driven preventive aura fields, shared by content import checks.

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const multiplier = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const keys = (v: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(v).every((key) => allowed.includes(key));

/** Only the documented fields and finite reduction factors in 0..1 are accepted. */
export function validAuraPrevention(value: unknown): boolean {
  if (!object(value) || !keys(value, ['exposure', 'spot'])) return false;
  if (value.exposure === undefined && value.spot === undefined) return false;
  if (value.exposure !== undefined) {
    const e = value.exposure;
    if (!object(e) || !keys(e, ['multiplier', 'belowGrade']) || !multiplier(e.multiplier))
      return false;
    if (
      e.belowGrade !== undefined &&
      !(Number.isInteger(e.belowGrade) && Number(e.belowGrade) >= 1 && Number(e.belowGrade) <= 7)
    )
      return false;
  }
  if (value.spot !== undefined) {
    const s = value.spot;
    if (!object(s) || !keys(s, ['adult', 'child']) || !multiplier(s.adult) || !multiplier(s.child))
      return false;
  }
  return true;
}
