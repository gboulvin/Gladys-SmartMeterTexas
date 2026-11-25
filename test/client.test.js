import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SmartMeterTexasClient } from '../src/smt/client.js';
import { fakeFetch } from './helpers.js';

const AUTH = '/commonapi/user/authenticate';
const login = () => ({ body: { token: 'tok-1' } });

function client(routes, extra = {}) {
  const { fetchImpl, calls } = fakeFetch(routes);
  let clock = 0;
  const instance = new SmartMeterTexasClient(
    { username: 'user', password: 'secret' },
    {
      fetch: fetchImpl,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      ...extra,
    },
  );
  return { instance, calls };
}

test('logs in once, then lists the meters with the bearer token', async () => {
  const { instance, calls } = client({
    [AUTH]: login,
    '/api/meter': () => ({
      body: {
        data: [
          { esiid: '1044', meterNumber: 'M1', address: ' 1 MAIN ST ' },
          { esiid: null, meterNumber: 'broken' },
        ],
      },
    }),
  });
  const meters = await instance.fetchMeters();
  assert.deepEqual(meters, [{ esiid: '1044', meterNumber: 'M1', address: '1 MAIN ST' }]);
  await instance.fetchMeters();
  assert.equal(calls.filter((call) => call.path === AUTH).length, 1, 'the token is reused');
  assert.deepEqual(calls[0].body, { username: 'user', password: 'secret', rememberMe: 'true' });
  assert.equal(calls[1].headers.authorization, 'Bearer tok-1');
  assert.deepEqual(calls[1].body, { esiid: '*' });
});

test('a refused login is an auth error, a 403 a rate limit', async () => {
  await assert.rejects(client({ [AUTH]: () => ({ status: 400 }) }).instance.fetchMeters(), {
    code: 'auth',
  });
  await assert.rejects(client({ [AUTH]: () => ({ status: 403 }) }).instance.fetchMeters(), {
    code: 'rate_limit',
  });
  await assert.rejects(
    client({
      [AUTH]: () => ({ body: { errormessage: 'ERR-USR-USERNOTFOUND' } }),
    }).instance.fetchMeters(),
    { code: 'auth' },
  );
});

test('a 401 logs in again once', async () => {
  const { instance, calls } = client({
    [AUTH]: login,
    '/api/meter': [() => ({ status: 401 }), () => ({ body: { data: [] } })],
  });
  assert.deepEqual(await instance.fetchMeters(), []);
  assert.equal(calls.filter((call) => call.path === AUTH).length, 2);
});

test('readMeter ignores the previous read and waits for the new one', async () => {
  const statuses = [
    () => ({
      body: { data: { odrstatus: 'COMPLETED', odrread: '41000', odrdate: '11/25/2026 10:00:00' } },
    }),
    () => ({ body: { data: { odrstatus: 'PENDING' } } }),
    () => ({
      body: { data: { odrstatus: 'COMPLETED', odrread: '41000', odrdate: '11/25/2026 10:00:00' } },
    }),
    () => ({
      body: {
        data: {
          odrstatus: 'COMPLETED',
          odrread: '41012.5',
          odrdate: '11/25/2026 14:30:00',
          odrusage: '12.5',
        },
      },
    }),
  ];
  const { instance, calls } = client({
    [AUTH]: login,
    '/api/usage/latestodrread': statuses,
    '/api/ondemandread': () => ({ body: { data: {} } }),
  });
  const result = await instance.readMeter({ esiid: '1044', meterNumber: 'M1' });
  assert.deepEqual(result, { reading: 41012.5, date: '11/25/2026 14:30:00', usage: 12.5 });
  const odr = calls.find((call) => call.path === '/api/ondemandread');
  assert.deepEqual(odr.body, { ESIID: '1044', MeterNumber: 'M1' });
});

test('readMeter gives up after its timeout', async () => {
  const { instance } = client({
    [AUTH]: login,
    '/api/usage/latestodrread': () => ({ body: { data: { odrstatus: 'PENDING' } } }),
    '/api/ondemandread': () => ({ body: {} }),
  });
  await assert.rejects(
    instance.readMeter({ esiid: '1044', meterNumber: 'M1' }, { timeoutMs: 60_000 }),
    {
      code: 'timeout',
    },
  );
});

test('fetchIntervals returns the series, or a no_data error', async () => {
  const { instance, calls } = client({
    [AUTH]: login,
    '/api/adhoc/intervalsynch': [
      () => ({
        body: { data: { energyData: [{ RT: 'C', DT: '11/24/2026', RD: '0.1-A,0.2-A' }] } },
      }),
      () => ({
        body: { data: { errorMessage: 'No Energy Data received from the respective TDSP' } },
      }),
    ],
  });
  assert.deepEqual(await instance.fetchIntervals('1044', '11/24/2026'), [
    { type: 'C', date: '11/24/2026', reads: '0.1-A,0.2-A' },
  ]);
  assert.deepEqual(calls.at(-1).body.ESIID, ['1044']);
  assert.equal(calls.at(-1).body.startDate, '11/24/2026');
  await assert.rejects(instance.fetchIntervals('1044', '11/23/2026'), { code: 'no_data' });
});

test('a network failure is an api error', async () => {
  const instance = new SmartMeterTexasClient(
    { username: 'u', password: 'p' },
    {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    },
  );
  await assert.rejects(instance.fetchMeters(), { code: 'api' });
});
