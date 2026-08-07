import { describe, expect, it } from 'vitest';
import { Budget } from './budget.js';
import { BudgetExceededError } from './errors.js';

describe('Budget', () => {
  it('allows a call within every configured cap', () => {
    const budget = new Budget({ perCallUsd: 0.1, sessionUsd: 1, dailyUsd: 5 });
    expect(() => budget.check('/v1/analyze', 0.05)).not.toThrow();
  });

  it('rejects a single call over the per-call cap', () => {
    const budget = new Budget({ perCallUsd: 0.05 });
    expect(() => budget.check('/v1/analyze', 0.06)).toThrow(BudgetExceededError);
  });

  it('accumulates session spend across calls and rejects once the cap is crossed', () => {
    const budget = new Budget({ sessionUsd: 0.1 });
    budget.check('/v1/analyze', 0.06);
    budget.record(0.06);
    expect(() => budget.check('/v1/analyze', 0.06)).toThrow(BudgetExceededError);
  });

  it('does not record spend on check alone — only a completed call should count', () => {
    const budget = new Budget({ sessionUsd: 0.1 });
    budget.check('/v1/analyze', 0.06); // checked, never recorded (call presumably failed downstream)
    expect(() => budget.check('/v1/analyze', 0.06)).not.toThrow();
    expect(budget.spentThisSessionUsd).toBe(0);
  });

  it('shares state across every holder of the same instance — the multi-agent coordination case', () => {
    const shared = new Budget({ sessionUsd: 0.1 });
    // Two "agents" hold the same Budget instance.
    const agentA = shared;
    const agentB = shared;

    agentA.check('/v1/analyze', 0.06);
    agentA.record(0.06);

    expect(() => agentB.check('/v1/risk-analysis', 0.06)).toThrow(BudgetExceededError);
  });

  it('tracks daily spend independently of session spend', () => {
    const budget = new Budget({ dailyUsd: 0.1 });
    budget.record(0.06);
    expect(budget.spentTodayUsd()).toBeCloseTo(0.06);
    expect(() => budget.check('/v1/analyze', 0.05)).toThrow(BudgetExceededError);
  });

  it('reports which specific cap was exceeded', () => {
    const budget = new Budget({ perCallUsd: 0.01 });
    try {
      budget.check('/v1/analyze', 0.05);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BudgetExceededError);
      expect((error as BudgetExceededError).limit).toBe('perCall');
      expect((error as BudgetExceededError).limitUsd).toBe(0.01);
    }
  });
});
