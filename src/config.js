// -----------------------------------------------------------------------------
// Configuration of the OpenMediaVault integration.
//
// Fields of the config_schema:
//   - `url`            address of the OpenMediaVault web interface
//                      (http://192.168.1.10, a port is allowed);
//   - `username`       an account of the web interface with the admin role
//                      (`admin`, or a user of the openmediavault-admin group);
//   - `password`       its password (a `secret`: never sent back to the UI,
//                      never logged);
//   - `verify_tls`     check the HTTPS certificate (off by default: the
//                      certificate of a NAS is often self-signed);
//   - `poll_interval`  how often the NAS is read, in seconds;
//   - `smart_health`   when the S.M.A.R.T. health of the disks is read:
//                      `awake` (only while every disk spins, so that a disk
//                      in standby is never woken up), `always`, `off`;
//   - `language`       language of the texts Gladys does not ask for in a
//                      language (feature names, scene summaries): `auto`
//                      follows the language of the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language`  language of the last widget request, kept for the
//                      texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

// OpenMediaVault measures the CPU over one second for each reading; 60 s
// follows the NAS without loading it, and keeps the web session alive (the
// default session timeout of OpenMediaVault is 5 minutes).
const POLL_INTERVAL = { min: 15, max: 240, default: 60 };
const SMART_HEALTH = ['awake', 'always', 'off'];
const DEFAULT_SMART_HEALTH = 'awake';
const DEFAULT_USERNAME = 'admin';
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('60', POLL_INTERVAL); // -> 60
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description The base URL of the web interface: http by default (the
 * default of OpenMediaVault), no path, no trailing slash. Null when it cannot
 * be an URL.
 * @param {unknown} raw - What the user typed.
 * @returns {string|null} The URL.
 * @example
 * normalizeUrl('192.168.1.10/'); // -> 'http://192.168.1.10'
 */
function normalizeUrl(raw) {
  const text = readString(raw);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) {
      return null;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * @description Read a boolean field (the form can send strings).
 * @param {unknown} raw - The raw value.
 * @param {boolean} fallback - The default.
 * @returns {boolean} The value.
 */
function readBoolean(raw, fallback) {
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (raw === 'true' || raw === '1' || raw === 1) {
    return true;
  }
  if (raw === 'false' || raw === '0' || raw === 0) {
    return false;
  }
  return fallback;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The config: `{ url, username, password, verifyTls,
 * pollInterval (s), smartHealth, language }`.
 * @example
 * normalizeConfig({ url: '192.168.1.10', username: 'admin', password: 'p' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    url: normalizeUrl(config.url),
    username: readString(config.username) || DEFAULT_USERNAME,
    // A secret is kept as typed.
    password: typeof config.password === 'string' ? config.password : '',
    verifyTls: readBoolean(config.verify_tls, false),
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    smartHealth: SMART_HEALTH.includes(config.smart_health)
      ? config.smart_health
      : DEFAULT_SMART_HEALTH,
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Whether the NAS can be read.
 * @param {object} config - A normalized config.
 * @returns {boolean} True with an address, a user and a password.
 */
const hasCredentials = (config) => Boolean(config.url && config.username && config.password);

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  POLL_INTERVAL,
  SMART_HEALTH,
  DEFAULT_SMART_HEALTH,
  DEFAULT_USERNAME,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeUrl,
  normalizeConfig,
  hasCredentials,
  readLanguage,
};
