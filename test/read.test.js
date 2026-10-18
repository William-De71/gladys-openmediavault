import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toNumber,
  rowsOf,
  parseUptime,
  parseVersion,
  readSystem,
  cleanId,
  readPowerMode,
  readHealth,
  readDisks,
  readSmart,
  readFilesystems,
  readServices,
  readRsyncJobs,
} from '../src/read.js';
import { formatBytes } from '../src/i18n.js';
import {
  defaultAnswers,
  HDD_SERIAL,
  NVME_SERIAL,
  DATA_UUID,
  JOB_UUID,
} from './helpers/fixtures.js';

const raw = defaultAnswers();

test('numbers, lists, uptime and versions as OpenMediaVault writes them', () => {
  assert.equal(toNumber('16541937664'), 16541937664);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('41 C'), null);
  assert.equal(toNumber(Number.NaN), null);
  assert.deepEqual(rowsOf({ total: 1, data: [{ a: 1 }, null] }), [{ a: 1 }]);
  assert.deepEqual(rowsOf([{ a: 1 }]), [{ a: 1 }]);
  assert.deepEqual(rowsOf(null), []);
  assert.equal(parseUptime(1479751.72), 1479751.72);
  assert.equal(parseUptime('2 days 3 hours 4 minutes 5 seconds'), 183845, 'OpenMediaVault 5');
  assert.equal(parseUptime('soon'), null);
  assert.equal(parseVersion('8.5.12-1 (Synchrony)'), '8.5.12-1');
  assert.equal(parseVersion(''), null);
});

test('the NAS: CPU, memory as a ratio, uptime, updates', () => {
  const system = readSystem(raw['System.getInformation']);
  assert.deepEqual(
    {
      hostname: system.hostname,
      version: system.version,
      versionName: system.versionName,
      cpu: system.cpu,
      memory: system.memory,
      uptimeDays: system.uptimeDays,
      load: system.load,
      updates: system.updates,
      rebootRequired: system.rebootRequired,
    },
    {
      hostname: 'nas.home.lan',
      version: '8.5.12-1',
      versionName: 'Synchrony',
      cpu: 12.5,
      memory: 26.4,
      uptimeDays: 17.13,
      load: { one: 0.42, five: 0.37, fifteen: 0.31 },
      updates: 0,
      rebootRequired: false,
    },
  );
  // OpenMediaVault 5: cpuUsage and no memUtilization.
  const old = readSystem({
    cpuUsage: 7,
    memUsed: '512',
    memTotal: '2048',
    uptime: '0 days 1 hours 0 minutes 0 seconds',
  });
  assert.equal(old.cpu, 7);
  assert.equal(old.memory, 25);
  assert.equal(old.uptimeSeconds, 3600);
  // Only what everyone may read (a user without the admin role).
  const bare = readSystem({ hostname: 'nas' });
  assert.equal(bare.cpu, null);
  assert.equal(bare.memory, null);
  assert.equal(bare.updates, null);
});

test('stable ids: serial numbers and WWN cleaned, nothing from a placeholder', () => {
  assert.equal(cleanId(HDD_SERIAL), 'wd-wcc7k1abcdef');
  assert.equal(cleanId('  S/N: 12 34 '), 's-n-12-34');
  assert.equal(cleanId('0000000000'), null);
  assert.equal(cleanId('abc'), null);
  assert.equal(cleanId(undefined), null);
});

test('power modes and S.M.A.R.T. statuses', () => {
  assert.equal(readPowerMode('ACTIVE or IDLE'), 'active');
  assert.equal(readPowerMode('IDLE_A'), 'active');
  assert.equal(readPowerMode('STANDBY'), 'standby');
  assert.equal(readPowerMode('SLEEP'), 'standby');
  assert.equal(readPowerMode('UNKNOWN'), 'unknown');
  assert.equal(readPowerMode(undefined), 'unknown');
  assert.equal(readHealth('GOOD'), 'good');
  assert.equal(readHealth('BAD_ATTRIBUTE_IN_THE_PAST'), 'warning');
  for (const status of ['BAD_ATTRIBUTE_NOW', 'BAD_SECTOR', 'BAD_SECTOR_MANY', 'BAD_STATUS']) {
    assert.equal(readHealth(status), 'bad', status);
  }
  assert.equal(readHealth(false), null);
});

