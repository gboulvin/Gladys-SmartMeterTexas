// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// `fields` arrive resolved by the core (a `"source": "devices"` field is the
// chosen device external_id); each handler resolves the declared `outputs`.
// A meter that cannot be read right now is an output (`completed: false`),
// not a failure: the scene author gates the next actions on it.
//
// No scene event is fired from here (`fireEvents: false`): a scene started by
// `meter_read` that asks for a read would otherwise loop through us.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { SmtError } from './smt/client.js';
import { esiidFromExternalId } from './devices/meter.js';

const logger = createLogger({ name: 'scenes' });

// The manifest grants 120 s; the read itself may take up to 5 minutes, and
// keeps going in the background when the action gives up waiting.
export const SCENE_READ_WAIT_MS = 100_000;

export function esiidOrThrow(gladys, externalId) {
  const esiid = esiidFromExternalId(gladys, externalId);
  if (!esiid) {
    throw new SmtError(`Not a Smart Meter Texas meter: ${externalId}`, 'unknown_meter');
  }
  return esiid;
}

function waitAtMost(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: 'waiting' }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const SCENE_ACTIONS = {
  async request_meter_read(gladys, { fields, service, waitMs = SCENE_READ_WAIT_MS }) {
    logger.info(`Scene action request_meter_read <- ${fields.device}`);
    const esiid = esiidOrThrow(gladys, fields.device);
    const read = service.readMeter(esiid, { fireEvents: false });
    // The read goes on in the background after a timeout: never leave its
    // failure unhandled.
    read.catch(() => {});
    const result = await waitAtMost(read, waitMs);
    if (result.status === 'done') {
      return { completed: true, reading: result.reading, read_at: result.readAt };
    }
    const last = service.readings.get(esiid);
    return {
      completed: false,
      reading: last?.reading ?? 0,
      read_at: last?.readAt ?? '',
    };
  },

  async refresh_daily_usage(gladys, { fields, service }) {
    logger.info(`Scene action refresh_daily_usage <- ${fields.device}`);
    const esiid = esiidOrThrow(gladys, fields.device);
    const daysAgo = Math.min(30, Math.max(1, Math.round(Number(fields.days_ago ?? 1)) || 1));
    try {
      const summary = await service.refreshDailyUsage(esiid, { daysAgo, fireEvents: false });
      return {
        available: true,
        consumption: summary.consumption,
        surplus: summary.surplus,
        date: summary.date,
      };
    } catch (err) {
      if (err.code !== 'no_data') {
        throw err;
      }
      return { available: false, consumption: 0, surplus: 0, date: '' };
    }
  },
};
