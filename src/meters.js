// -----------------------------------------------------------------------------
// Meter service: the one place that talks to Smart Meter Texas for the meters.
//
//   - keeps the account's meter list and the latest values of each meter;
//   - runs the schedule: an on-demand read of every created meter at the
//     configured interval, and yesterday's 15-minute data once a day;
//   - publishes the states, the cloud transport badge, and fires the scene
//     triggers (`meter_read`, `daily_usage_available`, `meter_read_failed`).
//
// The manifest actions, the scene actions and the widget all go through it,
// so two surfaces asking for the same meter share one read instead of
// spending the two reads per hour Smart Meter Texas allows.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { t } from './i18n.js';
import { SmartMeterTexasClient, SmtError } from './smt/client.js';
import { summarizeDay } from './smt/intervals.js';
import { parseSmtDateTime, smtDate, smtDateToIsoDate } from './smt/time.js';
import { FEATURE, esiidFromExternalId, meterIds } from './devices/meter.js';

const logger = createLogger({ name: 'meters' });

export const TRIGGERS = {
  METER_READ: 'meter_read',
  DAILY_USAGE_AVAILABLE: 'daily_usage_available',
  METER_READ_FAILED: 'meter_read_failed',
};

// Two on-demand reads per meter and per hour: one every 30 minutes at most.
export const READ_COOLDOWN_MS = 30 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 15_000;

/** Multi-language message of an error, for the user. */
export function errorMessage(err) {
  switch (err?.code) {
    case 'auth':
      return t('auth_failed');
    case 'rate_limit':
      return t('rate_limited');
    case 'timeout':
      return t('read_timeout');
    case 'no_data':
      return t('daily_unavailable');
    case 'unknown_meter':
      return t('unknown_meter');
    default:
      return t('service_error');
  }
}

const round3 = (n) => Math.round(n * 1000) / 1000;

export class MeterService {
  /**
   * @param {*} gladys
   * @param {{ createClient?: (config) => SmartMeterTexasClient, now?: () => number,
   *   setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} [deps]
   */
  constructor(gladys, deps = {}) {
    this.gladys = gladys;
    this.createClient = deps.createClient ?? ((config) => new SmartMeterTexasClient(config));
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? setTimeout;
    this.clearTimer = deps.clearTimer ?? clearTimeout;
    // Called when a value changed: index.js nudges the dashboard widgets.
    this.onUpdate = deps.onUpdate ?? (() => {});
    this.config = null;
    this.client = null;
    this.meters = [];
    this.readings = new Map();
    this.daily = new Map();
    this.inflight = new Map();
    this.lastError = null;
    this.timer = null;
  }

  /** Apply a (new) configuration: a credential change drops the session. */
  configure(config) {
    const credentialsChanged =
      !this.config ||
      this.config.username !== config.username ||
      this.config.password !== config.password;
    this.config = config;
    if (credentialsChanged) {
      this.client = isConfigured(config) ? this.createClient(config) : null;
      this.meters = [];
      this.lastError = null;
    }
  }

  requireClient() {
    if (!this.client) {
      throw new SmtError('The Smart Meter Texas credentials are not configured', 'auth');
    }
    return this.client;
  }

  /** Fetch the meters of the account. */
  async loadMeters() {
    try {
      this.meters = await this.requireClient().fetchMeters();
      this.lastError = null;
      return this.meters;
    } catch (err) {
      this.lastError = err;
      throw err;
    }
  }

  async findMeter(esiid) {
    if (!this.meters.some((meter) => meter.esiid === esiid)) {
      await this.loadMeters();
    }
    const meter = this.meters.find((candidate) => candidate.esiid === esiid);
    if (!meter) {
      throw new SmtError(`Unknown ESI ID ${esiid}`, 'unknown_meter');
    }
    return meter;
  }

  /** ESI IDs of the meters the user created in Gladys. */
  async createdMeterIds() {
    const devices = await this.gladys.getDevices();
    return devices
      .map((device) => esiidFromExternalId(this.gladys, device.external_id))
      .filter(Boolean);
  }

  /** Minutes since the last read, when it is under the cooldown. */
  cooldownMinutes(esiid) {
    const last = this.readings.get(esiid)?.requestedAt;
    if (last === undefined || this.now() - last >= READ_COOLDOWN_MS) {
      return null;
    }
    return Math.max(1, Math.round((this.now() - last) / 60_000));
  }

  /**
   * Start an on-demand read, or join the one in progress.
   * Resolves `{ status: 'done', reading }` or `{ status: 'too_soon', minutes }`.
   * @param {string} esiid
   * @param {{ fireEvents?: boolean }} [options] `false` from a scene action:
   *   an event fired by an action would let a scene loop through us.
   */
  readMeter(esiid, { fireEvents = true } = {}) {
    const running = this.inflight.get(esiid);
    if (running) {
      return running;
    }
    const minutes = this.cooldownMinutes(esiid);
    if (minutes !== null) {
      return Promise.resolve({ status: 'too_soon', minutes });
    }
    const promise = this.doReadMeter(esiid, fireEvents).finally(() => {
      this.inflight.delete(esiid);
    });
    this.inflight.set(esiid, promise);
    return promise;
  }