test('the disks: serial from udev or S.M.A.R.T., power mode, temperature, health', () => {
  const smart = readSmart(raw['Smart.getList']);
  const disks = readDisks(raw['DiskMgmt.enumerateDevices'], smart);
  assert.deepEqual(
    disks.map((disk) => [disk.id, disk.devicename, disk.power, disk.temperature, disk.health]),
    [
      ['wd-wcc7k1abcdef', 'sda', 'active', 36, 'good'],
      ['zl2abc12', 'sdb', 'active', 38, 'good'],
      [NVME_SERIAL.toLowerCase(), 'nvme0n1', 'unknown', 41, 'good'],
    ],
  );
  assert.equal(disks[0].size, 4000787030016);
  assert.equal(disks[0].hasPowerMode, true);
  assert.equal(disks[2].serial, NVME_SERIAL);
  // Without S.M.A.R.T., the NVMe disk has no stable id: the WWN is the fallback.
  const bare = readDisks(raw['DiskMgmt.enumerateDevices']);
  assert.deepEqual(
    bare.map((disk) => disk.id),
    ['wd-wcc7k1abcdef', 'zl2abc12'],
  );
  assert.equal(
    readDisks([{ devicename: 'sdc', wwn: '0x5000c500a1234567' }])[0].id,
    '0x5000c500a1234567',
  );
  // OpenMediaVault 6: no power mode, no temperature.
  const [old] = readDisks([{ devicename: 'sda', serialnumber: 'ABC123' }]);
  assert.equal(old.hasPowerMode, false);
  assert.equal(old.temperature, null);
  assert.equal(old.health, null);
});

test('the file systems: UUID, usage, threshold; a missing UUID uses the mount point', () => {
  const [root, data, backup] = readFilesystems(raw['FileSystemMgmt.enumerateMountedFilesystems']);
  assert.equal(root.isRoot, true);
  assert.equal(root.label, null);
  assert.deepEqual(
    {
      id: data.id,
      label: data.label,
      type: data.type,
      used: data.used,
      threshold: data.threshold,
      mountpoint: data.mountpoint,
    },
    {
      id: DATA_UUID,
      label: 'data',
      type: 'ext4',
      used: 81,
      threshold: 85,
      mountpoint: `/srv/dev-disk-by-uuid-${DATA_UUID}`,
    },
  );
  assert.equal(backup.threshold, null, '0 = no warning in OpenMediaVault');
  assert.equal(backup.comment, 'USB');
  const [pool] = readFilesystems([
    { uuid: '', mountpoint: '/srv/mergerfs/pool', size: '1000', available: '250', percentage: -1 },
  ]);
  assert.match(pool.id, /^mp-[0-9a-f]{12}$/);
  assert.equal(pool.used, 75, 'computed when OpenMediaVault does not know it');
  assert.deepEqual(readFilesystems([{ uuid: '' }]), []);
});

test('services and rsync jobs, without the password of a job', () => {
  assert.deepEqual(readServices(raw['Services.getStatus']).slice(2), [
    { id: 'samba', title: 'SMB/CIFS', enabled: true, running: true },
    { id: 'ssh', title: 'SSH', enabled: true, running: true },
  ]);
  const [job] = readRsyncJobs(raw['Rsync.getList']);
  assert.deepEqual(job, {
    uuid: JOB_UUID,
    name: 'Photos backup',
    enabled: true,
    type: 'local',
    mode: 'push',
    source: 'photos',
    destination: 'backup',
  });
  const [remote] = readRsyncJobs([
    {
      uuid: JOB_UUID,
      enable: true,
      comment: '',
      type: 'remote',
      mode: 'pull',
      srcname: 'bob@backup.lan::photos',
      destname: 'photos',
    },
  ]);
  assert.equal(remote.name, 'backup.lan::photos → photos');
  assert.equal(remote.source, 'backup.lan::photos', 'no user name kept');
});

test('sizes in the binary units of OpenMediaVault, with the separator of the language', () => {
  assert.equal(formatBytes(2915479552, 'en'), '2.72 GiB');
  assert.equal(formatBytes(2915479552, 'fr'), '2,72 GiB');
  assert.equal(formatBytes(4000787030016, 'de'), '3,64 TiB');
  assert.equal(formatBytes(512, 'en'), '512 B');
  assert.equal(formatBytes(null, 'en'), '?');
});
