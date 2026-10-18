import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  normalizeUrl,
  hasCredentials,
  readLanguage,
  POLL_INTERVAL,
} from '../src/config.js';

test('the address: http by default (the default of OpenMediaVault), no path, a port kept', () => {
  assert.equal(normalizeUrl('192.168.1.10'), 'http://192.168.1.10');
  assert.equal(
    normalizeUrl(' https://nas.home.lan:8443/#/dashboard '),
    'https://nas.home.lan:8443',
  );
  assert.equal(normalizeUrl('nas.local:8080'), 'http://nas.local:8080');
  assert.equal(normalizeUrl('ftp://10.0.0.1'), null);
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl(undefined), null);
});

test('defaults, bounds and types of every field', () => {
  const config = normalizeConfig({});
  assert.equal(config.pollInterval, POLL_INTERVAL.default);
  assert.equal(config.username, 'admin');
  assert.equal(config.verifyTls, false);
  assert.equal(config.smartHealth, 'awake');
  assert.equal(config.language, 'auto');
  assert.equal(normalizeConfig({ poll_interval: '2' }).pollInterval, POLL_INTERVAL.min);
  assert.equal(normalizeConfig({ poll_interval: 1e6 }).pollInterval, POLL_INTERVAL.max);
  assert.equal(normalizeConfig({ poll_interval: '' }).pollInterval, POLL_INTERVAL.default);
  assert.equal(normalizeConfig({ verify_tls: 'true' }).verifyTls, true);
  assert.equal(normalizeConfig({ smart_health: 'off' }).smartHealth, 'off');
  assert.equal(normalizeConfig({ smart_health: 'sometimes' }).smartHealth, 'awake');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
  assert.equal(normalizeConfig(null).url, null);
});

test('credentials need an address, a user and a password; a password is kept as typed', () => {
  const config = normalizeConfig({ url: '10.0.0.1', username: ' bob ', password: ' p w ' });
  assert.equal(config.username, 'bob');
  assert.equal(config.password, ' p w ');
  assert.equal(hasCredentials(config), true);
  assert.equal(hasCredentials(normalizeConfig({ url: '10.0.0.1', username: 'bob' })), false);
});

test('the stored language of the last widget request', () => {
  assert.equal(readLanguage({ last_language: 'de' }, 'en'), 'de');
  assert.equal(readLanguage({ last_language: 'german' }, 'en'), 'en');
  assert.equal(readLanguage(null, 'fr'), 'fr');
});
