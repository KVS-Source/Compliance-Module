/**
 * Validates a `returnTo` query parameter for internal post-create navigation.
 * Rejects protocol-relative paths, absolute URLs, and external hosts.
 */
export function parseReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.includes("\\")) return null;
  return trimmed;
}

export function buildReturnToSearch(
  returnTo: string | null,
  linkKpiActualId: string | null,
): string {
  const params = new URLSearchParams();
  if (returnTo) params.set("returnTo", returnTo);
  if (linkKpiActualId) params.set("linkKpiActualId", linkKpiActualId);
  const query = params.toString();
  return query ? `?${query}` : "";
}
