// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen. Each handler
// resolves the multi-language message shown under the button; a thrown error
// is shown too.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { t } from './i18n.js';
import { errorMessage } from './meters.js';
import { esiidOrThrow } from './scenes.js';

const logger = createLogger({ name: 'actions' });

// The manifest grants 120 s to `read_meter`.
export const ACTION_READ_WAIT_MS = 110_000;

export const ACTIONS = {
  async test_connection(gladys, { service, config }) {
    logger.info('Action test_connection');
    if (!isConfigured(config)) {
      return t('not_configured');
    }
    try {
      const meters = await service.loadMeters();
      await service.reportStatus();
      return t('connection_ok', { count: meters.length });
    } catch (err) {
      logger.warn(`Connection test failed: ${err.message}`);
      await service.reportStatus().catch(() => {});
      return errorMessage(err);
    }
  },

  async read_meter(gladys, { fields, service, config, waitMs = ACTION_READ_WAIT_MS }) {
    logger.info(`Action read_meter <- ${fields.device}`);
    if (!isConfigured(config)) {
      return t('not_configured');
    }
    let timer;
    try {
      const esiid = esiidOrThrow(gladys, fields.device);
      const read = service.readMeter(esiid);
      read.catch(() => {});
      const result = await Promise.race([
        read,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ status: 'waiting' }), waitMs);
        }),
      ]);
      if (result.status === 'done') {
        return t('read_done', { reading: result.reading });
      }
      if (result.status === 'too_soon') {
        return t('read_too_soon', { minutes: result.minutes });
      }
      return t('read_requested');
    } catch (err) {
      return errorMessage(err);
    } finally {
      clearTimeout(timer);
    }
  },
};
