import type { RiskLevel } from '@rohankumar4179/shared-types';
import type { SignalScores } from '../types.js';
import { clamp } from '../utils.js';

export interface RiskAssessment {
  riskLevel: RiskLevel;
  riskScore: number;
  drawdownRiskPct: number;
  factors: string[];
}

const VOLATILITY_WEIGHT = 0.5;
const LIQUIDITY_RISK_WEIGHT = 0.3;
const DATA_RISK_WEIGHT = 0.2;

export function riskAssessor(signals: SignalScores, dataCompleteness: number): RiskAssessment {
  const liquidityRisk = 100 - signals.liquidity;
  const dataRisk = (1 - dataCompleteness) * 100;

  const riskScore = clamp(
    Math.round(
      signals.volatility * VOLATILITY_WEIGHT +
        liquidityRisk * LIQUIDITY_RISK_WEIGHT +
        dataRisk * DATA_RISK_WEIGHT,
    ),
    0,
    100,
  );

  const riskLevel: RiskLevel = riskScore >= 66 ? 'HIGH' : riskScore >= 33 ? 'MEDIUM' : 'LOW';

  const factors: string[] = [];
  if (signals.volatility >= 66) factors.push('High recent price volatility');
  if (signals.liquidity <= 33) factors.push('Thin liquidity increases slippage risk');
  if (dataCompleteness < 0.75) factors.push('Response built from partial upstream data');
  if (factors.length === 0) factors.push('No elevated risk factors detected');

  const drawdownRiskPct = clamp(Math.round(signals.volatility * 0.6 + liquidityRisk * 0.2), 0, 100);

  return { riskLevel, riskScore, drawdownRiskPct, factors };
}
