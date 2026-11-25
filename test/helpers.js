// Test doubles: a fake Smart Meter Texas client for the service, and a fake
// `fetch` for the HTTP client. Tests never touch the network.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { MeterService } from '../src/meters.js';
import { normalizeConfig } from '../src/config.js';
import { meterExternalId } from '../src/devices/meter.js';
import { SmtError } from '../src/smt/client.js';

export const METER = {
  esiid: '10443720001234567',
  meterNumber: '123456789LG',
  address: '1 MAIN ST',
};
export const CONFIG = normalizeConfig({ username: 'user', password: 'secret' });

/** 96 quarter-hours of `kwh` each, in the Smart Meter Texas format. */
export function dayReads(kwh, slots = 96) {
  return Array.from({ length: slots }, () => `${kwh}-A`).join(',');
}

export class FakeClient {
  constructor() {
    this.meters = [METER];
    this.readings = [42000.5, 42010.25];
    this.readCalls = 0;
    this.readError = null;
    this.intervals = null; // null -> no data
    this.intervalCalls = [];
  }

  async fetchMeters() {
    return this.meters;
  }

  async readMeter() {
    this.readCalls += 1;
    if (this.readError) {
      throw this.readError;
    }
    const reading = this.readings[Math.min(this.readCalls - 1, this.readings.length - 1)];
    return { reading, date: '11/25/2026 14:30:00', usage: null };
  }

  async fetchIntervals(esiid, date) {
    this.intervalCalls.push(date);
    if (!this.intervals) {
      throw new SmtError(`No interval data for ${date}`, 'no_data');
    }
    return this.intervals.map((entry) => ({ ...entry, date }));
  }
}

/** A service wired to a fake Gladys (with the meter created) and a fake client. */
export function setup({ created = true, now = () => Date.parse('2026-11-25T20:00:00Z') } = {}) {
  const probe = createFakeGladys();
  const devices = created
    ? [{ external_id: meterExternalId(probe, METER.esiid), name: 'Meter' }]
    : [];
  const gladys = createFakeGladys({ devices });
  const client = new FakeClient();
  const updates = [];
  const service = new MeterService(gladys, {
    createClient: () => client,
    now,
    onUpdate: () => updates.push(1),
  });
  service.configure(CONFIG);
  return { gladys, client, service, updates };
}

/**
 * Fake `fetch` answering by path. `routes[path]` is a function
 * `(body, headers) => ({ status, body })`, or a queue (array) of them.
 */
export function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    calls.push({ path, body, headers: init.headers });
    const route = routes[path];
    const handler = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route;
    if (!handler) {
      return new Response('not found', { status: 404 });
    }
    const { status = 200, body: answer = {} } = handler(body, init.headers);
    return new Response(JSON.stringify(answer), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}
