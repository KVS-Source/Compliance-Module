const IN_SCOPE_STATUSES = new Set(["active - in scope", "certified"]);

/**
 * The workbook's framework catalogue stores Company applicability in
 * `scopeStatus`. Its setup snapshot counts both explicitly active and
 * certified frameworks as operationally in scope; Planning remains outside
 * current compliance reporting until promoted by the client.
 */
export const isFrameworkActiveInScope = (scopeStatus: string | null) =>
  IN_SCOPE_STATUSES.has(
    scopeStatus
      ?.trim()
      .toLowerCase()
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\s+/g, " ") ?? "",
  );
