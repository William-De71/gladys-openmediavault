import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  diffReboot,
  diffUpdates,
  diffRebootRequired,
  diffHealth,
  diffUsage,
  diffMounts,
  diffService,
} from '../src/tracker.js';

test('a restart: the uptime went back, beyond a little jitter', () => {
  assert.equal(diffReboot({ uptimeSeconds: 5000 }, { uptimeSeconds: 120 }), true);
  assert.equal(diffReboot({ uptimeSeconds: 5000 }, { uptimeSeconds: 4998 }), false);
  assert.equal(diffReboot({ uptimeSeconds: 5000 }, { uptimeSeconds: 5060 }), false);
  assert.equal(diffReboot(null, { uptimeSeconds: 120 }), false, 'baseline');
  assert.equal(diffReboot({ uptimeSeconds: null }, { uptimeSeconds: 120 }), false);
});

test('updates: they appear or grow; fewer or unknown is nothing', () => {
  assert.equal(diffUpdates({ updates: 0 }, { updates: 2 }), true);
  assert.equal(diffUpdates({ updates: 2 }, { updates: 5 }), true);
  assert.equal(diffUpdates({ updates: 5 }, { updates: 2 }), false);
  assert.equal(diffUpdates({ updates: 2 }, { updates: 2 }), false);
  assert.equal(diffUpdates({ updates: null }, { updates: 2 }), false);
  assert.equal(diffUpdates(undefined, { updates: 2 }), false);
});

test('reboot required: only when it becomes true', () => {
  assert.equal(diffRebootRequired({ rebootRequired: false }, { rebootRequired: true }), true);
  assert.equal(diffRebootRequired({ rebootRequired: true }, { rebootRequired: true }), false);
  assert.equal(diffRebootRequired(null, { rebootRequired: true }), false);
});

test('disk health: a change between two known healths', () => {
  assert.deepEqual(diffHealth({ health: 'good' }, { health: 'bad' }), { previous: 'good' });
  assert.deepEqual(diffHealth({ health: 'bad' }, { health: 'good' }), { previous: 'bad' });
  assert.equal(diffHealth({ health: null }, { health: 'bad' }), null, 'first reading');
  assert.equal(diffHealth({ health: 'good' }, { health: null }), null, 'not read now');
  assert.equal(diffHealth(undefined, { health: 'bad' }), null);
});

test('usage: the crossing of the threshold, both ways, never without one', () => {
  assert.equal(diffUsage({ used: 84, threshold: 85 }, { used: 85, threshold: 85 }), 'above');
  assert.equal(diffUsage({ used: 90, threshold: 85 }, { used: 84.9, threshold: 85 }), 'below');
  assert.equal(diffUsage({ used: 90, threshold: 85 }, { used: 95, threshold: 85 }), null);
  assert.equal(diffUsage({ used: 10, threshold: null }, { used: 99, threshold: null }), null);
  assert.equal(diffUsage(undefined, { used: 99, threshold: 85 }), null);
});

test('mounts: missing and mounted ids, nothing from the baseline', () => {
  assert.deepEqual(diffMounts(new Set(['a', 'b']), new Set(['b', 'c'])), {
    missing: ['a'],
    mounted: ['c'],
  });
  assert.deepEqual(diffMounts(null, new Set(['a'])), { missing: [], mounted: [] });
});

test('services: an enabled service that starts or stops', () => {
  assert.equal(diffService({ running: true }, { enabled: true, running: false }), true);
  assert.equal(diffService({ running: false }, { enabled: false, running: true }), false);
  assert.equal(diffService(undefined, { enabled: true, running: true }), false);
});
