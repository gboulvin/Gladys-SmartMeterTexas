import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { ACTIONS } from '../src/actions.js';
import { TRIGGERS } from '../src/meters.js';
import { meterExternalId } from '../src/devices/meter.js';
import { SmtError } from '../src/smt/client.js';
import { CONFIG, METER, dayReads, setup } from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);

function assertDeclaredOutputs(key, outputs) {
  const declared = keysOf(declarationOf('scene_actions', key).outputs);
  assert.deepEqual(Object.keys(outputs).sort(), [...declared].sort(), `${key} outputs`);
}

test('request_meter_read returns the reading, without firing a scene event', async () => {
  const { gladys, service } = setup();
  const outputs = await SCENE_ACTIONS.request_meter_read(gladys, {
    fields: { device: meterExternalId(gladys, METER.esiid) },
    service,
  });
  assert.deepEqual(outputs, {
    completed: true,
    reading: 42000.5,
    read_at: '2026-11-25T20:30:00.000Z',
  });
  assertDeclaredOutputs('request_meter_read', outputs);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('request_meter_read reports a read still running as not completed', async () => {
  const { gladys, service, client } = setup();
  client.readMeter = () => new Promise(() => {});
  const outputs = await SCENE_ACTIONS.request_meter_read(gladys, {
    fields: { device: meterExternalId(gladys, METER.esiid) },
    service,
    waitMs: 5,
  });
  assert.deepEqual(outputs, { completed: false, reading: 0, read_at: '' });
});

test('request_meter_read refuses a device that is not a meter', async () => {
  const { gladys, service } = setup();
  await assert.rejects(
    SCENE_ACTIONS.request_meter_read(gladys, { fields: { device: 'ext:other:x' }, service }),
    { code: 'unknown_meter' },
  );
});

test('refresh_daily_usage returns the totals, or available: false', async () => {
  const { gladys, service, client } = setup();
  const fields = { device: meterExternalId(gladys, METER.esiid), days_ago: 3 };
  const none = await SCENE_ACTIONS.refresh_daily_usage(gladys, { fields, service });
  assert.deepEqual(none, { available: false, consumption: 0, surplus: 0, date: '' });
  assertDeclaredOutputs('refresh_daily_usage', none);
  assert.deepEqual(client.intervalCalls, ['11/22/2026', '11/21/2026']);

  client.intervals = [{ type: 'C', reads: dayReads(0.5) }];
  const outputs = await SCENE_ACTIONS.refresh_daily_usage(gladys, { fields, service });
  assert.deepEqual(outputs, { available: true, consumption: 48, surplus: 0, date: '2026-11-22' });
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('the triggers the service fires carry only declared, primitive data', async () => {
  const { gladys, service, client } = setup();
  client.intervals = [{ type: 'C', reads: dayReads(0.5) }];
  await service.readMeter(METER.esiid);
  await service.refreshDailyUsage(METER.esiid);
  client.readError = new SmtError('slow', 'timeout');
  service.readings.clear();
  await service.readMeter(METER.esiid).catch(() => {});
  const fired = new Set(gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual([...fired].sort(), Object.values(TRIGGERS).sort());
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} not primitive`);
    }
  }
  const failed = gladys.fake.sceneEvents.find((e) => e.key === TRIGGERS.METER_READ_FAILED);
  const reasons = declarationOf('scene_triggers', TRIGGERS.METER_READ_FAILED)
    .fields.find((f) => f.key === 'error')
    .options.map((o) => o.value);
  assert.ok(reasons.includes(failed.data.error));
});

test('the read_meter action answers in every language', async () => {
  const { gladys, service } = setup();
  const message = await ACTIONS.read_meter(gladys, {
    fields: { device: meterExternalId(gladys, METER.esiid) },
    service,
    config: CONFIG,
  });
  assert.equal(message.en, 'Meter read: 42000.5 kWh.');
  assert.deepEqual(Object.keys(message), ['en', 'fr', 'de', 'es']);
  const again = await ACTIONS.read_meter(gladys, {
    fields: { device: meterExternalId(gladys, METER.esiid) },
    service,
    config: CONFIG,
  });
  assert.match(again.en, /2 per hour/);
});

test('test_connection counts the meters, or explains the failure', async () => {
  const { gladys, service, client } = setup();
  assert.match((await ACTIONS.test_connection(gladys, { service, config: CONFIG })).en, /1 meter/);
  client.fetchMeters = async () => {
    throw new SmtError('no', 'auth');
  };
  const message = await ACTIONS.test_connection(gladys, { service, config: CONFIG });
  assert.match(message.en, /refused/);
  assert.equal(gladys.fake.connectionStatus.connected, false);
});
