# Smart Meter Texas for Gladys Assistant

External integration bringing [Smart Meter Texas](https://www.smartmetertexas.com)
electricity data into [Gladys Assistant](https://gladysassistant.com): meter
reads and daily usage of the smart meters of the Texas ERCOT market (Oncor,
CenterPoint, AEP Texas, TNMP). Built from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js)
with [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

|           |                                                         |
| --------- | ------------------------------------------------------- |
| Transport | **cloud** (smartmetertexas.com)                         |
| Countries | **United States** (`US`, Texas)                         |
| Category  | `energy`                                                |
| Languages | English, French, German, Spanish (UI and documentation) |
| Requires  | Gladys 5.3.0 or later                                   |

## Features

**Devices** — one per meter of the account (keyed by its ESI ID):

| Feature                        | Category / type                                 | Source                  |
| ------------------------------ | ----------------------------------------------- | ----------------------- |
| Meter reading (kWh)            | `energy-sensor` / `index`                       | on-demand read          |
| Yesterday's consumption (kWh)  | `energy-sensor` / `daily-consumption`           | 15-minute interval data |
| Yesterday's surplus generation | `energy-production-sensor` / `daily-production` | 15-minute interval data |

**Scene triggers**

| Key                     | When                                     | Variables                                   |
| ----------------------- | ---------------------------------------- | ------------------------------------------- |
| `meter_read`            | a new on-demand read arrived             | `reading`, `consumed_since_last`, `read_at` |
| `daily_usage_available` | the 15-minute data of a past day arrived | `consumption`, `surplus`, `date`            |
| `meter_read_failed`     | a read failed (filter on the reason)     | `error`                                     |

**Scene actions**

| Key                   | Does                                                 | Outputs                                       |
| --------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `request_meter_read`  | on-demand read, waits up to 100 s                    | `completed`, `reading`, `read_at`             |
| `refresh_daily_usage` | downloads the interval data of a day (1-30 days ago) | `available`, `consumption`, `surplus`, `date` |

**Dashboard widget** `meter_overview` — live tiles (reading, yesterday,
surplus), yesterday's hourly chart, last read / address / account status, and a
**Read now** button.

**Configuration screen** — username, password (secret), read interval (60 min
by default, 30 minimum: Smart Meter Texas allows two on-demand reads per meter
and per hour), daily usage toggle, and two buttons: _Test the connection_ and
_Read a meter now_.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## How it works

The integration uses the same private web API as the Smart Meter Texas portal
(and as the Home Assistant integration): login, meter list, on-demand read
(`/api/ondemandread`, then `/api/usage/latestodrread` every 15 s for up to 5
minutes), and 15-minute interval data (`/api/adhoc/intervalsynch`). The meter
service (`src/meters.js`) reads every created meter at the configured interval,
fetches yesterday's data once a day, and shares a read in progress between the
schedule, the actions, the scenes and the widget.

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
```

Run against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="smart-meter-texas" \
LOG_LEVEL=debug \
npm start
```

Validate against the store rules:

```bash
npx github:GladysAssistant/integration-store .
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then run **Actions → Release → Run workflow** (`patch`, `minor` or `major`): it
bumps the version in `package.json` and the manifest, rolls the changelog,
tags, builds the `linux/amd64` + `linux/arm64` image to
`ghcr.io/gboulvin/gladys-smartmetertexas`, and publishes the GitHub Release.

For the integration to show in the Gladys catalog, the repository must be
public, carry the GitHub topic `gladys-assistant-integration`, and its
container package must be public.

## Security

See [`SECURITY.md`](SECURITY.md).

## License

Apache-2.0. Not affiliated with Smart Meter Texas, ERCOT or the Texas
utilities.
