// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake OpenMediaVault.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { DISK_INTERVAL_MS, SMART_INTERVAL_MS, AUTH_PAUSE_MS } from '../src/watcher.js';
import { LANGUAGES } from '../src/i18n.js';
import {
  omv,
  statePath,
  NOW,
  MINUTE,
  PASSWORD,
  DATA_UUID,
  BACKUP_UUID,
  JOB_UUID,
  HDD_SERIAL,
  NVME_SERIAL,
} from './helpers/fixtures.js';

const CONFIG = { url: '192.168.1.10', username: 'admin', password: PASSWORD };
const PREFIX = 'ext:test-integration';
const NAS = `${PREFIX}:nas:main`;
const HDD = `${PREFIX}:disk:${HDD_SERIAL.toLowerCase()}`;
const NVME = `${PREFIX}:disk:${NVME_SERIAL.toLowerCase()}`;
const DATA = `${PREFIX}:filesystem:${DATA_UUID}`;
const BACKUP = `${PREFIX}:filesystem:${BACKUP_UUID}`;
const SAMBA = `${PREFIX}:service:samba`;

/**
 * @description The integration, connected to a fake Gladys and a fake OpenMediaVault.
 * @param {object} [options] - `{ config, fake, path }`.
 * @returns {Promise<object>} `{ gladys, app, fake, clock, path, logs }`.
 */
async function startApp({ config = CONFIG, fake = omv(), path = statePath() } = {}) {
  const clock = { now: NOW };
  const logs = [];
  const logger = {
    info: (m) => logs.push(m),
    warn: (m) => logs.push(m),
    error: (m, e) => logs.push(`${m} ${e?.message ?? ''}`),
    debug() {},
  };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    request: fake,
    statePath: path,
    now: () => clock.now,
    // A scene waiting for a job: time goes by without waiting for real.
    wait: async (ms) => {
      clock.now += ms;
    },
    logger,
  });
  await gladys.connect();
  return { gladys, app, fake, clock, path, logs };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const lastState = (gladys, id) =>
  gladys.fake.states.filter((state) => state.device_feature_external_id === id).at(-1);
const nextRound = async (app, clock, ms = MINUTE) => {
  clock.now += ms;
  await app.watcher.round();
};
const info = (fake) => fake.answers['System.getInformation'];
const filesystems = (fake) => fake.answers['FileSystemMgmt.enumerateMountedFilesystems'];
const disks = (fake) => fake.answers['DiskMgmt.enumerateDevices'];

test('the NAS, its disks, file systems and enabled services are offered, accepted by the host API checks', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.disconnect());
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id).sort();
  assert.deepEqual(
    ids,
    [
      NAS,
      BACKUP,
      DATA,
      `${PREFIX}:filesystem:4f2d7c3a-8e61-4b9d-a0c5-3e7f1b2d9a64`,
      HDD,
      `${PREFIX}:disk:zl2abc12`,
      NVME,
      SAMBA,
      `${PREFIX}:service:ssh`,
    ].sort(),
  );
  const nas = gladys.fake.discoveredDevices.find((device) => device.external_id === NAS);
  assert.equal(nas.name, 'OpenMediaVault nas');
  assert.equal(nas.should_poll, false);
  const hdd = gladys.fake.discoveredDevices.find((device) => device.external_id === HDD);
  assert.equal(hdd.name, 'Disk WDC WD40EFRX-68N32N0 (…CDEF)');
  // The card reader (no serial number, no WWN) is left out; the NVMe disk has
  // its serial number from S.M.A.R.T. only.
  assert.ok(!gladys.fake.discoveredDevices.some((device) => /mmcblk/.test(device.name)));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /Connected to nas \(OpenMediaVault 8\.5\.12-1\)/,
  );
});

