export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
export function finiteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Expected a finite number');
  return value;
}
export function unsignedAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    throw new Error('Expected an unsigned integer string');
  return BigInt(value);
}
