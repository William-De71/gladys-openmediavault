// A fake OpenMediaVault for the tests: the RPC answers as a real 8.5.12
// builds them (recorded on a test NAS, then anonymized: host name, serial
// numbers), served through the `request` transport of the client, with the
// session rules of rpc.php (cookie or X-OPENMEDIAVAULT-SESSIONID, 401 once
// it expired, 400 on a wrong password). Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-18T18:00:00Z');
const MINUTE = 60000;
const USERNAME = 'admin';
const PASSWORD = 'openmediavault';
const DATA_UUID = '956cfefe-1a91-4200-a1a4-c9324467bbe1';
const BACKUP_UUID = '2b9d2a4e-6c1f-4f0e-9a43-7d1e5b8c0f21';
const JOB_UUID = 'e896415d-a07f-4e5a-9586-df1ec35308fe';
const HDD_SERIAL = 'WD-WCC7K1ABCDEF';
const HDD2_SERIAL = 'ZL2ABC12';
const NVME_SERIAL = '25094E763555';
const GIB = 1024 ** 3;

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary file path for the kept browser cookie.
 * @returns {string} The path (its directory exists, the file does not).
 */
const statePath = () => join(mkdtempSync(join(tmpdir(), 'omv-')), 'state.json');

// The minimal GladysIntegration the device builders need.
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:test-integration:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

/**
 * @description The default answers, by "Service.method".
 * @returns {object} The answers.
 */
function defaultAnswers() {
  return {
    'System.getInformation': {
      ts: 1792358591,
      time: 'Sun Oct 18 20:00:00 2026',
      hostname: 'nas.home.lan',
      version: '8.5.12-1 (Synchrony)',
      cpuModelName: 'Intel(R) Celeron(R) N5105 @ 2.00GHz',
      cpuUtilization: 12.47,
      cpuCores: '4',
      cpuMhz: '2000.000',
      memTotal: '16541937664',
      memFree: '366284800',
      memUsed: '4173065984',
      memAvailable: '12168871680',
      memUtilization: '0.26436',
      kernel: 'Linux 6.12.48+deb13-amd64',
      uptime: 1479751.72,
      loadAverage: { '1min': 0.42, '5min': 0.37, '15min': 0.31 },
      configDirty: false,
      dirtyModules: [],
      rebootRequired: false,
      availablePkgUpdates: 0,
      displayWelcomeMessage: false,
    },
    'DiskMgmt.enumerateDevices': [
      {
        devicename: 'sda',
        canonicaldevicefile: '/dev/sda',
        devicefile: '/dev/disk/by-id/ata-WDC_WD40EFRX-68N32N0_WD-WCC7K1ABCDEF',
        devicelinks: [],
        model: 'WDC WD40EFRX-68N32N0',
        size: '4000787030016',
        description: 'WDC WD40EFRX-68N32N0 [/dev/sda, 3.64 TiB]',
        vendor: 'ATA',
        serialnumber: HDD_SERIAL,
        wwn: '0x50014ee2b1234567',
        israid: false,
        isroot: false,
        isreadonly: false,
        powermode: 'ACTIVE or IDLE',
        temperature: '36',
        hotpluggable: false,
      },
      {
        devicename: 'sdb',
        canonicaldevicefile: '/dev/sdb',
        devicefile: '/dev/disk/by-id/ata-ST4000VN008-2DR166_ZL2ABC12',
        devicelinks: [],
        model: 'ST4000VN008-2DR166',
        size: '4000787030016',
        description: 'ST4000VN008-2DR166 [/dev/sdb, 3.64 TiB]',
        vendor: 'ATA',
        serialnumber: HDD2_SERIAL,
        wwn: '0x5000c500a1234567',
        israid: false,
        isroot: false,
        isreadonly: false,
        powermode: 'ACTIVE or IDLE',
        temperature: '38',
        hotpluggable: false,
      },
      {
        // As a real 8.5 reports a NVMe disk: no power mode, the serial number
        // known by smartctl only when udev has none.
        devicename: 'nvme0n1',
        canonicaldevicefile: '/dev/nvme0n1',
        devicefile: '/dev/nvme0n1',
        devicelinks: [],
        model: 'CT1000P310SSD8',
        size: '1000204886016',
        description: 'CT1000P310SSD8 [/dev/nvme0n1, 931.51 GiB]',
        vendor: '0xc0a9',
        serialnumber: '',
        wwn: '',
        israid: false,
        isroot: true,
        isreadonly: false,
        powermode: 'UNKNOWN',
        temperature: '41',
        hotpluggable: false,
      },
      {
        // A card reader: no serial number, no WWN, never offered.
        devicename: 'mmcblk0',
        canonicaldevicefile: '/dev/mmcblk0',
        devicefile: '/dev/mmcblk0',
        devicelinks: [],
        model: '',
        size: '1030225920',
        description: 'N/A [/dev/mmcblk0, 982.50 MiB]',
        vendor: '',
        serialnumber: '',
        wwn: '',
        israid: false,
        isroot: false,
        isreadonly: false,
        powermode: 'UNKNOWN',
        temperature: '',
        hotpluggable: false,
      },
    ],
    'Smart.getList': {
      total: 3,
      data: [
        { devicename: 'sda', serialnumber: HDD_SERIAL, temperature: '36', overallstatus: 'GOOD' },
        { devicename: 'sdb', serialnumber: HDD2_SERIAL, temperature: '38', overallstatus: 'GOOD' },
        {
          devicename: 'nvme0n1',
          canonicaldevicefile: '/dev/nvme0n1',
          model: 'CT1000P310SSD8',
          serialnumber: NVME_SERIAL,
          temperature: '41',
          overallstatus: 'GOOD',
          monitor: false,
        },
      ],
    },
    'FileSystemMgmt.enumerateMountedFilesystems': [
      {
        devicename: 'nvme0n1p2',
        devicefile: '/dev/nvme0n1p2',
        uuid: '4f2d7c3a-8e61-4b9d-a0c5-3e7f1b2d9a64',
        label: '',
        type: 'ext4',
        mounted: true,
        mountpoint: '/',
        available: String(180 * GIB),
        size: String(230 * GIB),
        percentage: 19,
        comment: '',
        usagewarnthreshold: 85,
      },
      {
        devicename: 'sda1',
        devicefile: '/dev/sda1',
        uuid: DATA_UUID,
        label: 'data',
        type: 'ext4',
        blocks: '3021608',
        mounted: true,
        mountpoint: `/srv/dev-disk-by-uuid-${DATA_UUID}`,
        used: '2.95 TiB',
        available: String(Math.round(0.69 * 1024 * GIB)),
        size: String(Math.round(3.64 * 1024 * GIB)),
        percentage: 81,
        description: '/dev/sda1 [EXT4, 2.95 TiB (81%) used, 704.56 GiB available]',
        comment: '',
        usagewarnthreshold: 85,
      },
      {
        devicename: 'sdb1',
        devicefile: '/dev/sdb1',
        uuid: BACKUP_UUID,
        label: 'backup',
        type: 'btrfs',
        mounted: true,
        mountpoint: `/srv/dev-disk-by-uuid-${BACKUP_UUID}`,
        available: String(Math.round(2.1 * 1024 * GIB)),
        size: String(Math.round(3.64 * 1024 * GIB)),
        percentage: 42,
        comment: 'USB',
        usagewarnthreshold: 0,
      },
    ],
    'Services.getStatus': {
      total: 4,
      data: [
        { name: 'nfs', title: 'NFS', enabled: false, running: false },
        { name: 'rsyncd', title: 'RSync server', enabled: false, running: false },
        { name: 'samba', title: 'SMB/CIFS', enabled: true, running: true },
        { name: 'ssh', title: 'SSH', enabled: true, running: true },
      ],
    },
    'Rsync.getList': {
      total: 1,
      data: [
        {
          uuid: JOB_UUID,
          enable: true,
          sendemail: false,
          comment: 'Photos backup',
          type: 'local',
          src: { sharedfolderref: '704e8dc1-7d54-47f3-92b0-27c73a70ae61', uri: '' },
          dest: { sharedfolderref: '79b0bc96-8e06-4cb4-8ea3-b0c88e4f9854', uri: '' },
          mode: 'push',
          authentication: 'password',
          password: 'never-read',
          srcname: 'photos',
          destname: 'backup',
        },
      ],
    },
  };
}

