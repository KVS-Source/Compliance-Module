import { normaliseText } from "./normalise.js";

/**
 * Resolves the many spellings of a framework reference used across the
 * workbook onto a single framework.
 *
 * `05_Frameworks_Master` stores name and version in separate columns
 * (`ISO 9001` + `2015`) while every other sheet writes a combined token
 * (`ISO 9001:2015`, `CMMI-SVC L3`, `DPDPA 2023`, `ADA / WCAG 2.1 AA`).
 * Matching on the punctuation-stripped base name, longest code first, keeps
 * `ISO 9001` from stealing a reference intended for `ISO 45001`.
 */

const compact = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Drops the version suffix so `ISO 9001:2015` reduces to `ISO 9001`. */
const baseToken = (reference: string) => {
  const withoutVersion = reference.split(":")[0] ?? reference;
  return compact(withoutVersion);
};

export class FrameworkResolver {
  /** Compact framework code -> framework id. */
  private readonly byCode = new Map<string, string>();
  /** Codes sorted longest first, so the most specific prefix wins. */
  private codes: string[] = [];

  register(code: string, id: string) {
    this.byCode.set(compact(code), id);
    this.codes = [...this.byCode.keys()].sort((a, b) => b.length - a.length);
  }

  /**
   * Returns the framework id for a workbook reference, or `undefined` when no
   * registered framework matches. Callers turn `undefined` into a row error;
   * an unresolved reference is never silently dropped.
   */
  resolve(reference: string | null | undefined): string | undefined {
    const text = normaliseText(reference ?? null);
    if (text === undefined) return undefined;
    const base = baseToken(text);
    if (base === "") return undefined;
    const exact = this.byCode.get(base);
    if (exact) return exact;
    const full = compact(text);
    for (const code of this.codes) {
      if (base.startsWith(code) || full.startsWith(code)) {
        return this.byCode.get(code);
      }
    }
    return undefined;
  }

  /**
   * Resolves the first reference in a multi-value cell such as
   * `ISO 27001:2022; HIPAA; SOC 2`. The workbook treats the leading entry as
   * the primary framework.
   */
  resolvePrimary(reference: string | null | undefined): string | undefined {
    const text = normaliseText(reference ?? null);
    if (text === undefined) return undefined;
    for (const part of text.split(/[;,]/)) {
      const resolved = this.resolve(part);
      if (resolved) return resolved;
    }
    return undefined;
  }

  get size() {
    return this.byCode.size;
  }
}
