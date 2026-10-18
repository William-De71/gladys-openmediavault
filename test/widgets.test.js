// Widget contents: what the core keeps (validateWidgetContent), the budget
// of a card, and the texts in the four languages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  WIDGET_ACTIONS,
  clip,
  messageContent,
  formatUptime,
  readStorageSettings,
  buildOverviewWidget,
  buildStorageWidget,
  buildDisksWidget,
  DEFAULT_INTERVAL,
} from '../src/widgets.js';
import { readSystem, readDisks, readSmart, readFilesystems, readServices } from '../src/read.js';
import { LANGUAGES } from '../src/i18n.js';
import { defaultAnswers, NOW, MINUTE } from './helpers/fixtures.js';

const raw = defaultAnswers();
const system = readSystem(raw['System.getInformation']);
const disks = readDisks(raw['DiskMgmt.enumerateDevices'], readSmart(raw['Smart.getList']));
const filesystems = readFilesystems(raw['FileSystemMgmt.enumerateMountedFilesystems']);
const services = readServices(raw['Services.getStatus']);

const overview = (language, extra = {}) =>
  buildOverviewWidget({
    system,
    disks,
    services,
    missing: [],
    language,
    now: NOW,
    fetchedAt: NOW - 2 * MINUTE,
    pollSeconds: 60,
    ...extra,
  });
const storage = (language, extra = {}) =>
  buildStorageWidget({ filesystems, language, pollSeconds: 60, ...extra });
const disksWidget = (language, extra = {}) =>
  buildDisksWidget({
    disks,
    language,
    now: NOW,
    pollSeconds: 60,
    smartHealth: 'awake',
    smartAt: NOW - 30 * MINUTE,
    smartWaiting: false,
    ...extra,
  });

/**
 * @description Check a content: valid for the core, within the budget of a card.
 * @param {object} content - The content.
 * @param {string} label - What it is.
 */
function assertValid(content, label) {
  const report = validateWidgetContent(content);
  assert.deepEqual(report.problems ?? report.warnings ?? [], [], label);
  const { components } = content;
  assert.ok(components.length <= 8, `${label}: ${components.length} components`);
  const count = (types) => components.filter((c) => types.includes(c.type)).length;
  assert.ok(count(['chart', 'card-list', 'image']) <= 1, label);
  assert.ok(count(['value', 'gauge']) <= 6, label);
  assert.ok(count(['text']) <= 2, label);
  assert.ok(count(['status']) <= 1, label);
  assert.ok(count(['button']) <= 4, label);
}

test('every content is valid in the four languages, every case', () => {
  for (const language of LANGUAGES) {
    assertValid(overview(language), `overview ${language}`);
    assertValid(
      overview(language, {
        system: { ...system, updates: 4, rebootRequired: true },
        disks: [{ ...disks[0], health: 'bad' }, disks[1]],
        services: services.map((s) => ({ ...s, running: false })),
        missing: [filesystems[2]],
      }),
      `overview with problems ${language}`,
    );
    assertValid(storage(language), `storage ${language}`);
    assertValid(storage(language, { missing: [filesystems[2]] }), `storage missing ${language}`);
    assertValid(
      storage(language, {
        chosen: filesystems[1],
        featureId: (key) => `ext:x:filesystem:y:${key}`,
      }),
      `storage one ${language}`,
    );
    assertValid(storage(language, { filesystems: [] }), `storage empty ${language}`);
    assertValid(disksWidget(language), `disks ${language}`);
    assertValid(disksWidget(language, { disks: [] }), `no disks ${language}`);
    assertValid(
      disksWidget(language, { smartAt: null, smartWaiting: true }),
      `waiting ${language}`,
    );
  }
});