// The output of a successful rsync run, as OpenMediaVault 8.5 writes it.
const RSYNC_OUTPUT =
  'Please wait, syncing </srv/dev-loop0/photos/> to </srv/dev-loop0/backup/> ...\n\n' +
  'sending incremental file list\n./\na.txt\n\nsent 126 bytes  received 38 bytes  328.00 bytes/sec\n' +
  'total size is 6  speedup is 0.04\nThe synchronisation has completed successfully.\n';

/**
 * @description The answer of rpc.php for an error, as OpenMediaVault builds it.
 * @param {number} status - The HTTP status.
 * @param {string} message - The message.
 * @returns {{ status: number, headers: object, body: string }} The answer.
 */
const errorAnswer = (status, message) => ({
  status,
  headers: {},
  body: JSON.stringify({
    response: null,
    error: { code: 0, message, trace: `OMV\\HttpErrorException: ${message} in /usr/share/...` },
  }),
});

/**
 * @description A fake OpenMediaVault: a `request` transport for the client,
 * plus handles to change its answers and look at what it received.
 * @param {object} [options] - `{ answers }`: answers to override, by "Service.method".
 * @returns {Function} The transport, with `answers`, `calls`, `logins`,
 * `expireSessions()`, `setReachable()`, `jobs`, `lastHeaders`.
 */
