// -----------------------------------------------------------------------------
// The OpenMediaVault integration: every handler, registered on a Gladys
// client.
//
// Brings an OpenMediaVault NAS into Gladys, over the RPC API of its web
// interface on the LAN:
//   - devices (device.js): the NAS (CPU, memory, uptime, updates, version),
//     its disks (temperature, standby, S.M.A.R.T. health), its file systems
//     (space used and free) and its enabled services (running or not);
//   - scene triggers (tracker.js, events.js): NAS unreachable or back, NAS
//     restarted, updates available, reboot required, disk health changed,
//     file system above or below its warning threshold, file system missing
//     or mounted again, service started or stopped;
//   - scene actions: read the status, run an rsync job, check for updates,
//     reboot, shut down;
//   - dashboard widgets (widgets.js): overview, storage, disks.
//
// Transport: local only. Nothing leaves the network, except what
// OpenMediaVault itself contacts (its package mirrors, on an update check).
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  hasCredentials,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createOmvClient } from './omv-api.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { createWatcher } from './watcher.js';
import { readRsyncJobs } from './read.js';
import {
  DEVICE_TYPES,
  NAS_ID,
  idsOf,
  idFromExternalId,
  shortHost,
  buildStates,
  buildNasDevice,
  buildDiskDevice,
  buildFilesystemDevice,
  buildServiceDevice,
} from './device.js';
import {
  connectionEvent,
  rebootEvent,
  updatesEvent,
  rebootRequiredEvent,
  healthEvent,
  usageEvent,
  mountEvent,
  serviceEvent,
  updatesSummary,
  statusOutputs,
  updatesOutputs,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  readStorageSettings,
  buildOverviewWidget,
  buildStorageWidget,
  buildDisksWidget,
} from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const { name, version, homepage } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ACTIONS = { TEST_CONNECTION: 'test_connection' };
const SCENE_ACTIONS = {
  GET_STATUS: 'get_status',
  RUN_RSYNC_JOB: 'run_rsync_job',
  CHECK_UPDATES: 'check_updates',
  REBOOT: 'reboot',
  SHUTDOWN: 'shutdown',
};
// A background job of OpenMediaVault is read this often while a scene waits for it.
const JOB_POLL_MS = 2000;
// How long a scene action waits for its job (its timeout_seconds is 120).
const ACTION_WAIT_MS = 100000;
// A widget button must answer quickly; the job goes on after the toast.
const WIDGET_WAIT_MS = 10000;
const MAX_DELAY_S = 3600;
// The last lines of a job output kept in an action output.
const MESSAGE_LENGTH = 500;

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.request] - HTTP transport of the OpenMediaVault client (tests).
 * @param {string} [options.statePath] - File of the kept browser cookie.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {Function} [options.wait] - `(ms) => Promise` between two job readings (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, store: object, api: object, getConfig: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    request,
    statePath = DEFAULT_PATH,
    now = () => Date.now(),
    wait = (ms) => sleep(ms),
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let configLoaded = false;
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device external ids the user created (states are only published for them).
  let createdDevices = new Set();
  // Last connection status and Discovery list sent, to send them again only
  // when they change.
  let lastStatus = null;
  let lastDiscovery = null;
  // rsync job uuid -> status file of the run started from Gladys.
  const rsyncRuns = new Map();

  const store = createStore({ path: statePath, logger });
  const api = createOmvClient({
    getConfig: () => config,
    userAgent: `${name}/${version} (+${homepage})`,
    cookies: { get: () => store.cookies(), set: (cookies) => store.setCookies(cookies) },
    ...(request ? { request } : {}),
  });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language
   * (feature names, states, scene summaries and outputs).
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The multi-language message of a failed call.
   * @param {Error} err - An OmvError.
   * @returns {object} The message.
   */
  function errorMessage(err) {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    switch (err.kind) {
      case 'auth':
        return all('statusInvalidLogin');
      case 'not_admin':
        return all('statusNotAdmin');
      case 'mfa':
        return all('statusMfa');
      case 'rate_limited':
        return all('statusRateLimited');
      case 'tls':
        return all('statusTls');
      case 'not_found':
      case 'http':
        return all('statusNotOmv', { url: config.url });
      case 'rpc':
        return all('statusRpc', { message: String(err.message).slice(0, 120) });
      default:
        return all('statusUnreachable', { url: config.url });
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  const isCreated = (type, id) => createdDevices.has(idsOf(gladys, type, id).device);

  /**
   * @description Publish the states of the created devices. The SDK remembers
   * what it sent (publishChangedStates) and forgets a device when the user
   * creates it: its states then go out again in full.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = [];
    const system = watcher.system();
    if (system && isCreated(DEVICE_TYPES.NAS, NAS_ID)) {
      states.push(...buildStates(gladys, DEVICE_TYPES.NAS, NAS_ID, system, lang));
    }
    const groups = [
      [DEVICE_TYPES.DISK, watcher.disks()],
      [DEVICE_TYPES.FILESYSTEM, watcher.filesystems()],
      [DEVICE_TYPES.SERVICE, watcher.services()],
    ];
    for (const [type, snapshots] of groups) {
      snapshots
        .filter((snapshot) => isCreated(type, snapshot.id))
        .forEach((snapshot) =>
          states.push(...buildStates(gladys, type, snapshot.id, snapshot, lang)),
        );
    }
    if (states.length > 0) {
      await gladys.publishChangedStates(states);
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  /**
   * @description Ask the dashboards to read the widgets again.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  /**
   * @description Publish a scene event; a failure is only logged.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<void>}
   */
  async function publishEvent({ key, data }) {
    logger.info(`Scene event ${key}: ${data.summary}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  /**
   * @description The devices offered on the Discovery screen.
   * @returns {Array<object>} The devices.
   */
  function discoveredDevices() {
    const system = watcher.system();
    if (!hasCredentials(config) || !system) {
      return [];
    }
    const lang = textLanguage();
    return [
      buildNasDevice(gladys, system, lang),
      ...watcher.disks().map((disk) => buildDiskDevice(gladys, disk, lang)),
      ...watcher.filesystems().map((fs) => buildFilesystemDevice(gladys, fs, lang)),
      ...watcher
        .services()
        .filter((service) => service.enabled || isCreated(DEVICE_TYPES.SERVICE, service.id))
        .map((service) => buildServiceDevice(gladys, service, lang)),
    ];
  }

  /**
   * @description Offer the devices, only when the list changed.
   * @param {boolean} [force] - Send it even when unchanged.
   * @returns {Promise<number>} How many devices are offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices = discoveredDevices();
    const signature = JSON.stringify(
      devices.map((d) => [d.external_id, d.name, d.features.length]),
    );
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  /**
   * @description The connection status of a NAS that answered.
   * @returns {object} The message.
   */
  const connectedMessage = () =>
    all('statusConnected', {
      name: shortHost(watcher.system()),
      version: watcher.system()?.version ?? '?',
    });

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    api,
    getConfig: () => config,
    isEnabled: () => hasCredentials(config),
    onRound: async (round) => {
      const lang = textLanguage();
      const system = watcher.system();
      if (!round.baseline) {
        if (round.rebooted) {
          await publishEvent(rebootEvent(system, lang));
        }
        if (round.updates) {
          await publishEvent(updatesEvent(system, lang));
        }
        if (round.rebootRequired) {
          await publishEvent(rebootRequiredEvent(system, lang));
        }
        for (const change of round.health) {
          await publishEvent(healthEvent(gladys, change, lang));
        }
        for (const change of round.usage) {
          await publishEvent(usageEvent(gladys, change, lang));
        }
        for (const fs of round.mounts.missing) {
          await publishEvent(mountEvent(gladys, fs, 'missing', lang));
        }
        for (const fs of round.mounts.mounted) {
          await publishEvent(mountEvent(gladys, fs, 'mounted', lang));
        }
        for (const change of round.services) {
          await publishEvent(serviceEvent(gladys, change, lang));
        }
      }
      await publishQuietly();
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the devices: ${err.message}`),
      );
      refreshWidgets();
      await reportStatus(true, connectedMessage());
    },
    onError: async (err) => {
      await reportStatus(false, errorMessage(err));
      refreshWidgets();
    },
    onConnection: async (change) => {
      await publishEvent(connectionEvent(watcher.system(), change, now(), textLanguage()));
    },
    now,
    logger,
  });

  /**
   * @description Read the NAS if it never was, before an answer that needs it.
   * @returns {Promise<void>}
   */
  async function ensureRead() {
    if (!hasCredentials(config)) {
      throw new Error('No OpenMediaVault address, user or password is configured');
    }
    if (watcher.fetchedAt() === null) {
      await watcher.round({ retryAuth: true });
    }
    if (watcher.fetchedAt() === null) {
      throw new Error('OpenMediaVault could not be read: see the connection status');
    }
  }

  /**
   * @description Follow a background job of OpenMediaVault until it ends or
   * the time is up.
   * @param {string} filename - Its status file.
   * @param {number} timeoutMs - How long to wait.
   * @returns {Promise<{ done: boolean, ok: boolean, output: string }>} Where it is.
   */
  async function followJob(filename, timeoutMs) {
    const deadline = now() + timeoutMs;
    for (;;) {
      let answer;
      try {
        answer = await api.jobOutput(filename);
      } catch (err) {
        if (err.kind === 'rpc') {
          // The job itself failed: OpenMediaVault reports its error here.
          return { done: true, ok: false, output: err.message };
        }
        throw err;
      }
      if (answer?.running === false) {
        return { done: true, ok: true, output: String(answer.output ?? '') };
      }
      if (now() >= deadline) {
        return { done: false, ok: true, output: String(answer?.output ?? '') };
      }
      await wait(JOB_POLL_MS);
    }
  }

  /**
   * @description The last meaningful lines of a job output.
   * @param {string} output - The output.
   * @returns {string} At most MESSAGE_LENGTH characters.
   */
  function lastLines(output) {
    const lines = String(output ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.slice(-3).join(' ').slice(-MESSAGE_LENGTH);
  }

  /**
   * @description Read the NAS after an update check run from Gladys: the new
   * count never fires the "updates available" trigger.
   * @returns {Promise<object>} The NAS snapshot.
   */
  async function readAfterUpdateCheck() {
    const system = watcher.patchSystem(await api.systemInformation());
    await publishQuietly();
    refreshWidgets();
    return system;
  }

  /**
   * @description Ask OpenMediaVault to read its package lists again.
   * @param {number} timeoutMs - How long to wait for it.
   * @returns {Promise<{ done: boolean, system: object|null }>} The result.
   */
  async function checkUpdates(timeoutMs) {
    const filename = await api.aptUpdate();
    const job = await followJob(filename, timeoutMs);
    if (!job.done) {
      // Let it finish, then read the count (no scene event either).
      followJob(filename, ACTION_WAIT_MS * 3)
        .then(readAfterUpdateCheck)
        .catch((err) => logger.warn(`Update check: ${err.message}`));
      return { done: false, system: watcher.system() };
    }
    if (!job.ok) {
      throw new Error(`OpenMediaVault could not read its package lists: ${job.output}`);
    }
    return { done: true, system: await readAfterUpdateCheck() };
  }

  /**
   * @description Reboot or shut down: the outage that follows fires no event.
   * @param {string} what - reboot or shutdown.
   * @param {unknown} delay - Seconds before it happens.
   * @returns {Promise<void>}
   */
  async function powerOff(what, delay) {
    const seconds = Math.min(MAX_DELAY_S, Math.max(0, Math.round(Number(delay) || 0)));
    watcher.expectDowntime();
    await api[what](seconds);
    logger.info(`OpenMediaVault ${what} asked from Gladys (in ${seconds} s)`);
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description Common checks of a widget request.
   * @param {string} lang - The user language.
   * @returns {object|null} A message content, null when the widget can be built.
   */
  function widgetProblem(lang) {
    if (!hasCredentials(config)) {
      return messageContent(t('noCredentials', lang));
    }
    if (watcher.fetchedAt() === null) {
      const err = watcher.lastError();
      return messageContent(
        err ? (errorMessage(err)[lang] ?? errorMessage(err).en) : t('notReadYet', lang),
        30,
      );
    }
    return null;
  }

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildOverviewWidget({
        system: watcher.system(),
        disks: watcher.disks(),
        services: watcher.services(),
        missing: watcher.missingFilesystems(),
        language: lang,
        now: now(),
        fetchedAt: watcher.fetchedAt(),
        pollSeconds: config.pollInterval,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.STORAGE, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const problem = widgetProblem(lang);
    if (problem) {
      return problem;
    }
    const chosenSettings = readStorageSettings(settings);
    const id = idFromExternalId(chosenSettings.filesystem, DEVICE_TYPES.FILESYSTEM);
    const chosen = id ? watcher.filesystem(id) : null;
    return buildStorageWidget({
      filesystems: watcher.filesystems(),
      missing: watcher.missingFilesystems(),
      language: lang,
      pollSeconds: config.pollInterval,
      chosen,
      interval: chosenSettings.interval,
      featureId:
        chosen && isCreated(DEVICE_TYPES.FILESYSTEM, chosen.id)
          ? idsOf(gladys, DEVICE_TYPES.FILESYSTEM, chosen.id).feature
          : null,
    });
  });

  gladys.onWidgetGet(WIDGETS.DISKS, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildDisksWidget({
        disks: watcher.disks(),
        language: lang,
        now: now(),
        pollSeconds: config.pollInterval,
        smartHealth: config.smartHealth,
        smartAt: watcher.smartAt(),
        smartWaiting: watcher.smartWaiting(),
      })
    );
  });

  gladys.onWidgetAction(WIDGETS.OVERVIEW, async (actionKey) => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      if (actionKey === WIDGET_ACTIONS.CHECK_UPDATES) {
        const { done, system } = await checkUpdates(WIDGET_WAIT_MS);
        if (!done) {
          return all('updatesStillRunning');
        }
        return Object.fromEntries(
          LANGUAGES.map((lang) => [lang, updatesSummary(system, lang).slice(0, 200)]),
        );
      }
      if (actionKey === WIDGET_ACTIONS.REBOOT) {
        await powerOff('reboot', 0);
        return all('rebooting');
      }
      if (actionKey === WIDGET_ACTIONS.SHUTDOWN) {
        await powerOff('shutdown', 0);
        return all('shuttingDown');
      }
    } catch (err) {
      logger.warn(`Widget action ${actionKey}: ${err.message}`);
      return err.kind
        ? errorMessage(err)
        : all('statusRpc', { message: err.message.slice(0, 120) });
    }
    return all('unknownAction');
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_STATUS, async () => {
    await ensureRead();
    return statusOutputs(
      {
        system: watcher.system(),
        disks: watcher.disks(),
        filesystems: watcher.filesystems(),
        missing: watcher.missingFilesystems(),
        services: watcher.services(),
      },
      textLanguage(),
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.RUN_RSYNC_JOB, async (fields) => {
    await ensureRead();
    const wanted = String(fields.job ?? '').trim();
    if (!wanted) {
      throw new Error('Type the name (comment) or the UUID of an rsync job');
    }
    // The list of the moment: a job may have been added since the last reading.
    const jobs = readRsyncJobs(await api.rsyncJobs());
    const lower = wanted.toLowerCase();
    const job =
      jobs.find((j) => j.uuid === lower) ?? jobs.find((j) => j.name.toLowerCase() === lower);
    if (!job) {
      throw new Error(`Unknown rsync job: ${wanted}`);
    }
    if (!job.enabled) {
      throw new Error(`The rsync job ${job.name} is disabled in OpenMediaVault`);
    }
    const waitForIt = fields.wait !== false && fields.wait !== 'false';
    const previous = rsyncRuns.get(job.uuid);
    if (previous) {
      const state = await followJob(previous, 0).catch(() => ({ done: true }));
      if (!state.done) {
        return { job: job.name, status: 'running', message: lastLines(state.output) };
      }
      rsyncRuns.delete(job.uuid);
    }
    const filename = await api.runRsyncJob(job.uuid);
    rsyncRuns.set(job.uuid, filename);
    const result = await followJob(filename, waitForIt ? ACTION_WAIT_MS : 0);
    if (result.done) {
      rsyncRuns.delete(job.uuid);
    }
    let status = 'running';
    if (result.done) {
      status = result.ok ? 'completed' : 'failed';
    }
    logger.info(`rsync job ${job.name}: ${status}`);
    return { job: job.name, status, message: lastLines(result.output) };
  });

  gladys.onSceneAction(SCENE_ACTIONS.CHECK_UPDATES, async () => {
    await ensureRead();
    const { system } = await checkUpdates(ACTION_WAIT_MS);
    return updatesOutputs(system, textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.REBOOT, async (fields) => {
    await ensureRead();
    await powerOff('reboot', fields.delay);
  });

  gladys.onSceneAction(SCENE_ACTIONS.SHUTDOWN, async (fields) => {
    await ensureRead();
    await powerOff('shutdown', fields.delay);
  });

  // --- Device commands: every feature is a state ----------------------------------
  gladys.onSetValue(async (device, deviceFeature) => {
    throw new Error(`Read-only feature: ${deviceFeature.external_id}`);
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      // A fresh login, even within the pause after a refused password.
      await api.login();
      const info = await api.systemInformation();
      const system = watcher.patchSystem(info);
      // Start reading at once.
      watcher.round({ slow: true, retryAuth: true }).catch(() => {});
      return all('testOk', { name: shortHost(system), version: system.version ?? '?' });
    } catch (err) {
      return errorMessage(err);
    }
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await watcher.round({ slow: true, retryAuth: true });
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} OpenMediaVault device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read the NAS now; report missing settings.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    if (!hasCredentials(config)) {
      await reportStatus(false, all('noCredentials'));
      return;
    }
    await watcher.round({ slow: true, retryAuth: true });
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousUrl = config.url;
    await loadConfig(rawConfig);
    logger.info(`Configuration updated: OpenMediaVault read every ${config.pollInterval} s`);
    // Address, account or S.M.A.R.T. mode: start again from a fresh baseline.
    watcher.reset();
    lastDiscovery = null;
    rsyncRuns.clear();
    if (configLoaded && config.url !== previousUrl) {
      // Maybe another NAS: its browser cookie is not ours.
      await store.clear();
    }
    configLoaded = true;
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  gladys.on('connected', async () => {
    await store.load();
    await loadConfig();
    configLoaded = true;
    await refreshCreatedDevices();
    lastStatus = null;
    lastDiscovery = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
    await api.logout();
    await store.flush();
  });

  return { watcher, store, api, getConfig: () => config };
}

export { createApp, ACTIONS, SCENE_ACTIONS, JOB_POLL_MS, ACTION_WAIT_MS, WIDGET_WAIT_MS };
