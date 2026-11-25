// -----------------------------------------------------------------------------
// Date helpers. Smart Meter Texas speaks in Texas local time (America/Chicago)
// and in `MM/DD/YYYY` dates; Gladys wants ISO 8601 instants. Node ships the
// full ICU data, so Intl knows the Central time zone and its DST rules.
// -----------------------------------------------------------------------------

export const SMT_TIME_ZONE = 'America/Chicago';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SMT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Wall-clock parts of an instant in Texas. */
function chicagoParts(date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * The `MM/DD/YYYY` date, in Texas, `daysAgo` days before `now`.
 * @param {number} daysAgo
 * @param {Date} [now]
 */
export function smtDate(daysAgo = 0, now = new Date()) {
  const { year, month, day } = chicagoParts(now);
  // Calendar arithmetic on the Texas date itself (UTC noon avoids DST edges).
  const date = new Date(Date.UTC(year, month - 1, day, 12) - daysAgo * 86_400_000);
  return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${date.getUTCFullYear()}`;
}

/** `MM/DD/YYYY` -> `YYYY-MM-DD`. */
export function smtDateToIsoDate(date) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(date).trim());
  if (!match) {
    throw new Error(`Invalid Smart Meter Texas date: ${date}`);
  }
  return `${match[3]}-${pad(match[1])}-${pad(match[2])}`;
}

/**
 * Instant of a Texas wall-clock date-time.
 * @param {string} date `MM/DD/YYYY`
 * @param {number} [hour]
 * @param {number} [minute]
 * @param {number} [second]
 * @returns {Date}
 */
export function chicagoToDate(date, hour = 0, minute = 0, second = 0) {
  const [year, month, day] = smtDateToIsoDate(date).split('-').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Offset of Texas at that instant, then a second pass for the DST edges.
  let guess = asUtc;
  for (let i = 0; i < 2; i += 1) {
    const p = chicagoParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess = asUtc - (shown - guess);
  }
  return new Date(guess);
}

/**
 * Parse an on-demand read date, e.g. `11/25/2026 14:32:10` (Texas time).
 * @returns {Date | null}
 */
export function parseSmtDateTime(value) {
  const match = /^(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(
    String(value ?? '').trim(),
  );
  if (!match) {
    return null;
  }
  return chicagoToDate(
    match[1],
    Number(match[2] ?? 0),
    Number(match[3] ?? 0),
    Number(match[4] ?? 0),
  );
}

/** Short Texas-time label for a status row, e.g. `11/25 14:32 CT`. */
export function formatChicago(date) {
  const p = chicagoParts(date);
  return `${pad(p.month)}/${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} CT`;
}