test('creating a device publishes all its states, then only what changed', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  await created(gladys, NAS);
  await created(gladys, HDD);
  await created(gladys, DATA);
  await created(gladys, SAMBA);
  assert.equal(lastState(gladys, `${NAS}:cpu`).state, 12.5);
  assert.equal(lastState(gladys, `${NAS}:memory`).state, 26.4);
  assert.equal(lastState(gladys, `${NAS}:uptime`).state, 17.13);
  assert.equal(lastState(gladys, `${NAS}:updates`).state, 0);
  assert.equal(lastState(gladys, `${NAS}:version`).text, '8.5.12-1');
  assert.equal(lastState(gladys, `${HDD}:temperature`).state, 36);
  assert.equal(lastState(gladys, `${HDD}:power`).text, 'Active');
  assert.equal(lastState(gladys, `${HDD}:health`).text, 'Good');
  assert.equal(lastState(gladys, `${DATA}:used`).state, 81);
  assert.equal(lastState(gladys, `${DATA}:free`).state, 758.7);
  assert.equal(lastState(gladys, `${SAMBA}:running`).state, 1);

  const before = gladys.fake.states.length;
  await nextRound(app, clock);
  assert.equal(gladys.fake.states.length, before, 'nothing changed, nothing sent');
  info(fake).cpuUtilization = 55.2;
  await nextRound(app, clock);
  assert.deepEqual(gladys.fake.states.slice(before), [
    { device_feature_external_id: `${NAS}:cpu`, state: 55.2 },
  ]);
});

test('one session for every reading: a login at the start, another one only when it expired', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  assert.equal(fake.logins, 1);
  await nextRound(app, clock);
  await nextRound(app, clock);
  assert.equal(fake.logins, 1);
  assert.match(fake.lastHeaders['X-OPENMEDIAVAULT-SESSIONID'], /^0+1$/);
  assert.match(fake.lastHeaders.Cookie, /OPENMEDIAVAULT-SESSIONID=/);
  assert.match(fake.lastHeaders['User-Agent'], /^gladys-openmediavault\//);
  fake.expireSessions();
  await nextRound(app, clock);
  assert.equal(fake.logins, 2, 'logged in again once');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  // Every call goes to rpc.php of the address typed, never with the password in it.
  assert.ok(fake.urls.every((url) => url === 'http://192.168.1.10/rpc.php'));
});

test('the browser cookie survives a restart: OpenMediaVault does not e-mail again', async (t) => {
  const path = statePath();
  const first = await startApp({ path });
  await first.app.store.flush();
  await first.gladys.disconnect();
  assert.equal(first.fake.loginCookies[0], '', 'a first start has no cookie');
  const second = await startApp({ path });
  t.after(() => second.gladys.disconnect());
  assert.match(second.fake.loginCookies[0], /^OPENMEDIAVAULT-LOGIN-2432792431322455=/);
  assert.doesNotMatch(second.fake.loginCookies[0], /SESSIONID/, 'never an old session');
});

test('S.M.A.R.T. never wakes a sleeping disk unless asked, and waits for the disks to wake', async (t) => {
  const fake = omv();
  disks(fake)[1].powermode = 'STANDBY';
  const { gladys, app, clock } = await startApp({ fake });
  t.after(() => gladys.disconnect());
  assert.equal(fake.callsOf('Smart.getList').length, 0, 'a disk sleeps: no S.M.A.R.T.');
  const content = (await gladys.fake.widgetGet(WIDGETS.DISKS, { language: 'en' })).data.content;
  assert.match(content.components[0].text, /waits for the disks to wake/);
  // The NVMe disk has no serial number from udev: offered once S.M.A.R.T. told it.
  assert.ok(!gladys.fake.discoveredDevices.some((device) => device.external_id === NVME));

  disks(fake)[1].powermode = 'ACTIVE or IDLE';
  await nextRound(app, clock, MINUTE);
  assert.equal(fake.callsOf('Smart.getList').length, 0, 'the disks are read every 5 minutes');
  await nextRound(app, clock, DISK_INTERVAL_MS);
  assert.equal(fake.callsOf('Smart.getList').length, 1, 'read as soon as every disk is awake');
  assert.ok(gladys.fake.discoveredDevices.some((device) => device.external_id === NVME));
  await nextRound(app, clock, DISK_INTERVAL_MS);
  assert.equal(fake.callsOf('Smart.getList').length, 1, 'then every hour');
  await nextRound(app, clock, SMART_INTERVAL_MS);
  assert.equal(fake.callsOf('Smart.getList').length, 2);
});

