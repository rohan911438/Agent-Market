export function buildCacheKey(
  namespace: string,
  params: Record<string, string | number | boolean | undefined> = {},
): string {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return query ? `${namespace}?${query}` : namespace;
}
