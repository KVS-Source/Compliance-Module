// Risk score = probability * impact. Business-facing risk level is major/minor.
export function computeRiskScore(probability: number, impact: number): number {
  return probability * impact;
}

export function riskLevelFromScore(score: number): string {
  return score >= 10 ? 'major' : 'minor';
}