test('smart_health: always reads a sleeping disk, off never reads', async (t) => {
  const always = omv();
  disks(always)[0].powermode = 'STANDBY';
  const a = await startApp({ fake: always, config: { ...CONFIG, smart_health: 'always' } });
  t.after(() => a.gladys.disconnect());
  assert.equal(always.callsOf('Smart.getList').length, 1);

  const off = omv();
  const b = await startApp({ fake: off, config: { ...CONFIG, smart_health: 'off' } });
  t.after(() => b.gladys.disconnect());
  await nextRound(b.app, b.clock, SMART_INTERVAL_MS);
  assert.equal(off.callsOf('Smart.getList').length, 0);
  const content = (await b.gladys.fake.widgetGet(WIDGETS.DISKS, { language: 'fr' })).data.content;
  assert.match(content.components[0].text, /S\.M\.A\.R\.T\. désactivé/);
});

test('a disk whose S.M.A.R.T. health turns bad fires one scene event', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  await created(gladys, HDD);
  fake.answers['Smart.getList'].data[0].overallstatus = 'BAD_SECTOR';
  await nextRound(app, clock, SMART_INTERVAL_MS);
  const [event] = eventsOf(gladys, TRIGGERS.DISK_HEALTH_CHANGED);
  assert.equal(event.data.device, HDD);
  assert.equal(event.data.health, 'bad');
  assert.equal(event.data.previous_health, 'good');
  assert.equal(event.data.status, 'BAD_SECTOR');
  assert.equal(event.data.serial, HDD_SERIAL);
  assert.match(event.data.summary, /is failing \(BAD_SECTOR\): back up its data/);
  assert.equal(lastState(gladys, `${HDD}:health`).text, 'Failing');
  await nextRound(app, clock, SMART_INTERVAL_MS);
  assert.equal(eventsOf(gladys, TRIGGERS.DISK_HEALTH_CHANGED).length, 1, 'once');
});

test('a file system crossing its warning threshold fires above, then below', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  filesystems(fake)[1].percentage = 86;
  await nextRound(app, clock);
  filesystems(fake)[1].percentage = 87;
  await nextRound(app, clock);
  filesystems(fake)[1].percentage = 70;
  await nextRound(app, clock);
  const events = eventsOf(gladys, TRIGGERS.FILESYSTEM_USAGE);
  assert.deepEqual(
    events.map((event) => [event.data.state, event.data.used_percent, event.data.threshold]),
    [
      ['above', 86, 85],
      ['below', 70, 85],
    ],
  );
  assert.equal(events[0].data.device, DATA);
  assert.match(events[0].data.summary, /^data is 86 % full \(threshold 85 %\), 707 GiB free\.$/);
  // No threshold (0 in OpenMediaVault): no event.
  filesystems(fake)[2].percentage = 99;
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.FILESYSTEM_USAGE).length, 2);
});

test('a file system that disappears fires "missing", then "mounted" when it is back', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  const backup = filesystems(fake).pop();
  await nextRound(app, clock);
  const content = (await gladys.fake.widgetGet(WIDGETS.STORAGE, { language: 'en' })).data.content;
  assert.deepEqual(content.components[1].items[0].badge, { text: 'Missing', color: 'danger' });
  filesystems(fake).push(backup);
  await nextRound(app, clock);
  const events = eventsOf(gladys, TRIGGERS.FILESYSTEM_MOUNT_CHANGED);
  assert.deepEqual(
    events.map((event) => [event.data.state, event.data.device]),
    [
      ['missing', BACKUP],
      ['mounted', BACKUP],
    ],
  );
  assert.equal(events[0].data.mountpoint, `/srv/dev-disk-by-uuid-${BACKUP_UUID}`);
  assert.equal(app.watcher.missingFilesystems().length, 0);
});

