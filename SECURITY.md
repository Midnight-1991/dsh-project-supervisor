# Security Policy

This is a **Beta / under-test** project. Please do not use it in security-critical
environments without your own review.

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories
("Security" tab → "Report a vulnerability"). Do not open a public issue for
vulnerabilities.

We aim to acknowledge reports within 7 days. This project is maintained by
volunteers, so timelines may vary.

## Scope notes

- The plugin host half exposes exactly one same-origin config endpoint, validates
  writes under `os.homedir()`, caps request bodies at 8 KB, and never throws into
  the DSH process on handler errors.
- The client half writes only local UI state and the same config endpoint; it does
  not send data to third parties.
- The supervisor kit installers write only inside the target workspace/profile
  directories (dry-run available).
