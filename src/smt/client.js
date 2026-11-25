// -----------------------------------------------------------------------------
// Smart Meter Texas client (https://www.smartmetertexas.com).
//
// The same private web API the Smart Meter Texas portal uses, and the one the
// Home Assistant integration relies on (python `smart-meter-texas` library):
//
//   POST /commonapi/user/authenticate  {username, password}     -> { token }
//   POST /api/meter                    {esiid: "*"}             -> the meters
//   POST /api/ondemandread             {ESIID, MeterNumber}     -> start a read
//   POST /api/usage/latestodrread      {ESIID}                  -> its status
//   POST /api/adhoc/intervalsynch      {startDate, endDate...}  -> 15-min data
//
// The token lives 15 minutes after its last use; a 401 logs in again once.
// Never log the password nor the token.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'smt-client' });

export const BASE_URL = 'https://www.smartmetertexas.com';
const AUTH_PATH = '/commonapi/user/authenticate';
const METER_PATH = '/api/meter';
const OD_READ_PATH = '/api/ondemandread';
const LATEST_OD_READ_PATH = '/api/usage/latestodrread';
const INTERVAL_PATH = '/api/adhoc/intervalsynch';

const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
export const OD_READ_POLL_MS = 15_000;
export const OD_READ_TIMEOUT_MS = 5 * 60 * 1000;
const NO_DATA_MESSAGE = 'No Energy Data received from the respective TDSP';

// The portal sits behind a bot protection that refuses unknown clients.
const CLIENT_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'content-type': 'application/json',
  origin: BASE_URL,
  pragma: 'no-cache',
  referer: `${BASE_URL}/home`,
};

export class SmtError extends Error {
  constructor(message, code = 'api') {
    super(message);
    this.name = 'SmtError';
    /** 'auth' | 'rate_limit' | 'api' | 'timeout' | 'no_data' */
    this.code = code;
  }
}