test('an enabled service that stops or starts fires its event; a disabled one never', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  await created(gladys, SAMBA);
  const services = fake.answers['Services.getStatus'].data;
  services[2].running = false;
  services[0].running = true;
  await nextRound(app, clock);
  services[2].running = true;
  await nextRound(app, clock);
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.SERVICE_STATE_CHANGED).map((event) => [
      event.data.service,
      event.data.state,
      event.data.device,
    ]),
    [
      ['samba', 'stopped', SAMBA],
      ['samba', 'started', SAMBA],
    ],
  );
  assert.equal(lastState(gladys, `${SAMBA}:running`).state, 1);
});

test('restart, updates and reboot required fire one event each', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  info(fake).uptime = 180;
  info(fake).availablePkgUpdates = 3;
  info(fake).rebootRequired = true;
  await nextRound(app, clock);
  info(fake).uptime = 240;
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.NAS_REBOOTED).length, 1);
  assert.equal(eventsOf(gladys, TRIGGERS.NAS_REBOOTED)[0].data.uptime_minutes, 3);
  const [updates] = eventsOf(gladys, TRIGGERS.UPDATES_AVAILABLE);
  assert.equal(updates.data.updates, 3);
  assert.equal(updates.data.summary, '3 updates available. A reboot is required.');
  assert.equal(eventsOf(gladys, TRIGGERS.REBOOT_REQUIRED).length, 1);
  info(fake).availablePkgUpdates = 2;
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.UPDATES_AVAILABLE).length, 1, 'fewer is no event');
});

test('a NAS that stops answering is lost after two readings, restored at the next answer', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  fake.setReachable(false);
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED).length, 0, 'one timeout is no outage');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /does not answer at http:\/\/192\.168\.1\.10/,
  );
  await nextRound(app, clock);
  await nextRound(app, clock);
  fake.setReachable(true);
  await nextRound(app, clock);
  const events = eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED);
  assert.deepEqual(
    events.map((event) => [event.data.state, event.data.down_minutes]),
    [
      ['lost', -1],
      ['restored', 3],
    ],
  );
  assert.equal(events[1].data.summary, 'nas answers again after 3 min.');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a reboot asked from Gladys fires no outage nor restart event', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.REBOOT, { delay: 5 });
  assert.equal(ack.success, true);
  assert.deepEqual(fake.callsOf('System.reboot')[0].params, { delay: 5 });
  fake.setReachable(false);
  await nextRound(app, clock);
  await nextRound(app, clock);
  fake.setReachable(true);
  info(fake).uptime = 60;
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED).length, 0);
  assert.equal(eventsOf(gladys, TRIGGERS.NAS_REBOOTED).length, 0);
  // The next outage is a real one again.
  fake.setReachable(false);
  await nextRound(app, clock);
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.CONNECTION_CHANGED).length, 1);
});

test('a quick reboot asked from Gladys (no outage seen) fires no restart event either', async (t) => {
  const { gladys, app, fake, clock } = await startApp();
  t.after(() => gladys.disconnect());
  await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.REBOOT);
  info(fake).uptime = 30;
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.NAS_REBOOTED).length, 0);
  info(fake).uptime = 10;
  await nextRound(app, clock);
  assert.equal(eventsOf(gladys, TRIGGERS.NAS_REBOOTED).length, 1, 'the next restart counts');
});

test('scene action shutdown sends the bounded delay', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.disconnect());
  await gladys.fake.sceneAction(SCENE_ACTIONS.SHUTDOWN, { delay: 99999 });
  await gladys.fake.sceneAction(SCENE_ACTIONS.SHUTDOWN, {});
  assert.deepEqual(
    fake.callsOf('System.shutdown').map((call) => call.params),
    [{ delay: 3600 }, { delay: 0 }],
  );
});

test('scene action get_status returns every declared output', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.disconnect());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_STATUS, {});
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, {
    cpu: 12.5,
    memory: 26.4,
    uptime_days: 17.13,
    updates: 0,
    reboot_required: 0,
    storage_used_max: 81,
    disk_temperature_max: 41,
    disks_failing: 0,
    services_stopped: 0,
    version: '8.5.12-1',
    summary:
      'nas: CPU 13 %, memory 26 %. Fullest file system: data (81 %). OpenMediaVault 8.5.12-1 is up to date.',
  });
});

