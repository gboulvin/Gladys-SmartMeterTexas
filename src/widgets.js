// -----------------------------------------------------------------------------
// Dashboard widget `meter_overview` (manifest `widgets`, Gladys 5.1+).
//
// Live tiles bound to the meter features (they follow the published states),
// yesterday's hourly profile as an inline chart (data Gladys has no history
// of), a status list (last read, address, account) and a "Read now" button.
// The content is declarative: the core renders it with its own theme.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { FEATURE, esiidFromExternalId, meterIds } from './devices/meter.js';
import { formatChicago } from './smt/time.js';

const logger = createLogger({ name: 'widgets' });

export const METER_OVERVIEW_WIDGET = 'meter_overview';
export const WIDGET_ACTIONS = { READ_NOW: 'read_now' };

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** ESI ID shown by a widget instance: its setting, else the first meter. */
async function widgetEsiid(gladys, settings, service) {
  const chosen = esiidFromExternalId(gladys, settings?.device);
  if (chosen) {
    return chosen;
  }
  const created = await service.createdMeterIds().catch(() => []);
  return created[0] ?? null;
}

function accountStatus(service) {
  if (!service.client) {
    return {
      value: {
        en: 'Not configured',
        fr: 'Non configuré',
        de: 'Nicht konfiguriert',
        es: 'Sin configurar',
      },
      color: WIDGET_COLORS.WARNING,
    };
  }
  if (service.lastError && ['auth', 'rate_limit', 'api'].includes(service.lastError.code)) {
    const code = service.lastError.code;
    return {
      value:
        code === 'auth'
          ? {
              en: 'Login refused',
              fr: 'Connexion refusée',
              de: 'Anmeldung abgelehnt',
              es: 'Acceso rechazado',
            }
          : code === 'rate_limit'
            ? { en: 'Rate limited', fr: 'Limité', de: 'Begrenzt', es: 'Limitado' }
            : { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
      color: WIDGET_COLORS.DANGER,
    };
  }
  return {
    value: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
    color: WIDGET_COLORS.SUCCESS,
  };
}

function dailyChart(daily) {
  if (!daily || daily.hourlyConsumption.length === 0) {
    return null;
  }
  const series = [
    {
      name: { en: 'Consumption', fr: 'Consommation', de: 'Verbrauch', es: 'Consumo' },
      points: daily.hourlyConsumption.slice(0, 300),
    },
  ];
  if (daily.surplus > 0 && daily.hourlySurplus.length > 0) {
    series.push({
      name: { en: 'Surplus', fr: 'Surplus', de: 'Überschuss', es: 'Excedente' },
      points: daily.hourlySurplus.slice(0, 300),
    });
  }
  return {
    type: 'chart',
    chart_type: 'bar',
    title: {
      en: `Hourly usage, ${daily.date}`,
      fr: `Consommation horaire, ${daily.date}`,
      de: `Stündlicher Verbrauch, ${daily.date}`,
      es: `Consumo por hora, ${daily.date}`,
    },
    unit: 'kWh',
    series,
  };
}

export const WIDGETS = {
  [METER_OVERVIEW_WIDGET]: {
    async get(gladys, { settings, service }) {
      logger.debug(`onWidgetGet <- ${METER_OVERVIEW_WIDGET}`);
      const esiid = await widgetEsiid(gladys, settings, service);
      if (!esiid) {
        return {
          ttl_seconds: 300,
          components: [
            {
              type: 'text',
              variant: 'body',
              text: t(service.client ? 'no_meter' : 'not_configured'),
            },
          ],
        };
      }
      const ids = meterIds(gladys, esiid);
      const meter = service.meters.find((candidate) => candidate.esiid === esiid);
      const reading = service.readings.get(esiid);
      const daily = service.daily.get(esiid);
      const components = [
        {
          type: 'value',
          label: { en: 'Meter reading', fr: 'Index', de: 'Zählerstand', es: 'Lectura' },
          icon: 'activity',
          device_feature: ids.feature(FEATURE.INDEX),
        },
        {
          type: 'value',
          label: { en: 'Yesterday', fr: 'Hier', de: 'Gestern', es: 'Ayer' },
          icon: 'zap',
          device_feature: ids.feature(FEATURE.DAILY_CONSUMPTION),
        },
        {
          type: 'value',
          label: {
            en: 'Surplus yesterday',
            fr: 'Surplus hier',
            de: 'Überschuss gestern',
            es: 'Excedente ayer',
          },
          icon: 'sun',
          device_feature: ids.feature(FEATURE.DAILY_SURPLUS),
        },
      ];
      const chart = dailyChart(daily);
      if (chart) {
        components.push(chart);
      }
      const items = [
        {
          label: {
            en: 'Last read',
            fr: 'Dernier relevé',
            de: 'Letzte Ablesung',
            es: 'Última lectura',
          },
          icon: 'clock',
          value: reading?.readAt
            ? formatChicago(new Date(reading.readAt))
            : { en: 'Not yet', fr: 'Pas encore', de: 'Noch nicht', es: 'Aún no' },
          color: reading?.readAt ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.WARNING,
        },
        {
          label: { en: 'Account', fr: 'Compte', de: 'Konto', es: 'Cuenta' },
          icon: 'user',
          ...accountStatus(service),
        },
      ];
      if (meter?.address) {
        items.splice(1, 0, {
          label: { en: 'Address', fr: 'Adresse', de: 'Adresse', es: 'Dirección' },
          icon: 'map-pin',
          value: truncate(meter.address, 40),
          color: WIDGET_COLORS.NEUTRAL,
        });
      }
      components.push({ type: 'status', items });
      components.push({
        type: 'button',
        label: { en: 'Read now', fr: 'Relever', de: 'Jetzt ablesen', es: 'Leer ahora' },
        icon: 'refresh-cw',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.READ_NOW, params: { device: ids.device } },
      });
      // Every published state moves the live tiles by itself; the computed
      // parts change after a read, which nudges the widget (see index.js).
      return { ttl_seconds: 300, components };
    },

    async action(gladys, { actionKey, params, service }) {
      logger.info(`onWidgetAction <- ${METER_OVERVIEW_WIDGET}.${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.READ_NOW) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const esiid = esiidFromExternalId(gladys, params?.device);
      if (!esiid) {
        return t('unknown_meter');
      }
      if (!service.client) {
        return t('not_configured');
      }
      const minutes = service.cooldownMinutes(esiid);
      if (minutes !== null && !service.inflight.has(esiid)) {
        return t('read_too_soon', { minutes });
      }
      // A read takes minutes, the widget action 15 s: answer at once, the
      // tiles move when the value is published.
      // The service nudges the widget once the value is in.
      service.readMeter(esiid).catch((err) => logger.warn(`Widget read failed: ${err.message}`));
      return t('read_requested');
    },
  },
};

/** Ask the core to re-pull every widget now instead of waiting for the TTL. */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
