// -----------------------------------------------------------------------------
// Entry point of the Smart Meter Texas integration for Gladys Assistant.
//
// SDK wiring only: the handlers are registered before connect(), and every
// call to Smart Meter Texas goes through the meter service (src/meters.js).
//
// Environment variables provided by the Gladys supervisor to the container
// (read by the SDK): GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './src/config.js';
import { MeterService, errorMessage } from './src/meters.js';
import { buildMeterDevice } from './src/devices/meter.js';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';
import { t } from './src/i18n.js';

const gladys = new GladysIntegration();
const service = new MeterService(gladys, { onUpdate: () => refreshWidgets(gladys) });

let config = normalizeConfig();
service.configure(config);

// --- Discovery: the meters of the account ------------------------------------
async function publishMeters() {
  if (!isConfigured(config)) {
    await gladys.publishDiscoveredDevices([]);
    return;
  }
  const meters = await service.loadMeters();
  logger.info(`${meters.length} meter(s) on the Smart Meter Texas account`);
  await gladys.publishDiscoveredDevices(meters.map((meter) => buildMeterDevice(gladys, meter)));
}

gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> listing the meters of the account');
  try {
    await publishMeters();
  } finally {
    await service.reportStatus().catch(() => {});
  }
});

// The meters only expose read-only features.
gladys.onSetValue(async (device) => {
  throw new Error(`${device.external_id} has no controllable feature`);
});

// --- Manifest actions (Configuration screen) ---------------------------------
for (const [key, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(key, (fields) => handler(gladys, { fields, service, config }));
}

// --- Scene actions -------------------------------------------------------------
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(gladys, { fields, service, config }));
}

// --- Dashboard widgets ---------------------------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, service, config }));
  gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
    widget.action(gladys, { actionKey, params, settings, service, config }),
  );
}

// --- Configuration --------------------------------------------------------------
async function initialize() {
  service.configure(config);
  if (!isConfigured(config)) {
    service.stop();
    await gladys.setConnectionStatus(false, t('not_configured'));
    return;
  }
  try {
    await publishMeters();
  } catch (err) {
    logger.warn(`Could not list the meters: ${err.message}`);
  }
  await service.reportStatus();
  service.start();
  refreshWidgets(gladys);
}

gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await initialize();
});

gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await initialize();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys.setConnectionStatus(false, errorMessage(err)).catch(() => {});
  }
});

gladys.on('disconnected', () => {
  service.stop();
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

logger.info('Starting the Smart Meter Texas integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
