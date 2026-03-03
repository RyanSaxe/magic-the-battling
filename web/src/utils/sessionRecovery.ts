export function shouldClearSessionOnInvalidEvent(
  invalidSession: boolean,
  wasInvalidSession: boolean,
  hasSession: boolean,
): boolean {
  return hasSession && invalidSession && !wasInvalidSession
}

