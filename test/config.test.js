import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';
import { t } from '../src/i18n.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(isConfigured(normalizeConfig()), false);
});

test('normalizeConfig trims the username and keeps the password as typed', () => {
  const config = normalizeConfig({ username: '  me ', password: ' p@ss ' });
  assert.equal(config.username, 'me');
  assert.equal(config.password, ' p@ss ');
  assert.equal(isConfigured(config), true);
});

test('the refresh interval is coerced and kept between 30 minutes and a day', () => {
  assert.equal(normalizeConfig({ refresh_interval: '90' }).refresh_interval, 90);
  assert.equal(normalizeConfig({ refresh_interval: 5 }).refresh_interval, 30);
  assert.equal(normalizeConfig({ refresh_interval: 99999 }).refresh_interval, 1440);
  assert.equal(normalizeConfig({ refresh_interval: 'abc' }).refresh_interval, 60);
});

test('daily usage is on unless explicitly turned off', () => {
  assert.equal(normalizeConfig().daily_usage, true);
  assert.equal(normalizeConfig({ daily_usage: false }).daily_usage, false);
});

test('t fills the placeholders in every language', () => {
  const message = t('connection_ok', { count: 2 });
  assert.equal(message.en, 'Connected to Smart Meter Texas: 2 meter(s) found.');
  assert.match(message.de, /2 Zähler/);
  assert.throws(() => t('nope'));
});
