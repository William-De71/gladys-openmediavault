# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the OpenMediaVault NAS: a
Node.js service (Node 22+, ESM, no build step) that runs in its own sandboxed
Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the RPC API of the OpenMediaVault web
interface (`POST /rpc.php`, `{ service, method, params }`) on the LAN, with a
session of an administrator account, every 60 seconds by default. Transport:
local only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect()
src/omv-api.js          RPC client (node:http(s), session, cookies, error kinds)
src/read.js             RPC answers -> plain snapshots (null, never 0, when unknown)
src/watcher.js          the timer loop: system every round, disks every 5 min,
                        S.M.A.R.T. every hour (never waking a disk by default)
src/tracker.js          snapshots -> scene trigger transitions (pure logic)
src/store.js            the "known browser" cookie, in /data/state.json
src/events.js           scene trigger payloads and scene action outputs
src/device.js           NAS, disk, file system and service devices, their states
src/widgets.js          overview, storage and disks dashboard widgets
src/config.js           configuration (address, account, TLS, interval, S.M.A.R.T., language)
src/i18n.js             runtime texts, en / fr / de / es, plurals
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## OpenMediaVault facts the code relies on

Checked against the source of openmediavault (6.x, 7.x, master) and a real
8.5.12 (a Debian 13 container with systemd, `test/helpers/fixtures.js` holds
its anonymized answers):

- `Session.login` answers `{ status: "authenticated", sessionid, permissions }`
  since 8.5, `{ authenticated: true, ... }` before; `challengeRequired` means a
  second factor (not supported). A session is bound to the User-Agent and
  expires after the timeout of the web interface (5 min by default): a 401
  "Session not authenticated." / "Session expired." logs in again, once.
- Every reading needs the admin role ("Invalid context role." otherwise):
  OpenMediaVault has no read-only role.
- The first login from a browser without the `OPENMEDIAVAULT-LOGIN-<hash>`
  cookie e-mails the user: that cookie is kept in /data, never the session.
- `DiskMgmt.enumerateDevices` runs `smartctl --nocheck=standby`: it never
  wakes a disk (power mode since 7.x). `Smart.getList` runs smartctl WITHOUT
  `--nocheck` on every disk: it spins up a sleeping disk. Hence the
  `smart_health` setting and its `awake` default.
- `FileSystemMgmt.enumerateMountedFilesystems { includeroot: true }` fails as
  a whole when the root device file is unknown (a container): read it again
  without the root file system.
- Errors come as `{ response: null, error: { code, message, trace } }` with an
  HTTP status (400, 401, 404, 429, 500). Never log nor keep the `trace`, and
  never the `password` field of `Rsync.getList`.
- `Rsync.execute` and `Apt.update` start a background job and return its
  status file; `Exec.getOutput` returns `running: false` once (the file is
  then removed) or throws the error of the job.

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (NAS `main`, disk serial number else WWN, file system
  UUID else a hash of its mount point, service name: never `/dev/sdX`), feature
  `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema`, `actions`, the widgets and their settings, scene triggers
  (fields, options, variables) and scene actions (fields, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs** come from the SDK constants and have an icon in
  the Gladys front (`test/devices.test.js` lists them). CPU, memory and the
  usage of a file system are `level-sensor` / `decimal` in %: Gladys has no
  category of their own. A service is a read-only `switch` / `binary`.
- **`should_poll` stays false**: the NAS is read on the integration's own
  timer, one round for every device. It never resyncs on existing devices.
- **Never wake a disk** unless the user chose `smart_health` "always". Any
  new call that touches the disks must be checked against the source of
  openmediavault for `--nocheck`.
- **The first round is a baseline**: no scene event replays history after a
  restart or a configuration change. A change the integration makes itself (a
  reboot or a shutdown asked from Gladys, an update check run by a scene
  action) never fires a scene trigger.
- **Optional calls** (a plugin or a method a version lacks) are skipped for an
  hour when they answer "does not exist"; only `System.getInformation` decides
  whether the round failed. A refused password pauses the logins for 10
  minutes (Test the connection forces one).
- **The container rootfs is read-only.** Write only under `/data`. Never log
  the password; never put it in an URL.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): a widget button
  with a form would need 5.2.0. Transport: `["local"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (a local server on 127.0.0.1 at
  most).
