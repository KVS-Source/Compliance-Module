// Pure KPI calculation helpers (no database access) so they are easy to unit test.

export type RagStatus = 'red' | 'amber' | 'green';

export function computeVariance(actualValue: number, targetValue: number): number {
  return Number((actualValue - targetValue).toFixed(4));
}

// A simple, explainable RAG rule:
// - higher_is_better: green at/above target, amber within 10% below, else red.
// - lower_is_better:  green at/below target, amber within 10% above, else red.
export function computeRag(direction: string, targetValue: number, actualValue: number): RagStatus {
  if (targetValue === 0) {
    return actualValue === 0 ? 'green' : 'amber';
  }
  const ratio = actualValue / targetValue;
  if (direction === 'lower_is_better') {
    if (actualValue <= targetValue) return 'green';
    if (ratio <= 1.1) return 'amber';
    return 'red';
  }
  // default: higher_is_better
  if (actualValue >= targetValue) return 'green';
  if (ratio >= 0.9) return 'amber';
  return 'red';
}
