# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.
Report them privately through GitHub: **Security → Report a vulnerability** on this repository
(GitHub private vulnerability reporting). If that is unavailable, contact support@djs321.com.

Please include steps to reproduce, the affected version and browser, and the impact you observed.
You should receive an acknowledgement within 7 days.

## Scope

Of particular interest:

- The local bridge to the DJS 321 desktop app: pairing, signature checks, replay protection, revocation
  (see `docs/bridge-protocol.md` once published)
- Anything that could send tab data somewhere the user did not choose
- Script injection into pages and handling of untrusted page content during text capture
- Import of backup files

## Supported versions

Security fixes are made for the latest published version.
