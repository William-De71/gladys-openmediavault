// -----------------------------------------------------------------------------
// What the integration keeps between restarts, in /data (the only writable
// path of the container): the browser cookie of OpenMediaVault.
//
// At the first login from a browser it does not know, OpenMediaVault e-mails
// the user ("your user account was used to log in...") and sets a cookie
// OPENMEDIAVAULT-LOGIN-<hash> valid 60 days. Keeping it means one e-mail when
// the integration is set up, not one at every restart of the container. The
// cookie is no credential: its name is a hash of the user name, its value a
// quote. The session cookie is never written.
//
// File: { "version": 1, "cookies": { "OPENMEDIAVAULT-LOGIN-…": "…" } }.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
// A handful of cookies at most; anything bigger is not ours.
const MAX_COOKIES = 10;

/**
 * @description Create the store.
 * @param {object} [options] - Options.
 * @param {string} [options.path] - The JSON file.
 * @param {object} options.logger - Logger.
 * @returns {object} The store.
 * @example
 * const store = createStore({ logger });
 * await store.load();
 */
function createStore({ path = DEFAULT_PATH, logger }) {
  let cookies = {};
  let saving = Promise.resolve();

  /**
   * @description Write the file (atomically, one write at a time).
   * @returns {Promise<void>}
   */
  function save() {
    const content = JSON.stringify({ version: 1, cookies });
    saving = saving.then(async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, content, { mode: 0o600 });
        await rename(`${path}.tmp`, path);
      } catch (err) {
        logger.warn(`Unable to write ${path}: ${err.message}`);
      }
    });
    return saving;
  }

  return {
    /**
     * @description Read the file; a missing or broken file starts empty.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const data = JSON.parse(await readFile(path, 'utf8'));
        const entries = Object.entries(data?.cookies ?? {}).filter(
          ([name, value]) => typeof name === 'string' && typeof value === 'string',
        );
        cookies = Object.fromEntries(entries.slice(0, MAX_COOKIES));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Unable to read ${path}: ${err.message}`);
        }
        cookies = {};
      }
    },
    /** @returns {object} The kept cookies, name -> value. */
    cookies: () => ({ ...cookies }),
    /**
     * @description Replace the kept cookies, and save them when they changed.
     * @param {object} next - name -> value.
     * @returns {Promise<void>}
     */
    async setCookies(next) {
      const kept = Object.fromEntries(Object.entries(next ?? {}).slice(0, MAX_COOKIES));
      if (JSON.stringify(kept) === JSON.stringify(cookies)) {
        return;
      }
      cookies = kept;
      await save();
    },
    /** @returns {Promise<void>} Resolves once every pending write is done. */
    flush: () => saving,
    /** @description Forget everything (another NAS or account). */
    async clear() {
      cookies = {};
      saving = saving.then(() => unlink(path).catch(() => {}));
      await saving;
    },
  };
}

export { createStore, DEFAULT_PATH };