  async doReadMeter(esiid, fireEvents) {
    const ids = meterIds(this.gladys, esiid);
    const previous = this.readings.get(esiid);
    try {
      const meter = await this.findMeter(esiid);
      this.readings.set(esiid, { ...previous, requestedAt: this.now() });
      logger.info(`On-demand read of meter ${meter.meterNumber}`);
      const result = await this.requireClient().readMeter(meter);
      const readAt = parseSmtDateTime(result.date) ?? new Date(this.now());
      const reading = {
        reading: result.reading,
        readAt: readAt.toISOString(),
        requestedAt: this.now(),
      };
      this.readings.set(esiid, reading);
      this.lastError = null;
      await this.gladys.publishStates([
        { device_feature_external_id: ids.feature(FEATURE.INDEX), state: result.reading },
      ]);
      await this.publishTransport(esiid, DEVICE_TRANSPORTS.CLOUD);
      this.onUpdate();
      if (fireEvents) {
        const consumed =
          previous?.reading !== undefined
            ? round3(Math.max(0, result.reading - previous.reading))
            : 0;
        await this.gladys.publishSceneEvent(TRIGGERS.METER_READ, {
          device: ids.device,
          reading: result.reading,
          consumed_since_last: consumed,
          read_at: reading.readAt,
        });
      }
      return { status: 'done', reading: result.reading, readAt: reading.readAt };
    } catch (err) {
      this.lastError = err;
      logger.warn(`Read of ${esiid} failed: ${err.message}`);
      await this.publishTransport(esiid, DEVICE_TRANSPORTS.UNREACHABLE).catch(() => {});
      if (fireEvents) {
        await this.gladys
          .publishSceneEvent(TRIGGERS.METER_READ_FAILED, {
            device: ids.device,
            error: err.code ?? 'api',
          })
          .catch((eventErr) => logger.warn(`Scene event failed: ${eventErr.message}`));
      }
      throw err;
    }
  }

  /**
   * Fetch the interval data of `daysAgo` days ago (or the day before, when
   * Smart Meter Texas has nothing yet) and publish its totals.
   * @returns {Promise<{ date: string, consumption: number, surplus: number }>}
   */
  async refreshDailyUsage(esiid, { daysAgo = 1, fireEvents = true } = {}) {
    const ids = meterIds(this.gladys, esiid);
    const client = this.requireClient();
    await this.findMeter(esiid);
    let lastError = null;
    for (const days of [daysAgo, daysAgo + 1]) {
      const date = smtDate(days, new Date(this.now()));
      try {
        const summary = {
          date: smtDateToIsoDate(date),
          ...summarizeDay(await client.fetchIntervals(esiid, date)),
        };
        this.daily.set(esiid, summary);
        this.onUpdate();
        await this.gladys.publishStates([
          {
            device_feature_external_id: ids.feature(FEATURE.DAILY_CONSUMPTION),
            state: summary.consumption,
          },
          {
            device_feature_external_id: ids.feature(FEATURE.DAILY_SURPLUS),
            state: summary.surplus,
          },
        ]);
        if (fireEvents) {
          await this.gladys.publishSceneEvent(TRIGGERS.DAILY_USAGE_AVAILABLE, {
            device: ids.device,
            consumption: summary.consumption,
            surplus: summary.surplus,
            date: summary.date,
          });
        }
        return summary;
      } catch (err) {
        if (err.code !== 'no_data') {
          throw err;
        }
        lastError = err;
      }
    }
    throw lastError;
  }

  async publishTransport(esiid, transport) {
    await this.gladys.publishTransports([
      { external_id: meterIds(this.gladys, esiid).device, transport },
    ]);
  }

  /** One round of the schedule, over the meters created in Gladys. */
  async tick() {
    if (!this.client) {
      return;
    }
    const esiids = await this.createdMeterIds();
    const yesterday = smtDateToIsoDate(smtDate(1, new Date(this.now())));
    for (const esiid of esiids) {
      try {
        await this.readMeter(esiid);
      } catch (err) {
        logger.warn(`Scheduled read of ${esiid} failed: ${err.message}`);
      }
      // Once yesterday's data is in, nothing to fetch until tomorrow.
      if (this.config.daily_usage && this.daily.get(esiid)?.date !== yesterday) {
        try {
          await this.refreshDailyUsage(esiid);
        } catch (err) {
          logger.info(`Daily usage of ${esiid} not available yet: ${err.message}`);
        }
      }
    }
    await this.reportStatus();
  }

  /** Connection status of the Configuration screen. */
  async reportStatus() {
    if (!this.client) {
      await this.gladys.setConnectionStatus(false, t('not_configured'));
    } else if (this.lastError && ['auth', 'rate_limit', 'api'].includes(this.lastError.code)) {
      await this.gladys.setConnectionStatus(false, errorMessage(this.lastError));
    } else {
      await this.gladys.setConnectionStatus(true);
    }
  }

  /** (Re)start the schedule: a first round shortly, then every interval. */
  start() {
    this.stop();
    const loop = async () => {
      try {
        await this.tick();
      } catch (err) {
        logger.error('Scheduled refresh failed', err);
      }
      if (this.timer !== null) {
        this.timer = this.setTimer(loop, this.config.refresh_interval * 60_000);
      }
    };
    this.timer = this.setTimer(loop, FIRST_TICK_DELAY_MS);
  }

  stop() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