test('overview: gauges, status rows, the three buttons with a confirmation for power', () => {
  const content = overview('en');
  assert.equal(content.components[0].text, 'nas · OpenMediaVault 8.5.12-1 · 2 min ago');
  assert.deepEqual(
    content.components.filter((c) => c.type === 'gauge').map((c) => [c.label, c.value, c.color]),
    [
      ['CPU', 12.5, 'success'],
      ['Memory', 26.4, 'success'],
    ],
  );
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ['Uptime', '17 d 3 h'],
      ['Updates', 'Up to date'],
      ['Disks', '3 · up to 41 °C'],
      ['Services', '2 running'],
    ],
  );
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => [b.action.key, b.action.confirm ?? false]),
    [
      [WIDGET_ACTIONS.CHECK_UPDATES, false],
      [WIDGET_ACTIONS.REBOOT, true],
      [WIDGET_ACTIONS.SHUTDOWN, true],
    ],
  );
  const problems = overview('fr', {
    system: { ...system, cpu: null, updates: 1, rebootRequired: true },
    disks: [{ ...disks[0], health: 'bad' }],
    services: [{ id: 'samba', title: 'SMB/CIFS', enabled: true, running: false }],
    missing: [filesystems[2]],
  });
  assert.equal(problems.components.filter((c) => c.type === 'gauge').length, 1, 'no unknown CPU');
  assert.deepEqual(
    problems.components
      .find((c) => c.type === 'status')
      .items.map((row) => [row.label, row.value, row.color]),
    [
      ['En marche depuis', '17 j 3 h', undefined],
      ['Mises à jour', '1 disponible', 'warning'],
      ['Redémarrage', 'Nécessaire', 'warning'],
      ['Disques', '1 en défaut sur 1', 'danger'],
      ['Systèmes de fichiers', '1 manquant', 'danger'],
      ['Services', 'Arrêtés : SMB/CIFS', 'danger'],
    ],
  );
});

test('storage: the fullest first, a missing one on top, or one with its history', () => {
  const content = storage('en', { missing: [filesystems[2]] });
  assert.equal(content.components[0].text, '3 file systems · 2.97 TiB free of 7.5 TiB');
  assert.deepEqual(
    content.components[1].items.map((item) => [item.title, item.badge.text, item.badge.color]),
    [
      ['backup', 'Missing', 'danger'],
      ['data', '81 %', 'warning'],
      ['backup', '42 %', 'success'],
      ['nvme0n1p2', '19 %', 'success'],
    ],
  );
  assert.equal(content.components[1].items[1].subtitle.split(' · ')[0], '707 GiB free of 3.64 TiB');
  const one = storage('de', {
    chosen: filesystems[1],
    featureId: (key) => `ext:x:filesystem:y:${key}`,
    interval: 'last-month',
  });
  assert.deepEqual(
    one.components.map((c) => c.type),
    ['text', 'gauge', 'value', 'value', 'chart'],
  );
  assert.equal(one.components[1].color, 'warning', '81 % with a threshold of 85 %');
  assert.equal(one.components[4].interval, 'last-month');
  assert.equal(storage('en', { chosen: filesystems[1] }).components.at(-1).type, 'value');
  assert.match(storage('fr', { filesystems: [] }).components[0].text, /Aucun système de fichiers/);
  assert.deepEqual(readStorageSettings({ filesystem: 'x', interval: 'never' }), {
    filesystem: 'x',
    interval: DEFAULT_INTERVAL,
  });
});

test('disks: failing first, temperature, standby, health badge, S.M.A.R.T. age', () => {
  const content = disksWidget('fr', {
    disks: [disks[0], { ...disks[1], health: 'bad', power: 'standby' }],
  });
  assert.equal(content.components[0].text, '2 disques · S.M.A.R.T. il y a 30 min');
  assert.deepEqual(
    content.components[1].items.map((item) => [item.title, item.subtitle, item.badge.text]),
    [
      ['ST4000VN008-2DR166 (…BC12)', '38 °C · En veille · /dev/sdb · 3,64 TiB', 'Défaillant'],
      ['WDC WD40EFRX-68N32N0 (…CDEF)', '36 °C · Actif · /dev/sda · 3,64 TiB', 'Bon'],
    ],
  );
  assert.match(disksWidget('en', { smartHealth: 'off' }).components[0].text, /S\.M\.A\.R\.T\. off/);
  assert.match(
    disksWidget('en', { smartAt: null, smartWaiting: false }).components[0].text,
    /not read yet/,
  );
});

test('helpers: clip, message, uptime', () => {
  assert.equal(clip('A very long title', 10), 'A very lo…');
  assert.equal(clip(null, 5), '');
  assert.deepEqual(messageContent('Hello').components, [
    { type: 'text', variant: 'body', text: 'Hello' },
  ]);
  assert.equal(formatUptime(1.5, 'de'), '1 T. 12 Std.');
  assert.equal(formatUptime(null, 'en'), '?');
});
