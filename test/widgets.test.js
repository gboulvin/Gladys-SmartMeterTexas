import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { METER_OVERVIEW_WIDGET, WIDGETS, refreshWidgets } from '../src/widgets.js';
import { MeterService } from '../src/meters.js';
import { buildMeterDevice, meterExternalId } from '../src/devices/meter.js';
import { normalizeConfig } from '../src/config.js';
import { METER, dayReads, setup } from './helpers.js';

const widget = WIDGETS[METER_OVERVIEW_WIDGET];
const get = (gladys, service, settings = {}) =>
  widget.get(gladys, { settings, language: 'en', units: 'metric', service });

test('the content is rendered exactly as sent, before and after the data arrives', async () => {
  const { gladys, service, client } = setup();
  await service.loadMeters();
  assert.deepEqual(validateWidgetContent(await get(gladys, service)), []);

  client.intervals = [
    { type: 'C', reads: dayReads(0.25) },
    { type: 'G', reads: dayReads(0.05) },
  ];
  await service.readMeter(METER.esiid);
  await service.refreshDailyUsage(METER.esiid);
  const content = await get(gladys, service, { device: meterExternalId(gladys, METER.esiid) });
  assert.deepEqual(validateWidgetContent(content), []);
  const chart = content.components.find((c) => c.type === 'chart');
  assert.equal(chart.series.length, 2, 'consumption and surplus');
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items[0].value, '11/25 14:30 CT');
});

test('the live tiles reference features the meter publishes', async () => {
  const { gladys, service } = setup();
  const featureIds = new Set(buildMeterDevice(gladys, METER).features.map((f) => f.external_id));
  const tiles = (await get(gladys, service)).components.filter((c) => c.device_feature);
  assert.equal(tiles.length, 3);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), `unknown feature ${tile.device_feature}`);
  }
});

test('without credentials or meters the widget explains what to do', async () => {
  const gladys = createFakeGladys();
  const service = new MeterService(gladys);
  service.configure(normalizeConfig());
  const content = await get(gladys, service);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text.en, /username and password/);

  const { gladys: g2, service: s2 } = setup({ created: false });
  const empty = await get(g2, s2);
  assert.match(empty.components[0].text.en, /Discover/);
});

test('Read now starts a read and answers a short toast at once', async () => {
  const { gladys, service, client } = setup();
  const content = await get(gladys, service);
  const button = content.components.find((c) => c.type === 'button');
  const toast = await widget.action(gladys, {
    actionKey: button.action.key,
    params: button.action.params,
    service,
  });
  assert.match(toast.en, /Reading requested/);
  assert.ok(Object.values(toast).every((text) => text.length <= 200));
  await service.inflight.get(METER.esiid);
  assert.equal(client.readCalls, 1);

  const tooSoon = await widget.action(gladys, {
    actionKey: button.action.key,
    params: button.action.params,
    service,
  });
  assert.match(tooSoon.en, /2 per hour/);
});

test('an unknown widget action fails', async () => {
  const { gladys, service } = setup();
  await assert.rejects(
    widget.action(gladys, { actionKey: 'nope', params: {}, service }),
    /Unknown widget action/,
  );
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});
