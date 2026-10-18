// Scene trigger payloads: flat, scalar, within the limits of the core, and
// every key a declared variable; action outputs: the declared ones only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TRIGGERS,
  connectionEvent,
  rebootEvent,
  updatesEvent,
  rebootRequiredEvent,
  healthEvent,
  usageEvent,
  mountEvent,
  serviceEvent,
  statusOutputs,
  updatesOutputs,
} from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, DATA_UUID, HDD_SERIAL, NOW, MINUTE } from './helpers/fixtures.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const triggers = byKey(manifest.scene_triggers);
const actions = byKey(manifest.scene_actions);

const system = {
  hostname: 'nas.home.lan',
  version: '8.5.12-1',
  cpu: 12.5,
  memory: 26.4,
  uptimeSeconds: 180,
  uptimeDays: 0,
  updates: 3,
  rebootRequired: true,
};
const disk = {
  id: HDD_SERIAL.toLowerCase(),
  devicename: 'sda',
  devicefile: '/dev/sda',
  model: 'WDC WD40EFRX',
  serial: HDD_SERIAL,
  temperature: 36,
  power: 'active',
  health: 'bad',
  status: 'BAD_SECTOR',
};
const fs = {
  id: DATA_UUID,
  label: 'data',
  mountpoint: '/srv/data',
  type: 'ext4',
  used: 86,
  threshold: 85,
  available: 500e9,
  size: 4000e9,
};
const service = { id: 'samba', title: 'SMB/CIFS', enabled: true, running: false };

/**
 * @description Every event, in a language.
 * @param {string} language - The language.
 * @returns {Array<{ key: string, data: object }>} The events.
 */
const events = (language) => [
  connectionEvent(system, { state: 'lost', downSince: NOW }, NOW + MINUTE, language),
  connectionEvent(system, { state: 'restored', downSince: NOW }, NOW + 7 * MINUTE, language),
  rebootEvent(system, language),
  updatesEvent(system, language),
  rebootRequiredEvent(system, language),
  healthEvent(fakeGladys, { disk, previous: 'good' }, language),
  healthEvent(fakeGladys, { disk: { ...disk, health: 'warning' }, previous: 'good' }, language),
  healthEvent(fakeGladys, { disk: { ...disk, health: 'good' }, previous: 'bad' }, language),
  usageEvent(fakeGladys, { fs, state: 'above' }, language),
  usageEvent(fakeGladys, { fs: { ...fs, used: 60 }, state: 'below' }, language),
  mountEvent(fakeGladys, fs, 'missing', language),
  mountEvent(fakeGladys, fs, 'mounted', language),
  serviceEvent(fakeGladys, { service }, language),
  serviceEvent(fakeGladys, { service: { ...service, running: true } }, language),
];

test('every trigger of the code is declared, and every event fits the limits of the core', () => {
  assert.deepEqual(
    [...new Set(events('en').map((event) => event.key))].sort(),
    Object.values(TRIGGERS).sort(),
  );
  for (const language of LANGUAGES) {
    for (const { key, data } of events(language)) {
      const declared = triggers.get(key);
      assert.ok(declared, key);
      const variables = new Set(declared.variables.map((variable) => variable.key));
      assert.ok(Object.keys(data).length <= 30, key);
      for (const [name, value] of Object.entries(data)) {
        assert.ok(variables.has(name), `${key}.${name} is a declared variable`);
        const type = declared.variables.find((variable) => variable.key === name).type;
        assert.equal(typeof value, type, `${key}.${name}`);
        if (typeof value === 'string') {
          assert.ok(value.length <= 1000, `${key}.${name}`);
        } else {
          assert.ok(Number.isFinite(value), `${key}.${name}`);
        }
      }
      // A field filters on the data key of the same name.
      for (const field of declared.fields ?? []) {
        assert.ok(field.key in data, `${key}: field ${field.key}`);
        for (const option of field.options ?? []) {
          assert.ok(
            events('en').some(
              (event) => event.key === key && event.data[field.key] === option.value,
            ),
            `${key}.${field.key}: ${option.value} is produced`,
          );
        }
      }
    }
  }
});

test('summaries read naturally', () => {
  const fr = events('fr').map((event) => event.data.summary);
  assert.deepEqual(fr, [
    'nas ne répond plus.',
    'nas répond de nouveau après 7 min.',
    'nas a redémarré.',
    '3 mises à jour disponibles. Un redémarrage est nécessaire.',
    'nas doit redémarrer pour terminer ses mises à jour.',
    'Le disque WDC WD40EFRX (…CDEF) est défaillant (BAD_SECTOR) : sauvegardez ses données.',
    'Disque WDC WD40EFRX (…CDEF) : le S.M.A.R.T. signale un problème passé (BAD_SECTOR).',
    'Disque WDC WD40EFRX (…CDEF) : la santé S.M.A.R.T. est de nouveau bonne.',
    'data est plein à 86 % (seuil 85 %), 466 GiB libres.',
    'data repasse sous 85 % (60 %).',
    'Le système de fichiers data (/srv/data) n’est plus monté.',
    'Le système de fichiers data est monté sur /srv/data.',
    'Le service SMB/CIFS s’est arrêté.',
    'Le service SMB/CIFS a démarré.',
  ]);
  assert.equal(events('en')[1].data.down_minutes, 7);
  assert.equal(events('en')[0].data.down_minutes, -1);
});

test('the outputs of get_status and check_updates are exactly the declared ones', () => {
  const snapshot = {
    system,
    disks: [disk, { ...disk, id: 'b', health: 'good', temperature: 41 }],
    filesystems: [fs, { ...fs, id: 'c', used: 12 }],
    missing: [{ ...fs, id: 'd' }],
    services: [service, { id: 'ssh', title: 'SSH', enabled: true, running: true }],
  };
  for (const language of LANGUAGES) {
    const status = statusOutputs(snapshot, language);
    assert.deepEqual(
      Object.keys(status).sort(),
      actions
        .get('get_status')
        .outputs.map((output) => output.key)
        .sort(),
    );
    for (const output of actions.get('get_status').outputs) {
      assert.equal(typeof status[output.key], output.type, output.key);
    }
    const updates = updatesOutputs(system, language);
    assert.deepEqual(
      Object.keys(updates).sort(),
      actions
        .get('check_updates')
        .outputs.map((output) => output.key)
        .sort(),
    );
  }
  const status = statusOutputs(snapshot, 'en');
  assert.equal(status.disks_failing, 1);
  assert.equal(status.disk_temperature_max, 41);
  assert.equal(status.services_stopped, 1);
  assert.equal(status.reboot_required, 1);
  assert.equal(
    status.summary,
    'nas: CPU 13 %, memory 26 %. Fullest file system: data (86 %). 1 disk has S.M.A.R.T. problems. ' +
      '1 file system is not mounted. Stopped: SMB/CIFS. 3 updates available. A reboot is required.',
  );
  // Nothing known: -1 and empty texts, never null.
  const empty = statusOutputs(
    { system: null, disks: [], filesystems: [], missing: [], services: [] },
    'en',
  );
  assert.equal(empty.cpu, -1);
  assert.equal(empty.storage_used_max, -1);
  assert.equal(empty.version, '');
  assert.ok(Object.values(empty).every((value) => value !== null && value !== undefined));
});

test('the declared outputs of run_rsync_job match the code', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const outputs = actions.get('run_rsync_job').outputs.map((output) => output.key);
  assert.deepEqual(outputs, ['job', 'status', 'message']);
  assert.match(app, /return \{ job: job\.name, status, message: lastLines\(result\.output\) \};/);
});