test('scene action run_rsync_job runs a job by name or UUID and reports how it ended', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.disconnect());
  let ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, { job: 'photos BACKUP' });
  assert.equal(ack.success, true);
  assert.equal(ack.data.outputs.job, 'Photos backup');
  assert.equal(ack.data.outputs.status, 'completed');
  assert.match(ack.data.outputs.message, /The synchronisation has completed successfully\.$/);
  assert.deepEqual(fake.callsOf('Rsync.execute')[0].params, { uuid: JOB_UUID });

  fake.jobErrors.rsync = "Failed to execute command 'rsync': connection refused";
  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, { job: JOB_UUID });
  assert.equal(ack.data.outputs.status, 'failed');
  assert.match(ack.data.outputs.message, /connection refused/);

  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, { job: 'nope' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unknown rsync job: nope/);
  fake.answers['Rsync.getList'].data[0].enable = false;
  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, { job: 'Photos backup' });
  assert.match(ack.error, /disabled/);
});

test('run_rsync_job without waiting, then again while it runs: started once', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.disconnect());
  fake.jobPolls = 1000;
  let ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, {
    job: 'Photos backup',
    wait: false,
  });
  assert.equal(ack.data.outputs.status, 'running');
  ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, { job: 'Photos backup' });
  assert.equal(ack.data.outputs.status, 'running');
  assert.equal(fake.callsOf('Rsync.execute').length, 1);
});

test('check_updates reads the package lists, never fires "updates available" itself', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.disconnect());
  await created(gladys, NAS);
  info(fake).availablePkgUpdates = 4;
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.CHECK_UPDATES, {});
  assert.deepEqual(ack.data.outputs, { updates: 4, summary: '4 updates available.' });
  assert.equal(fake.callsOf('Apt.update').length, 1);
  assert.equal(lastState(gladys, `${NAS}:updates`).state, 4);
  await gladys.fake.scanRequest();
  assert.equal(eventsOf(gladys, TRIGGERS.UPDATES_AVAILABLE).length, 0);
});

test('every widget content is valid for the core, in the four languages', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.disconnect());
  await created(gladys, DATA);
  const cases = [
    [WIDGETS.OVERVIEW, {}],
    [WIDGETS.STORAGE, {}],
    [WIDGETS.STORAGE, { filesystem: DATA, interval: 'last-month' }],
    [WIDGETS.STORAGE, { filesystem: BACKUP }],
    [WIDGETS.DISKS, {}],
  ];
  for (const language of LANGUAGES) {
    for (const [key, settings] of cases) {
      const ack = await gladys.fake.widgetGet(key, { settings, language });
      assert.equal(ack.success, true, `${key} ${language}`);
      const report = validateWidgetContent(ack.data.content);
      assert.deepEqual(report.problems ?? report.warnings ?? [], [], `${key} ${language}`);
    }
  }
  const one = await gladys.fake.widgetGet(WIDGETS.STORAGE, {
    settings: { filesystem: DATA },
    language: 'fr',
  });
  const chart = one.data.content.components.find((component) => component.type === 'chart');
  assert.deepEqual(chart.device_features, [`${DATA}:used`]);
  const backup = await gladys.fake.widgetGet(WIDGETS.STORAGE, {
    settings: { filesystem: BACKUP },
    language: 'fr',
  });
  assert.ok(
    !backup.data.content.components.some((component) => component.type === 'chart'),
    'no chart without the device',
  );
});

test('widget buttons: check for updates, reboot, shut down', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.disconnect());
  let ack = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.CHECK_UPDATES);
  assert.equal(ack.data.message.fr, 'OpenMediaVault 8.5.12-1 est à jour.');
  fake.jobPolls = 1000;
  ack = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.CHECK_UPDATES);
  assert.match(ack.data.message.en, /still being read/);
  ack = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.SHUTDOWN);
  assert.equal(ack.data.message.de, 'OpenMediaVault fährt herunter.');
  assert.equal(fake.callsOf('System.shutdown').length, 1);
});

