import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntervals, summarizeDay } from '../src/smt/intervals.js';
import {
  chicagoToDate,
  formatChicago,
  parseSmtDateTime,
  smtDate,
  smtDateToIsoDate,
} from '../src/smt/time.js';
import { dayReads } from './helpers.js';

test('Texas dates follow Central time, not UTC', () => {
  // 03:00 UTC on Nov 26 is still Nov 25 in Texas (CST, UTC-6).
  const now = new Date('2026-11-26T03:00:00Z');
  assert.equal(smtDate(0, now), '11/25/2026');
  assert.equal(smtDate(1, now), '11/24/2026');
  assert.equal(smtDate(25, now), '10/31/2026');
  assert.equal(smtDateToIsoDate('3/7/2026'), '2026-03-07');
});

test('wall-clock times convert with the right offset, DST included', () => {
  assert.equal(chicagoToDate('01/15/2026', 12).toISOString(), '2026-01-15T18:00:00.000Z');
  assert.equal(chicagoToDate('07/15/2026', 12).toISOString(), '2026-07-15T17:00:00.000Z');
  assert.equal(parseSmtDateTime('11/25/2026 14:30:15').toISOString(), '2026-11-25T20:30:15.000Z');
  assert.equal(parseSmtDateTime('garbage'), null);
  assert.equal(formatChicago(new Date('2026-11-25T20:30:00Z')), '11/25 14:30 CT');
});

test('a regular day has 96 quarter-hours', () => {
  const intervals = parseIntervals('11/24/2026', dayReads(0.25));
  assert.equal(intervals.length, 96);
  assert.equal(intervals[0].time.toISOString(), '2026-11-24T06:00:00.000Z');
  assert.equal(intervals.at(-1).hour, 23);
});

test('the 100-slot format skips the blank DST slots by position', () => {
  const slots = Array.from({ length: 100 }, (_, i) => (i >= 8 && i <= 11 ? '' : '0.1-A'));
  const intervals = parseIntervals('11/24/2026', slots.join(','));
  assert.equal(intervals.length, 96);
  assert.equal(intervals.at(-1).hour, 23, 'the last slot is still 23:45');
  assert.equal(intervals[8].hour, 2, 'slot 12 is 2:00');
});

test('summarizeDay totals consumption and surplus, and profiles them by hour', () => {
  const summary = summarizeDay([
    { type: 'C', date: '11/24/2026', reads: dayReads(0.25) },
    { type: 'G', date: '11/24/2026', reads: dayReads(0.05) },
    { type: 'X', date: '11/24/2026', reads: dayReads(9) },
  ]);
  assert.equal(summary.consumption, 24);
  assert.equal(summary.surplus, 4.8);
  assert.equal(summary.hourlyConsumption.length, 24);
  assert.deepEqual(summary.hourlyConsumption[0], { t: '2026-11-24T06:00:00.000Z', v: 1 });
  assert.equal(summary.hourlySurplus.length, 24);
});
