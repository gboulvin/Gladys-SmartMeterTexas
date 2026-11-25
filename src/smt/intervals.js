// -----------------------------------------------------------------------------
// 15-minute interval data.
//
// Smart Meter Texas sends a day as one comma-separated string per series
// (`C` consumption, `G` surplus generation), each read being `kWh-quality`
// (e.g. `0.215-A`). A day has 96 slots, or 100 where slots 8 to 11 hold the
// repeated 1 AM hour when daylight saving time ends (blank on other days):
// the time of a slot comes from its position, not its order.
// -----------------------------------------------------------------------------

import { chicagoToDate } from './time.js';

/**
 * @param {string} date `MM/DD/YYYY`
 * @param {string} reads comma-separated `kWh-quality` reads
 * @returns {{ time: Date, hour: number, kwh: number }[]}
 */
export function parseIntervals(date, reads) {
  const slots = String(reads ?? '').split(',');
  const intervals = [];
  slots.forEach((read, slot) => {
    if (!read) {
      return;
    }
    const kwh = Number(read.split('-')[0]);
    if (!Number.isFinite(kwh)) {
      return;
    }
    const position = slots.length === 100 && slot >= 8 ? slot - 4 : slot;
    const minutes = position * 15;
    const hour = Math.floor(minutes / 60);
    intervals.push({ time: chicagoToDate(date, hour, minutes % 60), hour, kwh });
  });
  return intervals;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Daily totals and hourly profile of the series of one day.
 * @param {{ type: string, date: string, reads: string }[]} series
 * @returns {{ consumption: number, surplus: number,
 *   hourlyConsumption: { t: string, v: number }[], hourlySurplus: { t: string, v: number }[] }}
 */
export function summarizeDay(series) {
  const result = { consumption: 0, surplus: 0, hourlyConsumption: [], hourlySurplus: [] };
  for (const { type, date, reads } of series) {
    const target =
      type === 'C'
        ? { total: 'consumption', hourly: 'hourlyConsumption' }
        : type === 'G'
          ? { total: 'surplus', hourly: 'hourlySurplus' }
          : null;
    if (!target) {
      continue;
    }
    const byHour = new Map();
    for (const { time, hour, kwh } of parseIntervals(date, reads)) {
      result[target.total] += kwh;
      // Keyed by the start of the hour; the repeated DST hour stays apart.
      const start = new Date(Math.floor(time.getTime() / 3_600_000) * 3_600_000);
      const key = `${hour}-${start.toISOString()}`;
      const entry = byHour.get(key) ?? { t: start.toISOString(), v: 0 };
      entry.v += kwh;
      byHour.set(key, entry);
    }
    result[target.hourly].push(...[...byHour.values()].map(({ t, v }) => ({ t, v: round3(v) })));
  }
  result.consumption = round3(result.consumption);
  result.surplus = round3(result.surplus);
  return result;
}
