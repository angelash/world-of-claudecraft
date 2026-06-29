const ASSIGNED_PLAYER_NAME_KEY = 'assignedPlayerName';

export function readAssignedPlayerName(
  plannerState: Record<string, unknown> | null | undefined,
): string {
  const value = plannerState?.[ASSIGNED_PLAYER_NAME_KEY];
  return typeof value === 'string' ? value : '';
}

export function writeAssignedPlayerName(
  plannerState: Record<string, unknown>,
  assignedPlayerName: string,
): Record<string, unknown> {
  const nextName = assignedPlayerName.trim();
  const currentName = readAssignedPlayerName(plannerState);
  if (currentName === nextName) return plannerState;
  if (nextName) {
    return {
      ...plannerState,
      [ASSIGNED_PLAYER_NAME_KEY]: nextName,
    };
  }
  if (!(ASSIGNED_PLAYER_NAME_KEY in plannerState)) return plannerState;
  const { [ASSIGNED_PLAYER_NAME_KEY]: _ignored, ...rest } = plannerState;
  return rest;
}
