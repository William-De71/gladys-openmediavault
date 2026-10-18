// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  DEVICE_TYPES,
  NAS_ID,
  buildNasDevice,
  buildDiskDevice,
  buildFilesystemDevice,
  buildServiceDevice,
  buildStates,
  idFromExternalId,
  diskLabel,
} from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, DATA_UUID, HDD_SERIAL } from './helpers/fixtures.js';

const system = { hostname: 'nas.home.lan', version: '8.5.12-1' };
const disk = {
  id: HDD_SERIAL.toLowerCase(),
  devicename: 'sda',
  devicefile: '/dev/sda',
  model: 'WDC WD40EFRX-68N32N0',
  serial: HDD_SERIAL,
  temperature: 36,
  power: 'active',
  health: 'good',
};
const fs = {
  id: DATA_UUID,
  label: 'data',
  mountpoint: '/srv/data',
  type: 'ext4',
  used: 81,
  available: 758.7e9,
};
const service = { id: 'samba', title: 'SMB/CIFS', enabled: true, running: true };

/**
 * @description Every device, in a language.
 * @param {string} language - The language.
 * @returns {Array<object>} The devices.
 */
const devices = (language) => [
  buildNasDevice(fakeGladys, system, language),
  buildDiskDevice(fakeGladys, disk, language),
  buildFilesystemDevice(fakeGladys, fs, language),
  buildServiceDevice(fakeGladys, service, language),
];

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core (server/utils/constants.js,
// master of 2026-10-17), for the categories used here.
const UNITS = {
  'level-sensor': [DEVICE_FEATURE_UNITS.PERCENT],
  'device-temperature-sensor': [DEVICE_FEATURE_UNITS.CELSIUS, DEVICE_FEATURE_UNITS.FAHRENHEIT],
  duration: [DEVICE_FEATURE_UNITS.DAYS],
  data: [DEVICE_FEATURE_UNITS.GIGABYTE],
};
// Pairs with an icon in the Gladys front (front/src/utils/consts.js).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DEVICE_TEMPERATURE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER],
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT],
  [DEVICE_FEATURE_CATEGORIES.DATA, DEVICE_FEATURE_TYPES.DATA.SIZE],
  [DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(typeof feature.read_only, 'boolean', feature.external_id);
        assert.equal(typeof feature.has_feedback, 'boolean', feature.external_id);
        assert.ok(feature.name, feature.external_id);
      }
    }
  }
});

test('every category / type pair has an icon in Gladys, every unit belongs to its category', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (feature.unit) {
        assert.ok(
          UNITS[feature.category]?.includes(feature.unit),
          `${feature.external_id}: ${feature.unit}`,
        );
      }
    }
  }
});

test('every feature is a read-only state: no command', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.equal(feature.read_only, true, feature.external_id);
      assert.equal(feature.has_feedback, false, feature.external_id);
    }
  }
});

test('names tell the devices apart, in the language of the user', () => {
  assert.deepEqual(
    devices('fr').map((device) => device.name),
    [
      'OpenMediaVault nas',
      'Disque WDC WD40EFRX-68N32N0 (…CDEF)',
      'Système de fichiers data',
      'Service SMB/CIFS',
    ],
  );
  assert.equal(diskLabel({ devicename: 'sdc', model: null, serial: null }), 'sdc (sdc)');
  assert.deepEqual(devices('en')[1].params, [
    { name: 'OMV_DISK_SERIAL', value: HDD_SERIAL },
    { name: 'OMV_DISK_DEVICE', value: '/dev/sda' },
  ]);
});

test('external ids are built on stable platform ids and read back', () => {
  const ids = devices('en').map((device) => device.external_id);
  assert.deepEqual(ids, [
    'ext:test-integration:nas:main',
    'ext:test-integration:disk:wd-wcc7k1abcdef',
    `ext:test-integration:filesystem:${DATA_UUID}`,
    'ext:test-integration:service:samba',
  ]);
  assert.equal(idFromExternalId(`${ids[1]}:temperature`, 'disk'), 'wd-wcc7k1abcdef');
  assert.equal(idFromExternalId(ids[2], 'filesystem'), DATA_UUID);
  assert.equal(idFromExternalId(ids[2], 'disk'), null);
  assert.equal(idFromExternalId(undefined, 'disk'), null);
});

test('states: texts in the language, unknown values not published', () => {
  assert.deepEqual(buildStates(fakeGladys, DEVICE_TYPES.DISK, disk.id, disk, 'de'), [
    { device_feature_external_id: `ext:test-integration:disk:${disk.id}:temperature`, state: 36 },
    { device_feature_external_id: `ext:test-integration:disk:${disk.id}:power`, text: 'Aktiv' },
    { device_feature_external_id: `ext:test-integration:disk:${disk.id}:health`, text: 'Gut' },
  ]);
  assert.deepEqual(
    buildStates(
      fakeGladys,
      DEVICE_TYPES.DISK,
      disk.id,
      { ...disk, temperature: null, power: 'unknown', health: null },
      'en',
    ),
    [],
  );
  assert.deepEqual(
    buildStates(
      fakeGladys,
      DEVICE_TYPES.NAS,
      NAS_ID,
      { cpu: 12.5, memory: null, version: '8.5.12-1' },
      'en',
    ),
    [
      { device_feature_external_id: 'ext:test-integration:nas:main:cpu', state: 12.5 },
      { device_feature_external_id: 'ext:test-integration:nas:main:version', text: '8.5.12-1' },
    ],
  );
  assert.deepEqual(buildStates(fakeGladys, DEVICE_TYPES.FILESYSTEM, fs.id, fs, 'en'), [
    { device_feature_external_id: `ext:test-integration:filesystem:${DATA_UUID}:used`, state: 81 },
    {
      device_feature_external_id: `ext:test-integration:filesystem:${DATA_UUID}:free`,
      state: 758.7,
    },
  ]);
  assert.deepEqual(
    buildStates(fakeGladys, DEVICE_TYPES.SERVICE, 'samba', { ...service, running: false }, 'en'),
    [{ device_feature_external_id: 'ext:test-integration:service:samba:running', state: 0 }],
  );
});
