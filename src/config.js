// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes the received object, so the rest of the code never deals with
// `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

// Smart Meter Texas accepts two on-demand reads per meter and per hour: below
// 30 minutes, the second read of the hour is refused.
export const MIN_REFRESH_MINUTES = 30;
export const MAX_REFRESH_MINUTES = 1440;

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  // Minutes between two on-demand meter reads.
  refresh_interval: 60,
  // Fetch yesterday's 15-minute interval data once a day.
  daily_usage: true,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const refresh = Number(raw.refresh_interval ?? DEFAULT_CONFIG.refresh_interval);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    refresh_interval: Number.isFinite(refresh)
      ? Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, Math.round(refresh)))
      : DEFAULT_CONFIG.refresh_interval,
    daily_usage: raw.daily_usage !== false && raw.daily_usage !== 'false',
  };
}

/** True when the account credentials are filled in. */
export function isConfigured(config) {
  return config.username !== '' && config.password !== '';
}