function randomUserAgent() {
  const build = 1001 + Math.floor(Math.random() * 8998);
  const rev = 12 + Math.floor(Math.random() * 987);
  return (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    `(KHTML, like Gecko) Chrome/131.0.${build}.${rev} Safari/537.36`
  );
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class SmartMeterTexasClient {
  /**
   * @param {{ username: string, password: string }} credentials
   * @param {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number }} [deps]
   */
  constructor({ username, password }, deps = {}) {
    this.username = username;
    this.password = password;
    this.fetch = deps.fetch ?? globalThis.fetch;
    this.sleep = deps.sleep ?? defaultSleep;
    this.now = deps.now ?? Date.now;
    this.userAgent = randomUserAgent();
    this.token = null;
    this.tokenExpiresAt = 0;
    this.loginPromise = null;
  }

  headers() {
    const headers = { ...CLIENT_HEADERS, 'user-agent': this.userAgent };
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async post(path, body) {
    try {
      return await this.fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new SmtError(`Smart Meter Texas unreachable: ${err.message}`, 'api');
    }
  }

  /** Log in, unless the current token is still valid. Concurrent calls share one login. */
  async authenticate() {
    if (this.token && this.now() < this.tokenExpiresAt) {
      return;
    }
    this.loginPromise ??= this.login().finally(() => {
      this.loginPromise = null;
    });
    await this.loginPromise;
  }

  async login() {
    logger.debug('Requesting a login token');
    this.token = null;
    const response = await this.post(AUTH_PATH, {
      username: this.username,
      password: this.password,
      rememberMe: 'true',
    });
    if (response.status === 400 || response.status === 401) {
      throw new SmtError('Username or password was not accepted', 'auth');
    }
    if (response.status === 403 || response.status === 429) {
      throw new SmtError('Rate limit or brute force protection reached', 'rate_limit');
    }
    if (!response.ok) {
      throw new SmtError(`Login failed with HTTP ${response.status}`, 'api');
    }
    const body = await response.json().catch(() => ({}));
    if (typeof body?.token !== 'string' || body.token === '') {
      // `errormessage` carries codes like ERR-USR-INVALIDPASSWORDERROR.
      if (/ERR-USR/.test(String(body?.errormessage ?? ''))) {
        throw new SmtError('Username or password was not accepted', 'auth');
      }
      throw new SmtError('Login answered without a token', 'api');
    }
    this.token = body.token;
    this.tokenExpiresAt = this.now() + TOKEN_LIFETIME_MS;
    logger.debug('Login token received');
  }

  /** Authenticated POST, logging in again once on a 401. */
  async request(path, body) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.authenticate();
      const response = await this.post(path, body);
      if (response.status === 401) {
        logger.debug(`${path} answered 401: the token expired`);
        this.token = null;
        this.tokenExpiresAt = 0;
        continue;
      }
      if (response.status === 403 || response.status === 429) {
        throw new SmtError(`${path} refused: rate limit reached`, 'rate_limit');
      }
      if (!response.ok) {
        throw new SmtError(`${path} failed with HTTP ${response.status}`, 'api');
      }
      this.tokenExpiresAt = this.now() + TOKEN_LIFETIME_MS;
      return response.json();
    }
    throw new SmtError(`${path} kept answering 401 after a new login`, 'auth');
  }

  /**
   * Meters of the account.
   * @returns {Promise<{ esiid: string, meterNumber: string, address: string }[]>}
   */
  async fetchMeters() {
    const body = await this.request(METER_PATH, { esiid: '*' });
    if (!Array.isArray(body?.data)) {
      throw new SmtError('Unexpected meter list', 'api');
    }
    return body.data
      .filter((meter) => meter?.esiid && meter?.meterNumber)
      .map((meter) => ({
        esiid: String(meter.esiid),
        meterNumber: String(meter.meterNumber),
        address: String(meter.address ?? '').trim(),
      }));
  }

  /** Status of the latest on-demand read: { odrstatus, odrread, odrdate, odrusage }. */
  async latestOdRead(esiid) {
    const body = await this.request(LATEST_OD_READ_PATH, { ESIID: esiid });
    const data = body?.data;
    if (!data || typeof data.odrstatus !== 'string') {
      throw new SmtError('Unexpected on-demand read status', 'api');
    }
    return data;
  }

  /**
   * Trigger an on-demand read of the meter and wait for its result.
   * @param {{ esiid: string, meterNumber: string }} meter
   * @param {{ timeoutMs?: number, pollMs?: number }} [options]
   * @returns {Promise<{ reading: number, date: string, usage: number | null }>}
   */
  async readMeter({ esiid, meterNumber }, options = {}) {
    const timeoutMs = options.timeoutMs ?? OD_READ_TIMEOUT_MS;
    const pollMs = options.pollMs ?? OD_READ_POLL_MS;

    // Remember the previous read: Smart Meter Texas keeps answering it for a
    // while after the new one is requested.
    let previousDate = null;
    try {
      previousDate = (await this.latestOdRead(esiid)).odrdate ?? null;
    } catch (err) {
      if (err.code === 'auth' || err.code === 'rate_limit') {
        throw err;
      }
    }

    // The answer carries nothing useful: a refused read (more than two in the
    // hour) simply never replaces the previous one, and ends in a timeout.
    await this.request(OD_READ_PATH, { ESIID: esiid, MeterNumber: meterNumber });

    const deadline = this.now() + timeoutMs;
    while (this.now() + pollMs <= deadline) {
      await this.sleep(pollMs);
      const data = await this.latestOdRead(esiid);
      if (data.odrstatus === 'COMPLETED') {
        const reading = Number(data.odrread);
        if (data.odrdate !== previousDate && Number.isFinite(reading) && reading > 0) {
          const usage = Number(data.odrusage);
          return {
            reading,
            date: String(data.odrdate),
            usage: Number.isFinite(usage) ? usage : null,
          };
        }
      } else if (data.odrstatus !== 'PENDING') {
        throw new SmtError(`Unknown on-demand read status: ${data.odrstatus}`, 'api');
      }
    }
    throw new SmtError(`The meter read did not complete within ${timeoutMs / 1000} s`, 'timeout');
  }

  /**
   * 15-minute interval data of one day.
   * @param {string} esiid
   * @param {string} date `MM/DD/YYYY`
   * @returns {Promise<{ type: string, date: string, reads: string }[]>} one entry per
   *   series: `C` consumption, `G` surplus generation sent to the grid.
   */
  async fetchIntervals(esiid, date) {
    const body = await this.request(INTERVAL_PATH, {
      startDate: date,
      endDate: date,
      reportFormat: 'JSON',
      ESIID: [esiid],
      versionDate: null,
      readDate: null,
      versionNum: null,
      dataType: null,
    });
    const data = body?.data;
    const energy = data?.energyData;
    if (Array.isArray(energy) && energy.length > 0) {
      return energy.map((entry) => ({
        type: String(entry.RT),
        date: String(entry.DT),
        reads: String(entry.RD ?? ''),
      }));
    }
    const errorMessage = String(data?.errorMessage ?? '');
    if (errorMessage.includes(NO_DATA_MESSAGE) || (Array.isArray(energy) && !errorMessage)) {
      throw new SmtError(`No interval data for ${date}`, 'no_data');
    }
    throw new SmtError('Unexpected interval data', 'api');
  }
}
