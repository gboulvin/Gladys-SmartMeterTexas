import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { MeterService, TRIGGERS, errorMessage } from '../src/meters.js';
import { FEATURE, buildMeterDevice, meterIds } from '../src/devices/meter.js';
import { normalizeConfig } from '../src/config.js';
import { SmtError } from '../src/smt/client.js';
import { METER, dayReads, setup } from './helpers.js';

test('a read publishes the index, the cloud badge and a meter_read event', async () => {
  const { gladys, service, updates } = setup();
  const ids = meterIds(gladys, METER.esiid);
  const result = await service.readMeter(METER.esiid);
  assert.equal(result.status, 'done');
  assert.equal(result.reading, 42000.5);
  assert.equal(result.readAt, '2026-11-25T20:30:00.000Z');
  assert.deepEqual(gladys.fake.states.at(-1), {
    device_feature_external_id: ids.feature(FEATURE.INDEX),
    state: 42000.5,
  });
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: TRIGGERS.METER_READ,
      data: {
        device: ids.device,
        reading: 42000.5,
        consumed_since_last: 0,
        read_at: '2026-11-25T20:30:00.000Z',
      },
    },
  ]);
  assert.equal(updates.length, 1, 'the widgets are nudged');
});

test('two reads within 30 minutes: the second is refused, the next one counts usage', async () => {
  let clock = Date.parse('2026-11-25T20:00:00Z');
  const { gladys, service, client } = setup({ now: () => clock });
  await service.readMeter(METER.esiid);
  clock += 10 * 60_000;
  assert.deepEqual(await service.readMeter(METER.esiid), { status: 'too_soon', minutes: 10 });
  assert.equal(client.readCalls, 1);
  clock += 25 * 60_000;
  await service.readMeter(METER.esiid);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.consumed_since_last, 9.75);
});

test('concurrent asks for the same meter share one read', async () => {
  const { service, client } = setup();
  const [a, b] = await Promise.all([
    service.readMeter(METER.esiid),
    service.readMeter(METER.esiid),
  ]);
  assert.deepEqual(a, b);
  assert.equal(client.readCalls, 1);
});

test('a read asked by a scene fires no event', async () => {
  const { gladys, service } = setup();
  await service.readMeter(METER.esiid, { fireEvents: false });
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.equal(gladys.fake.states.length, 1, 'the state is still published');
});

test('a failed read fires meter_read_failed and marks the meter unreachable', async () => {
  const { gladys, service, client } = setup();
  client.readError = new SmtError('slow', 'timeout');
  await assert.rejects(service.readMeter(METER.esiid), { code: 'timeout' });
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: TRIGGERS.METER_READ_FAILED,
    data: { device: meterIds(gladys, METER.esiid).device, error: 'timeout' },
  });
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
});

test('an unknown ESI ID is refused', async () => {
  const { service } = setup();
  await assert.rejects(service.readMeter('999'), { code: 'unknown_meter' });
});

test('daily usage falls back to the day before when yesterday is not in yet', async () => {
  const { gladys, service, client } = setup();
  const ids = meterIds(gladys, METER.esiid);
  client.intervals = [
    { type: 'C', reads: dayReads(0.5) },
    { type: 'G', reads: dayReads(0.1) },
  ];
  const original = client.fetchIntervals.bind(client);
  let first = true;
  client.fetchIntervals = async (esiid, date) => {
    if (first) {
      first = false;
      client.intervalCalls.push(date);
      throw new SmtError('none', 'no_data');
    }
    return original(esiid, date);
  };
  const summary = await service.refreshDailyUsage(METER.esiid);
  assert.deepEqual(client.intervalCalls, ['11/24/2026', '11/23/2026']);
  assert.equal(summary.date, '2026-11-23');
  assert.equal(summary.consumption, 48);
  assert.equal(summary.surplus, 9.6);
  const published = Object.fromEntries(
    gladys.fake.states.map((s) => [s.device_feature_external_id, s.state]),
  );
  assert.equal(published[ids.feature(FEATURE.DAILY_CONSUMPTION)], 48);
  assert.equal(published[ids.feature(FEATURE.DAILY_SURPLUS)], 9.6);
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: TRIGGERS.DAILY_USAGE_AVAILABLE,
    data: { device: ids.device, consumption: 48, surplus: 9.6, date: '2026-11-23' },
  });
});

test('tick reads the created meters, fetches yesterday once, and reports connected', async () => {
  let clock = Date.parse('2026-11-25T20:00:00Z');
  const { gladys, service, client } = setup({ now: () => clock });
  client.intervals = [{ type: 'C', reads: dayReads(0.25) }];
  await service.tick();
  assert.equal(client.readCalls, 1);
  assert.deepEqual(client.intervalCalls, ['11/24/2026']);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  clock += 60 * 60_000;
  await service.tick();
  assert.equal(client.readCalls, 2);
  assert.equal(client.intervalCalls.length, 1, 'yesterday is already in');
});

test('tick ignores the meters the user did not create', async () => {
  const { service, client } = setup({ created: false });
  await service.tick();
  assert.equal(client.readCalls, 0);
});

test('a refused login shows in the connection status', async () => {
  const { gladys, service, client } = setup();
  client.readError = new SmtError('no', 'auth');
  await service.tick();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.deepEqual(gladys.fake.connectionStatus.message, errorMessage(client.readError));
});

test('without credentials the service has no client and asks to configure', async () => {
  const gladys = createFakeGladys();
  const service = new MeterService(gladys);
  service.configure(normalizeConfig());
  assert.equal(service.client, null);
  await service.reportStatus();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  await assert.rejects(service.loadMeters(), { code: 'auth' });
});

test('start schedules the rounds at the configured interval', async () => {
  const timers = [];
  const { service } = setup();
  service.setTimer = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  service.clearTimer = () => {};
  service.start();
  assert.equal(timers[0].ms, 15_000);
  await timers[0].fn();
  assert.equal(timers[1].ms, 60 * 60_000);
  service.stop();
  assert.equal(service.timer, null);
});

test('the meter device is accepted by Gladys and every feature has its columns', async () => {
  const gladys = createFakeGladys();
  const device = buildMeterDevice(gladys, METER);
  await gladys.publishDiscoveredDevices([device]);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  for (const feature of device.features) {
    for (const column of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[column], undefined, `${feature.external_id}: ${column}`);
    }
    assert.equal(feature.read_only, true);
  }
  assert.equal(device.name, 'Smart Meter 1 MAIN ST');
});
