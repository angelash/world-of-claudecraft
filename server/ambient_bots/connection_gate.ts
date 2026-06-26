export interface AmbientBotConnectionGateInput {
  blocked: boolean;
  isAdmin: boolean;
  isAmbientBot: boolean;
  ipSessions: number;
  hardLimit: number;
}

export function isAmbientBotConnectionRefused(input: AmbientBotConnectionGateInput): boolean {
  if (input.blocked && !input.isAdmin) return true;
  if (input.isAdmin || input.isAmbientBot) return false;
  return input.ipSessions >= input.hardLimit;
}
