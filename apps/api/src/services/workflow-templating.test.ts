import { describe, expect, it } from 'vitest';
import { extractStepReference, findStepReferences, resolveStepParams } from './workflow-templating.js';

describe('extractStepReference', () => {
  it('parses a step reference with a nested path', () => {
    expect(extractStepReference('{{steps[0].output.fearGreedIndex}}')).toEqual({ stepIndex: 0, path: ['fearGreedIndex'] });
  });

  it('parses a step reference with a deeper nested path', () => {
    expect(extractStepReference('{{steps[2].output.a.b.c}}')).toEqual({ stepIndex: 2, path: ['a', 'b', 'c'] });
  });

  it('parses a step reference with no path — the whole step output', () => {
    expect(extractStepReference('{{steps[1].output}}')).toEqual({ stepIndex: 1, path: [] });
  });

  it('returns null for a plain literal string', () => {
    expect(extractStepReference('BTC')).toBeNull();
  });

  it('returns null for a non-string value', () => {
    expect(extractStepReference(42)).toBeNull();
    expect(extractStepReference(null)).toBeNull();
    expect(extractStepReference({ a: 1 })).toBeNull();
  });

  it('returns null for partial interpolation inside a larger string — deliberately not supported', () => {
    expect(extractStepReference('prefix {{steps[0].output.x}} suffix')).toBeNull();
  });

  it('returns null for malformed reference syntax', () => {
    expect(extractStepReference('{{steps[0].output.}}')).toBeNull();
    expect(extractStepReference('{{steps[a].output}}')).toBeNull();
    expect(extractStepReference('{steps[0].output}')).toBeNull();
  });
});

describe('findStepReferences', () => {
  it('finds every reference among a params object, ignoring literals', () => {
    const refs = findStepReferences({ symbol: '{{steps[0].output.symbol}}', limit: 10, timeframe: '24h' });
    expect(refs).toEqual([{ stepIndex: 0, path: ['symbol'] }]);
  });

  it('returns an empty array when there are no references', () => {
    expect(findStepReferences({ symbol: 'BTC' })).toEqual([]);
  });
});

describe('resolveStepParams', () => {
  it('substitutes a resolved value from a prior step output', () => {
    const priorOutputs = [{ fearGreedIndex: 42, label: 'GREED' }];
    const resolved = resolveStepParams({ symbol: 'BTC', score: '{{steps[0].output.fearGreedIndex}}' }, priorOutputs);
    expect(resolved).toEqual({ symbol: 'BTC', score: 42 });
  });

  it('resolves a nested path', () => {
    const priorOutputs = [{ meta: { providers: ['coingecko'] } }];
    const resolved = resolveStepParams({ providers: '{{steps[0].output.meta.providers}}' }, priorOutputs);
    expect(resolved).toEqual({ providers: ['coingecko'] });
  });

  it('resolves the whole step output when the path is empty', () => {
    const priorOutputs = [{ a: 1, b: 2 }];
    const resolved = resolveStepParams({ whole: '{{steps[0].output}}' }, priorOutputs);
    expect(resolved).toEqual({ whole: { a: 1, b: 2 } });
  });

  it('leaves non-reference values untouched', () => {
    const resolved = resolveStepParams({ symbol: 'BTC', limit: 10 }, []);
    expect(resolved).toEqual({ symbol: 'BTC', limit: 10 });
  });

  it('resolves to undefined for a path that does not exist on the prior output', () => {
    const priorOutputs = [{ a: 1 }];
    const resolved = resolveStepParams({ x: '{{steps[0].output.doesNotExist}}' }, priorOutputs);
    expect(resolved.x).toBeUndefined();
  });

  it('resolves to undefined when the referenced step index is out of range', () => {
    const resolved = resolveStepParams({ x: '{{steps[5].output.a}}' }, [{ a: 1 }]);
    expect(resolved.x).toBeUndefined();
  });
});
