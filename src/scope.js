export const VALID_SCOPES = ["user", "repo", "both"];

export function expandScope(scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope} (expected 'user', 'repo', or 'both')`);
  }
  return scope === "both" ? ["user", "repo"] : [scope];
}
