# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove passwords, tokens, ESI IDs and addresses
  first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Sensitive data handled

- The Smart Meter Texas **password** is declared as a `secret` field: Gladys
  stores it and never sends it back to the browser. The integration sends it
  only to `https://www.smartmetertexas.com` over TLS, and never logs it.
- The session **token** returned by Smart Meter Texas lives in memory only and
  is never logged nor written to disk.
- The meter **ESI IDs and service addresses** are personal data: they appear in
  the device external ids and names inside Gladys, and should be removed from
  any log you share.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the Smart Meter Texas service and the meters it reads. Report a problem of
smartmetertexas.com to its operators.
