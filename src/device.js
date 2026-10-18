// -----------------------------------------------------------------------------
// The devices of the OpenMediaVault integration, offered on the Discovery
// screen.
//
// Category / type pairs come from DEVICE_FEATURE_CATEGORIES of the SDK, with
// an icon and a unit list in the Gladys front (front/src/utils/consts.js,
// server/utils/constants.js, master of 2026-10-17). Gladys has no CPU nor
// memory category: `level-sensor` / `decimal` in % is its plain numeric
// level, the name of each feature tells them apart.
//
// One NAS, "OpenMediaVault <hostname>":
//   - cpu, memory          level-sensor / decimal, %
//   - uptime               duration / decimal, days
//   - updates              counter-sensor / integer: packages to upgrade
//   - version              text / text
// One device per disk, "Disk <model> (…<end of serial>)":
//   - temperature          device-temperature-sensor / decimal, °C
//   - power                text / text: active, standby, unknown
//   - health               text / text: the S.M.A.R.T. overall status
// One device per mounted file system, "File system <label>":
//   - used                 level-sensor / decimal, %
//   - free                 data / size, GB (decimal gigabytes)
// One device per enabled service, "Service <title>":
//   - running              switch / binary, read-only (a state, no command:
//                          the front shows it as an On / Off badge)
//
// External ids: the NAS is "main" (one per integration), a disk its serial
// number (else its WWN), a file system its UUID (else a hash of its mount
// point), a service its OpenMediaVault name (smb, nfs, ssh...). Never a
// device file name: /dev/sda can become /dev/sdb at the next boot.
//
// The NAS is read on the integration's own timer (one round for every
// device), so `should_poll` is false.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const DEVICE_TYPES = {
  NAS: 'nas',
  DISK: 'disk',
  FILESYSTEM: 'filesystem',
  SERVICE: 'service',
};
const NAS_ID = 'main';
const GIGABYTE = 1e9;
// The largest volume a NAS holds, in GB (1 EB).
const MAX_GIGABYTES = 1000000000;

const sensor = { read_only: true, has_feedback: false, keep_history: true };
const text = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
};
const percent = {
  ...sensor,
  category: CATEGORIES.LEVEL_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.PERCENT,
  min: 0,
  max: 100,
};

// The features of each device: key, name (TEXTS key), shape, and the state
// of a snapshot (a number, `{ text }`, or null when unknown: not published).
const NAS_FEATURES = [
  { key: 'cpu', name: 'featureCpu', shape: percent, state: (s) => s.cpu },
  { key: 'memory', name: 'featureMemory', shape: percent, state: (s) => s.memory },
  {
    key: 'uptime',
    name: 'featureUptime',
    shape: {
      ...sensor,
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.DAYS,
      min: 0,
      max: 10000,
    },
    state: (s) => s.uptimeDays,
  },
  {
    key: 'updates',
    name: 'featureUpdates',
    shape: {
      ...sensor,
      category: CATEGORIES.COUNTER_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      min: 0,
      max: 10000,
    },
    state: (s) => s.updates,
  },
  {
    key: 'version',
    name: 'featureVersion',
    shape: text,
    state: (s) => (s.version ? { text: s.version } : null),
  },
];

const DISK_FEATURES = [
  {
    key: 'temperature',
    name: 'featureTemperature',
    shape: {
      ...sensor,
      category: CATEGORIES.DEVICE_TEMPERATURE_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.CELSIUS,
      min: 0,
      max: 100,
    },
    state: (d) => d.temperature,
  },
  {
    key: 'power',
    name: 'featurePower',
    shape: text,
    // An unknown power mode (no smartctl support, OpenMediaVault 6) says nothing.
    state: (d, language) =>
      d.power === 'unknown' ? null : { text: t(`power_${d.power}`, language) },
  },
  {
    key: 'health',
    name: 'featureHealth',
    shape: text,
    state: (d, language) => (d.health ? { text: t(`health_${d.health}`, language) } : null),
  },
];

const FILESYSTEM_FEATURES = [
  { key: 'used', name: 'featureUsed', shape: percent, state: (f) => f.used },
  {
    key: 'free',
    name: 'featureFree',
    shape: {
      ...sensor,
      category: CATEGORIES.DATA,
      type: TYPES.DATA.SIZE,
      unit: UNITS.GIGABYTE,
      min: 0,
      max: MAX_GIGABYTES,
    },
    state: (f) =>
      typeof f.available === 'number' ? Math.round((f.available / GIGABYTE) * 10) / 10 : null,
  },
];

const SERVICE_FEATURES = [
  {
    key: 'running',
    name: 'featureRunning',
    shape: {
      ...sensor,
      category: CATEGORIES.SWITCH,
      type: TYPES.SWITCH.BINARY,
      min: 0,
      max: 1,
    },
    state: (s) => (s.running ? 1 : 0),
  },
];

const SPECS = {
  [DEVICE_TYPES.NAS]: NAS_FEATURES,
  [DEVICE_TYPES.DISK]: DISK_FEATURES,
  [DEVICE_TYPES.FILESYSTEM]: FILESYSTEM_FEATURES,
  [DEVICE_TYPES.SERVICE]: SERVICE_FEATURES,
};

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The platform id.
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, 'disk', 'wd-wcav1b245569').device; // -> 'ext:openmediavault:disk:wd-wcav1b245569'
 */
