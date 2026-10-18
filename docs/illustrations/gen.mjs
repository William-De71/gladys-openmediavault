// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The widgets on a made-up home NAS (fixed date, seeded randomness): an
// OpenMediaVault 8 with two updates pending, three disks (one reporting a
// past S.M.A.R.T. problem, one in standby), its file systems, and the "data"
// file system alone with the history of its usage over a week. A
// device-bound chart reads the history Gladys keeps for the features: here
// the history is made up, the content around it is real.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildOverviewWidget, buildStorageWidget, buildDisksWidget } = await load('src/widgets.js');
const { LANGUAGES, t } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Sunday 18 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-18T18:00:00Z');
const MINUTE = 60000;
const GIB = 1024 ** 3;
const TIB = 1024 * GIB;

// mulberry32: the same "random" history on every run.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// One point every 2 hours over the last week: a disk that slowly fills up,
// with a clean-up on Thursday.
function usage(seed) {
  const next = random(seed);
  const points = [];
  let value = 74.2;
  for (let h = 7 * 24; h >= 0; h -= 2) {
    const at = NOW - h * 60 * MINUTE;
    value += 0.05 + next() * 0.12;
    if (h === 74) {
      value -= 4.5;
    }
    points.push({ t: new Date(at).toISOString(), v: Math.round(value * 10) / 10 });
  }
  return points;
}

const system = {
  hostname: 'nas.home.lan',
  version: '8.5.12-1',
  cpu: 9.4,
  memory: 31.2,
  uptimeDays: 23.4,
  updates: 2,
  rebootRequired: false,
};
const disks = [
  {
    id: 'wd-wcc7k1abcdef',
    devicename: 'sda',
    devicefile: '/dev/sda',
    model: 'WDC WD40EFRX-68N32N0',
    serial: 'WD-WCC7K1ABCDEF',
    size: 4000787030016,
    temperature: 36,
    power: 'active',
    health: 'good',
  },
  {
    id: 'zl2abc12',
    devicename: 'sdb',
    devicefile: '/dev/sdb',
    model: 'ST4000VN008-2DR166',
    serial: 'ZL2ABC12',
    size: 4000787030016,
    temperature: 38,
    power: 'active',
    health: 'warning',
  },
  {
    id: 'w4j0xyz9',
    devicename: 'sdc',
    devicefile: '/dev/sdc',
    model: 'ST2000DM008-2UB102',
    serial: 'W4J0XYZ9',
    size: 2000398934016,
    temperature: null,
    power: 'standby',
    health: 'good',
  },
  {
    id: '25094e763555',
    devicename: 'nvme0n1',
    devicefile: '/dev/nvme0n1',
    model: 'CT1000P310SSD8',
    serial: '25094E763555',
    size: 1000204886016,
    temperature: 41,
    power: 'unknown',
    health: 'good',
  },
];
const fs = (id, label, type, size, used, threshold = 85) => ({
  id,
  label,
  type,
  mountpoint: `/srv/dev-disk-by-uuid-${id}`,
  size,
  available: size * (1 - used / 100),
  used,
  threshold,
});
const filesystems = [
  fs('956cfefe', 'data', 'ext4', 3.64 * TIB, 81.4),
  fs('2b9d2a4e', 'backup', 'btrfs', 1.82 * TIB, 47.0),
  { ...fs('4f2d7c3a', null, 'ext4', 230 * GIB, 19.0), devicename: 'nvme0n1p2', mountpoint: '/' },
];
const services = [
  { id: 'samba', title: 'SMB/CIFS', enabled: true, running: true },
  { id: 'nfs', title: 'NFS', enabled: true, running: true },
  { id: 'ssh', title: 'SSH', enabled: true, running: true },
];
const history = usage(7);

const contents = {};
for (const language of LANGUAGES) {
  const one = buildStorageWidget({
    filesystems,
    language,
    pollSeconds: 60,
    chosen: filesystems[0],
    interval: 'last-week',
    featureId: (key) => `ext:openmediavault:filesystem:956cfefe:${key}`,
  });
  // The front reads the history of a device-bound chart from Gladys, and
  // names the series after the feature.
  one.components = one.components.map((component) =>
    component.type === 'chart'
      ? { ...component, series: [{ name: t('featureUsed', language), points: history }] }
      : component,
  );
  contents[language] = {
    overview: buildOverviewWidget({
      system,
      disks,
      services,
      missing: [],
      language,
      now: NOW,
      fetchedAt: NOW - 40000,
      pollSeconds: 60,
    }),
    storage: buildStorageWidget({ filesystems, language, pollSeconds: 60 }),
    storage_one: one,
    disks: buildDisksWidget({
      disks,
      language,
      now: NOW,
      pollSeconds: 60,
      smartHealth: 'awake',
      smartAt: NOW - 37 * MINUTE,
      smartWaiting: false,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
widgets.storage_one = widgets.storage;
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