test('configuration action: test the connection', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.disconnect());
  let ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(
    ack.data.message.en,
    'Connected to nas, OpenMediaVault 8.5.12-1, as an administrator.',
  );
  fake.setPassword('changed');
  ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.fr, /a refusé l’utilisateur ou le mot de passe/);
});

test('errors become clear connection statuses; a refused password pauses the logins', async (t) => {
  const fake = omv();
  fake.setPassword('changed');
  const { gladys, app, clock } = await startApp({ fake });
  t.after(() => gladys.disconnect());
  assert.match(gladys.fake.connectionStatus.message.en, /refused the user name or the password/);
  assert.equal(fake.logins, 1);
  await nextRound(app, clock);
  await nextRound(app, clock);
  assert.equal(fake.logins, 1, 'no new login within the pause');
  fake.setPassword(PASSWORD);
  await nextRound(app, clock, AUTH_PAUSE_MS);
  assert.equal(gladys.fake.connectionStatus.connected, true);

  fake.setRole('user');
  fake.expireSessions();
  await nextRound(app, clock);
  assert.match(gladys.fake.connectionStatus.message.en, /not an administrator/);
  fake.setRole('admin');
  fake.setMfa(true);
  await gladys.fake.configUpdated({ ...CONFIG });
  assert.match(gladys.fake.connectionStatus.message.en, /second factor/);
});

test('an address that is not OpenMediaVault, or no credentials, says so', async (t) => {
  const fake = omv();
  const { gladys } = await startApp({ fake, config: { url: '192.168.1.10/', username: 'admin' } });
  t.after(() => gladys.disconnect());
  assert.match(gladys.fake.connectionStatus.message.en, /Enter the address of OpenMediaVault/);
  assert.equal(fake.calls.length, 0);
  const other = async () => ({ status: 200, headers: {}, body: '<html>Plex</html>' });
  const second = await startApp({ fake: other });
  t.after(() => second.gladys.disconnect());
  assert.match(
    second.gladys.fake.connectionStatus.message.en,
    /not as the web interface of OpenMediaVault/,
  );
});

test('a root file system OpenMediaVault cannot describe: the others are read without it', async (t) => {
  const fake = omv();
  const all = filesystems(fake);
  // What a real 8.5 answers when the root device file is unknown (a container).
  fake.answers['FileSystemMgmt.enumerateMountedFilesystems'] = (params) =>
    params?.includeroot
      ? new Error('fsname: The value "" does not match exactly one schema')
      : all.filter((fs) => fs.mountpoint !== '/');
  const { gladys, app, clock } = await startApp({ fake });
  t.after(() => gladys.disconnect());
  assert.deepEqual(
    app.watcher.filesystems().map((fs) => fs.label),
    ['data', 'backup'],
  );
  const withRoot = () =>
    fake
      .callsOf('FileSystemMgmt.enumerateMountedFilesystems')
      .filter((call) => call.params.includeroot).length;
  assert.equal(withRoot(), 1);
  await nextRound(app, clock);
  assert.equal(withRoot(), 1, 'not asked again for an hour');
  assert.equal(eventsOf(gladys, TRIGGERS.FILESYSTEM_MOUNT_CHANGED).length, 0);
});

test('every feature is read-only', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.disconnect());
  const device = await created(gladys, SAMBA);
  const ack = await gladys.fake.setValue(device, device.features[0], 0);
  assert.equal(ack.success, false);
  assert.match(ack.error, /Read-only feature/);
});

test('the password never reaches a log nor an URL', async (t) => {
  const fake = omv();
  fake.setPassword('changed');
  const { gladys, logs, app, clock } = await startApp({ fake });
  t.after(() => gladys.disconnect());
  await nextRound(app, clock, AUTH_PAUSE_MS);
  await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.ok(logs.length > 0);
  assert.ok(
    logs.every((line) => !line.includes(PASSWORD)),
    logs.join('\n'),
  );
  assert.ok(fake.urls.every((url) => !url.includes(PASSWORD)));
  // The password of a remote rsync job neither.
  await gladys.fake.sceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, { job: 'Photos backup' });
  assert.ok(logs.every((line) => !line.includes('never-read')));
});
