# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for
[Smart Meter Texas](https://www.smartmetertexas.com): a Node.js service (Node
22+, ESM, no build step) running in its own sandboxed Docker container, talking
to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template
(`GladysAssistant/integration-template-js`).

Smart Meter Texas is a **cloud** service for the electricity meters of the
Texas ERCOT market (manifest `transports: ["cloud"]`, `countries: ["US"]`). It
exposes read-only data: there is nothing to control, every feature is
`read_only`.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/meters.test.js           # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only: handlers registered before connect()
src/smt/client.js                 Smart Meter Texas HTTP client (login, meters, on-demand read, intervals)
src/smt/intervals.js              15-minute interval parsing, daily totals and hourly profile
src/smt/time.js                   America/Chicago date helpers (SMT dates are Texas local time)
src/meters.js                     MeterService: schedule, cooldown, states, transports, scene triggers
src/devices/meter.js              the meter device (external ids from the ESI ID, features)
src/actions.js                    manifest `actions` (Configuration screen buttons)
src/scenes.js                     manifest `scene_actions`
src/widgets.js                    manifest `widgets` (meter_overview)
src/i18n.js                       runtime messages in en / fr / de / es
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (en + fr mandatory)
test/                             node --test, SDK fake Gladys + fake SMT client / fetch
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **Smart Meter Texas limits.** Two on-demand reads per meter and per hour:
  `READ_COOLDOWN_MS` (30 min) guards every surface, and `refresh_interval` is
  30 minutes minimum. A read takes up to 5 minutes: never block an ack on it
  beyond its timeout (`actions` / `scene_actions` ≤ 120 s, widget action 15 s);
  start it, answer, and let the service publish when it is done. All reads go
  through `MeterService.readMeter`, which shares a read in progress.
- **No scene event from a scene action** (`fireEvents: false`): a scene
  triggered by `meter_read` that asks for a read would loop.
- **External ids are forever.** Devices are keyed by
  `gladys.externalIds('meter', esiid)`, features by the `FEATURE` keys of
  `src/devices/meter.js`. The same goes for every key users store: manifest
  `config_schema`, `actions`, widget, scene trigger / action and output keys.
- **Every feature carries `name`, `min`, `max`, `read_only` and
  `has_feedback`**: Gladys stores them NOT NULL (`test/meters.test.js` checks).
- **Secrets.** The password is a `secret` field. Never log the password, the
  token, nor full request bodies. The container rootfs is read-only: write only
  under `/data` (the integration currently writes nothing).
- **Four languages.** Every user-facing text is `{ en, fr, de, es }`: manifest
  texts, `src/i18n.js` messages, widget labels, and `docs/{en,fr,de,es}.md`,
  kept in sync. `test/manifest.test.js` fails on a missing translation.
- **Manifest.** `countries` and `keywords` require `gladys_version >=5.3.0`;
  widgets and scenes 5.1.0; `categories` 4.86.0. Store limits: catalog
  `description` 10-100 characters, widget label 3-30, widget description ≤ 100.
  `test/manifest.test.js` ties the manifest to the handlers: change both sides
  together.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md`. Never write a version heading.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
