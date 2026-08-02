const ACTIVE_IN_SCOPE = "active - in scope";

/**
 * The workbook's framework catalogue stores Company applicability in
 * `scopeStatus`. Catalogue lifecycle (`Framework.status`) is not a substitute:
 * Certified and Planning rows may remain usable shared masters without being
 * part of the current compliance dashboard.
 */
export const isFrameworkActiveInScope = (scopeStatus: string | null) =>
  scopeStatus
    ?.trim()
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ") === ACTIVE_IN_SCOPE;
