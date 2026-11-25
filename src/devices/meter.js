// -----------------------------------------------------------------------------
// Device type: SMART METER (one per ESI ID of the account).
//
// Read-only energy features, refreshed by the meter service (src/meters.js),
// not by Gladys' poll: an on-demand read takes up to five minutes and is
// limited to two per hour, so the service runs its own schedule.
//
// The device external id is built from the ESI ID, the identifier the Texas
// market gives the electric service point: it never changes, even when the
// physical meter is replaced.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'meter';

// Feature keys: part of the external ids, never renamed.
export const FEATURE = {
  INDEX: 'index',
  DAILY_CONSUMPTION: 'daily-consumption',
  DAILY_SURPLUS: 'daily-surplus',
};

const NAME_MAX_LENGTH = 60;

export function meterIds(gladys, esiid) {
  return gladys.externalIds(DEVICE_TYPE, esiid);
}

export function meterExternalId(gladys, esiid) {
  return meterIds(gladys, esiid).device;
}

/** ESI ID of one of our device external ids, or null. */
export function esiidFromExternalId(gladys, externalId) {
  const prefix = meterExternalId(gladys, '');
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const esiid = externalId.slice(prefix.length);
  return esiid === '' || esiid.includes(':') ? null : esiid;
}

function deviceName({ esiid, address }) {
  const label = address ? `Smart Meter ${address}` : `Smart Meter ${esiid}`;
  return label.length > NAME_MAX_LENGTH ? `${label.slice(0, NAME_MAX_LENGTH - 1)}…` : label;
}

/**
 * Discovery payload of a meter.
 * @param {*} gladys
 * @param {{ esiid: string, meterNumber: string, address: string }} meter
 */
export function buildMeterDevice(gladys, meter) {
  const ids = meterIds(gladys, meter.esiid);
  return {
    name: deviceName(meter),
    external_id: ids.device,
    // Refreshed on the integration's own schedule (see src/meters.js).
    should_poll: false,
    params: [
      { name: 'ESIID', value: meter.esiid },
      { name: 'METER_NUMBER', value: meter.meterNumber },
    ],
    features: [
      {
        name: 'Meter reading',
        external_id: ids.feature(FEATURE.INDEX),
        category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
        type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.INDEX,
        unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
        min: 0,
        max: 100_000_000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: "Yesterday's consumption",
        external_id: ids.feature(FEATURE.DAILY_CONSUMPTION),
        category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
        type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.DAILY_CONSUMPTION,
        unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
        min: 0,
        max: 10_000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: "Yesterday's surplus generation",
        external_id: ids.feature(FEATURE.DAILY_SURPLUS),
        category: DEVICE_FEATURE_CATEGORIES.ENERGY_PRODUCTION_SENSOR,
        type: DEVICE_FEATURE_TYPES.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
        unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
        min: 0,
        max: 10_000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ],
  };
}
