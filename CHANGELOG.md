# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Smart Meter Texas account: username and password, connection test from the
  Configuration screen.
- One device per meter of the account, keyed by its ESI ID: meter reading
  (on-demand read), yesterday's consumption and yesterday's surplus generation,
  from the 15-minute interval data.
- Scheduled on-demand reads (every 60 minutes by default, 30 minimum, the
  two-reads-per-hour limit of Smart Meter Texas) and a daily download of the
  previous day's interval data.
- Scene triggers: new meter reading, daily usage available, meter read failed.
- Scene actions: read a meter, get the usage of a past day.
- Dashboard widget: meter reading, yesterday's usage, hourly profile chart and
  a Read now button.
- Cloud transport badge per meter, catalog category `energy`, available in the
  United States.
- English, French, German and Spanish texts and user documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-SmartMeterTexas/commits/main
