import { describe, expect, it } from 'vitest';
import { validateWorkflowSteps, type WorkflowStepInput } from './workflow-executor.js';

describe('validateWorkflowSteps', () => {
  it('rejects an empty pipeline', () => {
    const errors = validateWorkflowSteps([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/at least one step/);
  });

  it('accepts a valid pipeline with no cross-step references', () => {
    const steps: WorkflowStepInput[] = [
      { resource: '/v1/sentiment', params: { symbol: 'BTC' } },
      { resource: '/v1/risk-analysis', params: { symbol: 'BTC' } },
    ];
    expect(validateWorkflowSteps(steps)).toEqual([]);
  });

  it('accepts a valid pipeline where a later step references an earlier one', () => {
    const steps: WorkflowStepInput[] = [
      { resource: '/v1/sentiment', params: { symbol: 'BTC' } },
      { resource: '/v1/risk-analysis', params: { symbol: '{{steps[0].output.scope}}' } },
    ];
    expect(validateWorkflowSteps(steps)).toEqual([]);
  });

  it('rejects a step with an unknown or unsupported resource', () => {
    const steps: WorkflowStepInput[] = [{ resource: '/v1/not-a-real-endpoint', params: {} }];
    const errors = validateWorkflowSteps(steps);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/unknown or unsupported resource/);
  });

  it('rejects a step referencing itself', () => {
    const steps: WorkflowStepInput[] = [
      { resource: '/v1/sentiment', params: { symbol: 'BTC' } },
      { resource: '/v1/risk-analysis', params: { symbol: '{{steps[1].output.scope}}' } },
    ];
    const errors = validateWorkflowSteps(steps);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/references itself/);
  });

  it('rejects a step referencing a later step', () => {
    const steps: WorkflowStepInput[] = [
      { resource: '/v1/sentiment', params: { symbol: '{{steps[1].output.scope}}' } },
      { resource: '/v1/risk-analysis', params: { symbol: 'BTC' } },
    ];
    const errors = validateWorkflowSteps(steps);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Step 0/);
  });

  it('rejects a step referencing a step index that does not exist at all', () => {
    const steps: WorkflowStepInput[] = [{ resource: '/v1/sentiment', params: { symbol: '{{steps[5].output.scope}}' } }];
    const errors = validateWorkflowSteps(steps);
    expect(errors).toHaveLength(1);
  });

  it('reports every violation at once rather than short-circuiting on the first', () => {
    const steps: WorkflowStepInput[] = [
      { resource: '/v1/not-real', params: {} },
      { resource: '/v1/risk-analysis', params: { symbol: '{{steps[1].output.scope}}' } },
    ];
    const errors = validateWorkflowSteps(steps);
    expect(errors).toHaveLength(2);
  });
});
