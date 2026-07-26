import { describe, expect, it } from 'vitest';
import { computeRag, computeVariance } from '../src/utils/kpi';
import { isActiveFrameworkCode } from '../src/utils/framework-scope';
import { riskLevelFromScore } from '../src/utils/risk';

describe('KPI calculations', () => {
  it('calculates variance and RAG for higher-is-better KPIs', () => {
    expect(computeVariance(96, 95)).toBe(1);
    expect(computeRag('higher_is_better', 95, 96)).toBe('green');
    expect(computeRag('higher_is_better', 100, 95)).toBe('amber');
    expect(computeRag('higher_is_better', 100, 80)).toBe('red');
  });

  it('reverses the RAG rule for lower-is-better KPIs', () => {
    expect(computeRag('lower_is_better', 10, 8)).toBe('green');
    expect(computeRag('lower_is_better', 10, 11)).toBe('amber');
    expect(computeRag('lower_is_better', 10, 12)).toBe('red');
  });
});

describe('framework scope', () => {
  it('includes only current frameworks', () => {
    expect(isActiveFrameworkCode('ISO_27001')).toBe(true);
    expect(isActiveFrameworkCode('DPDPA')).toBe(true);
    expect(isActiveFrameworkCode('GDPR')).toBe(false);
    expect(isActiveFrameworkCode('WCAG')).toBe(false);
  });
});

describe('KPI risk classification', () => {
  it('uses only major/minor business levels', () => {
    expect(riskLevelFromScore(4)).toBe('minor');
    expect(riskLevelFromScore(9)).toBe('minor');
    expect(riskLevelFromScore(10)).toBe('major');
    expect(riskLevelFromScore(16)).toBe('major');
  });
});
