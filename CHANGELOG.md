# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([b179008](https://github.com/William-De71/gladys-openmediavault/commit/b1790089d7e59926403d147664dc176b974ab814))

## [0.1.0] - 2026-10-18

### Added

- An OpenMediaVault NAS device: CPU and memory usage, uptime, packages to upgrade and version.
- A device per disk (temperature, standby, S.M.A.R.T. health), recognized by its serial number, per mounted file system (space used, free space) and per enabled service (running or not).
- Disks in standby are never woken up by default: the S.M.A.R.T. health is read every hour, only while every disk spins (or always, or never).
- Scene triggers: NAS unreachable or back, NAS restarted, updates available, reboot required, disk health changed, file system above or below its warning threshold, file system missing or mounted again, service started or stopped.
- Scene actions: read the status, run an rsync job and wait for its end, check for updates, reboot, shut down (with a delay).
- Dashboard widgets: overview (with "check for updates", "reboot" and "shut down" buttons), storage (every file system, or one with the history of its usage), disks.
- Local transport only: one session of the web interface with an administrator account, kept alive, and the "known browser" cookie kept between restarts.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.1]: https://github.com/William-De71/gladys-openmediavault/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-openmediavault/releases/tag/v0.1.0
