/** Risk taxonomy from the TANIA Development Constitution. */

export const RISK_LEVELS = [
  'INFORMATIONAL',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Levels at or above the configured threshold require a human decision. */
export type ApprovalThreshold = Extract<RiskLevel, 'MEDIUM' | 'HIGH' | 'CRITICAL'>;

function rank(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level);
}

export function isAtLeastRisk(level: RiskLevel, threshold: RiskLevel): boolean {
  return rank(level) >= rank(threshold);
}

export function highestRisk(levels: readonly RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (highest, level) => (rank(level) > rank(highest) ? level : highest),
    'INFORMATIONAL',
  );
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && (RISK_LEVELS as readonly string[]).includes(value);
}
