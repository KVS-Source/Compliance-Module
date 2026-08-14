/** Pure effective-set calc for Framework Rule mapping save. */

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();

export type FrameworkRuleSaveSetInput = {
  selectedIds: string[];
  activeIds: string[];
  activeFrameworkIds: string[];
  /** frameworkId keyed by Framework Rule id */
  ruleFrameworkById: ReadonlyMap<string, string>;
  confirmDiscardInvalidated: boolean;
};

export type FrameworkRuleSaveSet = {
  validSelectedIds: string[];
  invalidatedSelectedIds: string[];
  /** IDs that would be submitted once confirmation is satisfied. */
  effectiveSaveIds: string[];
  hasEffectiveChanges: boolean;
  needsInvalidationConfirmation: boolean;
  canSave: boolean;
};

export function computeFrameworkRuleSaveSet(
  input: FrameworkRuleSaveSetInput,
): FrameworkRuleSaveSet {
  const activeFrameworks = new Set(input.activeFrameworkIds);
  const validSelectedIds: string[] = [];
  const invalidatedSelectedIds: string[] = [];

  for (const id of sortedIds(input.selectedIds)) {
    const frameworkId = input.ruleFrameworkById.get(id);
    if (frameworkId && activeFrameworks.has(frameworkId)) {
      validSelectedIds.push(id);
    } else {
      invalidatedSelectedIds.push(id);
    }
  }

  const needsInvalidationConfirmation =
    invalidatedSelectedIds.length > 0 && !input.confirmDiscardInvalidated;

  // Confirmed (or no invalids): payload is valid-only. While confirmation is
  // still required, effectiveSaveIds still reflects the post-drop set so Case F
  // can disable Save after confirm when nothing would change.
  const effectiveSaveIds = validSelectedIds;
  const hasEffectiveChanges =
    effectiveSaveIds.join(",") !== sortedIds(input.activeIds).join(",");

  return {
    validSelectedIds,
    invalidatedSelectedIds,
    effectiveSaveIds,
    hasEffectiveChanges,
    needsInvalidationConfirmation,
    canSave: !needsInvalidationConfirmation && hasEffectiveChanges,
  };
}