function omv({ answers: overrides = {} } = {}) {
  const answers = { ...defaultAnswers(), ...overrides };
  const sessions = new Set();
  // filename -> { polls: readings left while running, output, error }
  const jobs = new Map();
  let reachable = true;
  let sequence = 0;
  let password = PASSWORD;
  let role = 'admin';
  let mfa = false;

  const request = async ({ url, method, headers, body }) => {
    request.lastHeaders = headers;
    request.urls.push(url);
    if (!reachable) {
      throw Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
    }
    if (method !== 'POST' || !url.endsWith('/rpc.php')) {
      return { status: 404, headers: {}, body: '<html>Not found</html>' };
    }
    const { service, method: rpcMethod, params } = JSON.parse(body);
    const call = `${service}.${rpcMethod}`;
    request.calls.push({ call, params });
    const cookie = /OPENMEDIAVAULT-SESSIONID=([0-9a-f]+)/.exec(headers.Cookie ?? '')?.[1];
    const session = headers['X-OPENMEDIAVAULT-SESSIONID'] ?? cookie;

    if (call === 'Session.login') {
      request.logins += 1;
      request.loginCookies.push(headers.Cookie ?? '');
      if (params.username !== USERNAME || params.password !== password) {
        return errorAnswer(400, 'Incorrect username or password.');
      }
      if (mfa) {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            response: {
              username: USERNAME,
              status: 'challengeRequired',
              challenge: { kind: 'totp' },
            },
            error: null,
          }),
        };
      }
      sequence += 1;
      const id = `${'0'.repeat(28)}${String(sequence).padStart(4, '0')}`;
      sessions.add(id);
      return {
        status: 200,
        headers: {
          'set-cookie': [
            `OPENMEDIAVAULT-SESSIONID=${id}; path=/; HttpOnly; SameSite=Strict`,
            'OPENMEDIAVAULT-LOGIN-2432792431322455=Without%20change%20something%20sleeps%20inside%20us.; ' +
              'expires=Thu, 17 Dec 2099 21:23:02 GMT; Max-Age=5184000; HttpOnly; SameSite=Strict',
          ],
        },
        body: JSON.stringify({
          response: {
            username: USERNAME,
            status: 'authenticated',
            permissions: { role },
            sessionid: id,
          },
          error: null,
        }),
      };
    }
    if (!session || !sessions.has(session)) {
      return errorAnswer(401, 'Session not authenticated.');
    }
    if (call === 'Session.logout') {
      sessions.delete(session);
      return { status: 200, headers: {}, body: JSON.stringify({ response: null, error: null }) };
    }
    const job = (kind) => {
      sequence += 1;
      const filename = `/tmp/bgstatus${kind}${sequence}`;
      jobs.set(filename, { kind, polls: request.jobPolls, output: request.jobOutputs[kind] ?? '' });
      return filename;
    };
    let response;
    if (call === 'Rsync.execute') {
      response = job('rsync');
    } else if (call === 'Apt.update') {
      response = job('apt');
    } else if (call === 'System.reboot' || call === 'System.shutdown') {
      response = null;
    } else if (call === 'Exec.getOutput') {
      const state = jobs.get(params.filename);
      if (!state) {
        return errorAnswer(500, `Failed to open file (filename=${params.filename}, mode=r).`);
      }
      if (state.polls > 0) {
        state.polls -= 1;
        response = {
          filename: params.filename,
          pos: 0,
          output: '',
          pendingOutput: false,
          running: true,
        };
      } else {
        jobs.delete(params.filename);
        if (request.jobErrors[state.kind]) {
          return errorAnswer(500, request.jobErrors[state.kind]);
        }
        response = {
          filename: params.filename,
          pos: state.output.length,
          output: state.output,
          pendingOutput: false,
          running: false,
        };
      }
    } else if (call in answers) {
      const raw = answers[call];
      const answer = typeof raw === 'function' ? raw(params) : raw;
      if (answer instanceof Error) {
        return errorAnswer(answer.status ?? 500, answer.message);
      }
      response = answer;
    } else {
      return errorAnswer(
        500,
        `The method '${rpcMethod}' does not exist for the RPC service '${service}'.`,
      );
    }
    return {
      status: 200,
      headers: {},
      body: JSON.stringify({ response: structuredClone(response ?? null), error: null }),
    };
  };
  request.answers = answers;
  request.calls = [];
  request.urls = [];
  request.logins = 0;
  request.loginCookies = [];
  request.lastHeaders = null;
  request.jobs = jobs;
  // Readings a background job stays "running" for.
  request.jobPolls = 1;
  request.jobOutputs = {
    rsync: RSYNC_OUTPUT,
    apt: 'Hit:1 http://deb.debian.org/debian trixie InRelease\nReading package lists...\n',
  };
  request.jobErrors = {};
  request.expireSessions = () => sessions.clear();
  request.setReachable = (value) => {
    reachable = value;
  };
  request.setPassword = (value) => {
    password = value;
  };
  request.setRole = (value) => {
    role = value;
  };
  request.setMfa = (value) => {
    mfa = value;
  };
  request.callsOf = (call) => request.calls.filter((entry) => entry.call === call);
  return request;
}

export {
  NOW,
  MINUTE,
  USERNAME,
  PASSWORD,
  DATA_UUID,
  BACKUP_UUID,
  JOB_UUID,
  HDD_SERIAL,
  HDD2_SERIAL,
  NVME_SERIAL,
  GIB,
  silent,
  statePath,
  fakeGladys,
  defaultAnswers,
  errorAnswer,
  omv,
};
