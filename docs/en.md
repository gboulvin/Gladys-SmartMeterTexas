# Smart Meter Texas

## Overview

This integration connects Gladys to [Smart Meter Texas](https://www.smartmetertexas.com),
the portal where the Texas utilities (Oncor, CenterPoint, AEP Texas, TNMP) publish the data
of the electricity smart meters of the ERCOT market. It is a **cloud** integration, available
in the **United States** (Texas) only.

For each meter of your account, Gladys gets a device with three read-only features:

- **Meter reading** (kWh): the meter index, from an on-demand read;
- **Yesterday's consumption** (kWh): the energy you used the day before, from the 15-minute data;
- **Yesterday's surplus generation** (kWh): the energy your solar panels sent to the grid.

It also adds:

- **Scene triggers**: _New meter reading_ (with the energy used since the previous read),
  _Daily usage available_, and _Meter read failed_;
- **Scene actions**: _Read a meter_ and _Get the usage of a past day_, whose results can be
  used by the following actions of the scene;
- **A dashboard widget**: meter reading, yesterday's usage, hourly profile chart, and a
  **Read now** button.

## Prerequisites

- Gladys Assistant 5.3.0 or later.
- A Smart Meter Texas account (free, created on smartmetertexas.com with your ESI ID and meter
  number, printed on your electricity bill). The credentials of your retail electric provider
  do **not** work here.

## Configuration

1. Open **Integrations → Smart Meter Texas → Configuration**.
2. Enter the **username** and **password** of your Smart Meter Texas account.
3. Optionally change the **meter read interval** (60 minutes by default, 30 minimum) and the
   **daily usage** option.
4. Click **Test the connection**: the number of meters found on the account is shown.
5. Open the **Discover** tab and add your meter(s).

An on-demand read takes from a few seconds to five minutes, and Smart Meter Texas allows
**two reads per meter and per hour**: a second read within 30 minutes is refused by the
integration. The 15-minute data of a day is usually published by your utility the next day,
sometimes two days later.

## Troubleshooting

- **"Smart Meter Texas refused the username or the password"**: sign in on
  smartmetertexas.com with the same credentials; the portal locks the account after several
  failures.
- **"Smart Meter Texas is limiting requests"**: too many logins or reads; wait an hour.
- **No reading after 5 minutes**: the meter did not answer the utility; the next scheduled
  read will try again. The _Meter read failed_ trigger lets you get notified.
- **Yesterday's consumption stays empty**: your utility has not published the data yet; the
  integration retries at every read interval.
- Your password is stored by Gladys as a secret and never written to the logs.
