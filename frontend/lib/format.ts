const MIDNIGHT_ISO_RE = /^(\d{4}-\d{2}-\d{2})T00:00:00(\.0+)?$/;

/** Formats a DuckDB result value for display: drops the time part from
 * midnight timestamps, and strips IEEE-754 noise (6978.419999999999 -> 6978.42)
 * without discarding genuine precision. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return String(Number.parseFloat(value.toPrecision(12)));
  }

  if (value instanceof Date) {
    return value.toISOString().replace(MIDNIGHT_ISO_RE, "$1");
  }

  const text = String(value);
  const dateOnly = text.match(MIDNIGHT_ISO_RE);
  return dateOnly ? dateOnly[1] : text;
}