function idsOf(gladys, type, id) {
  return gladys.externalIds(type, id);
}

const ID_PATTERN = '[a-z0-9-]+';

/**
 * @description The platform id a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @param {string} type - A DEVICE_TYPES value.
 * @returns {string|null} The id.
 * @example
 * idFromExternalId('ext:openmediavault:service:smb:running', 'service'); // -> 'smb'
 */
function idFromExternalId(externalId, type) {
  const match = new RegExp(`:${type}:(${ID_PATTERN})(?::[a-z0-9_]+)?$`).exec(
    String(externalId ?? ''),
  );
  return match ? match[1] : null;
}

/**
 * @description A feature of a spec.
 * @param {object} ids - The ids of the device.
 * @param {object} spec - The feature spec.
 * @param {string} language - Language of the name.
 * @returns {object} The feature.
 */
const featureOf = (ids, spec, language) => ({
  name: t(spec.name, language),
  external_id: ids.feature(spec.key),
  ...spec.shape,
});

/**
 * @description The states of a device, given its snapshot.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The platform id.
 * @param {object} snapshot - The snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildStates(gladys, type, id, snapshot, language) {
  const ids = idsOf(gladys, type, id);
  return SPECS[type].flatMap((spec) => {
    const value = spec.state(snapshot, language);
    if (value === null || value === undefined) {
      return [];
    }
    const featureId = ids.feature(spec.key);
    return [
      typeof value === 'object'
        ? { device_feature_external_id: featureId, text: value.text }
        : { device_feature_external_id: featureId, state: value },
    ];
  });
}

/**
 * @description A discovered device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The platform id.
 * @param {string} name - The device name.
 * @param {Array<object>} params - Its parameters.
 * @param {string} language - Language of the feature names.
 * @returns {object} The device.
 */
function deviceOf(gladys, type, id, name, params, language) {
  const ids = idsOf(gladys, type, id);
  return {
    name: name.slice(0, 100),
    external_id: ids.device,
    model: 'OpenMediaVault',
    should_poll: false,
    params: params.filter((param) => param.value),
    features: SPECS[type].map((spec) => featureOf(ids, spec, language)),
  };
}

const shortHost = (system) => (system?.hostname ?? '').split('.')[0] || 'NAS';

/**
 * @description The name of a disk: its model and the end of its serial number.
 * @param {object} disk - The disk snapshot.
 * @returns {string} "WDC WD40EFRX (…5569)".
 */
function diskLabel(disk) {
  const model = disk.model ?? disk.devicename;
  const serial = disk.serial ? ` (…${disk.serial.slice(-4)})` : ` (${disk.devicename})`;
  return `${model}${serial}`;
}

/**
 * @description The name of a file system: its label, else its device, else its mount point.
 * @param {object} fs - The file system snapshot.
 * @returns {string} The name.
 */
const filesystemLabel = (fs) => fs.label ?? fs.devicename ?? fs.mountpoint ?? fs.id;

const buildNasDevice = (gladys, system, language = 'en') =>
  deviceOf(
    gladys,
    DEVICE_TYPES.NAS,
    NAS_ID,
    t('nasDeviceName', language, { name: shortHost(system) }),
    [
      { name: 'OMV_HOSTNAME', value: system?.hostname },
      { name: 'OMV_VERSION', value: system?.version },
    ],
    language,
  );

const buildDiskDevice = (gladys, disk, language = 'en') =>
  deviceOf(
    gladys,
    DEVICE_TYPES.DISK,
    disk.id,
    t('diskDeviceName', language, { name: diskLabel(disk) }),
    [
      { name: 'OMV_DISK_SERIAL', value: disk.serial },
      { name: 'OMV_DISK_DEVICE', value: disk.devicefile },
    ],
    language,
  );

const buildFilesystemDevice = (gladys, fs, language = 'en') =>
  deviceOf(
    gladys,
    DEVICE_TYPES.FILESYSTEM,
    fs.id,
    t('filesystemDeviceName', language, { name: filesystemLabel(fs) }),
    [
      { name: 'OMV_FILESYSTEM_MOUNTPOINT', value: fs.mountpoint },
      { name: 'OMV_FILESYSTEM_TYPE', value: fs.type },
    ],
    language,
  );

const buildServiceDevice = (gladys, service, language = 'en') =>
  deviceOf(
    gladys,
    DEVICE_TYPES.SERVICE,
    service.id,
    t('serviceDeviceName', language, { name: service.title }),
    [{ name: 'OMV_SERVICE', value: service.id }],
    language,
  );

export {
  DEVICE_TYPES,
  NAS_ID,
  NAS_FEATURES,
  DISK_FEATURES,
  FILESYSTEM_FEATURES,
  SERVICE_FEATURES,
  idsOf,
  idFromExternalId,
  shortHost,
  diskLabel,
  filesystemLabel,
  buildStates,
  buildNasDevice,
  buildDiskDevice,
  buildFilesystemDevice,
  buildServiceDevice,
};
