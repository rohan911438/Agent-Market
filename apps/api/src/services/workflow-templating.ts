/**
 * Minimal step-reference templating for the orchestration engine (Phase
 * 12) — deliberately just path substitution into a JSON structure, not a
 * general expression language. The only supported form is a param value
 * that is *entirely* a reference string:
 *
 *   "{{steps[0].output.fearGreedIndex}}"
 *
 * There is no partial interpolation inside a larger string, no arithmetic,
 * no filters. A param value that doesn't match this exact shape is passed
 * through unchanged (a literal).
 */

const STEP_REFERENCE_PATTERN = /^\{\{steps\[(\d+)\]\.output((?:\.[a-zA-Z0-9_]+)*)\}\}$/;

export interface StepReference {
  stepIndex: number;
  path: string[];
}

/** Returns the parsed reference if `value` is entirely a `{{steps[N].output...}}` string, else null (meaning: treat it as a literal). */
export function extractStepReference(value: unknown): StepReference | null {
  if (typeof value !== 'string') return null;
  const match = STEP_REFERENCE_PATTERN.exec(value);
  if (!match) return null;
  const stepIndex = Number(match[1]);
  const path = match[2] ? match[2].slice(1).split('.') : [];
  return { stepIndex, path };
}

/** Every step reference found among a step's param values (top-level values only — see the module comment on scope). */
export function findStepReferences(params: Record<string, unknown>): StepReference[] {
  return Object.values(params)
    .map(extractStepReference)
    .filter((ref): ref is StepReference => ref !== null);
}

function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Resolves every `{{steps[N].output...}}` value in `params` against
 * `priorOutputs` (indexed by step position), leaving every non-reference
 * value untouched. A reference to a path that doesn't exist on the prior
 * output resolves to `undefined` — the caller is expected to re-validate
 * the resolved params against that step's real schema, which will reject
 * an unexpectedly-undefined required field as a normal validation failure.
 */
export function resolveStepParams(params: Record<string, unknown>, priorOutputs: unknown[]): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const ref = extractStepReference(value);
    resolved[key] = ref ? getPath(priorOutputs[ref.stepIndex], ref.path) : value;
  }
  return resolved;
}
