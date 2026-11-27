export function parseAllowedOrigins(corsOrigin: string): string[] {
  return corsOrigin
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function resolveAllowOriginHeader(
  requestOrigin: string | undefined,
  corsOrigin: string
): string | null {
  if (corsOrigin.trim() === '*') {
    return requestOrigin || '*';
  }
  const allowed = parseAllowedOrigins(corsOrigin);
  if (requestOrigin) {
    const normalized = requestOrigin.trim().replace(/\/+$/, '');
    if (allowed.includes(normalized)) {
      return normalized;
    }
  }
  return allowed[0] ?? null;
}
