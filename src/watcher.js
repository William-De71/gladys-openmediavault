// -----------------------------------------------------------------------------
// The reading loop: every `poll_interval` seconds, the state of the NAS.
//
// Each round reads what moves (CPU, memory, uptime, updates, file systems,
// services). The disks are read every DISK_INTERVAL_MS: DiskMgmt runs
// smartctl --nocheck=standby on each of them, which never wakes a disk up but
// is not free either. The S.M.A.R.T. health (Smart.getList) runs smartctl
// WITHOUT --nocheck on every disk, which spins up a disk in standby: it is
// read every SMART_INTERVAL_MS, and with `smart_health: awake` only when no
// disk sleeps (else at the next disk reading). The rsync jobs are read every
// JOBS_INTERVAL_MS.
//
// It keeps the snapshots the devices, widgets and scene actions read, and
// hands each round to the app with its transitions (tracker.js). A round
// never overlaps another one. System.getInformation is the probe of the
// round: when it fails (unreachable, wrong password), the round fails
// (onError); any other read failing keeps its previous snapshot.
//
// A NAS that stops answering is "lost" after LOST_AFTER failed rounds in a
// row (a single timeout is not an outage), and "restored" at the next answer.
// After a reboot or a shutdown asked from Gladys, that outage is expected:
// it fires no scene event.
// -----------------------------------------------------------------------------

import {
  readSystem,
  readDisks,
  readSmart,
  readFilesystems,
  readServices,
  readRsyncJobs,
} from './read.js';
import {
  diffReboot,
  diffUpdates,
  diffRebootRequired,
  diffHealth,
  diffUsage,
  diffMounts,
  diffService,
} from './tracker.js';

const DISK_INTERVAL_MS = 5 * 60 * 1000;
const SMART_INTERVAL_MS = 60 * 60 * 1000;
const JOBS_INTERVAL_MS = 10 * 60 * 1000;
// An optional call refused (plugin missing, older version) is not asked
// again before this delay.
const RETRY_MISSING_MS = 60 * 60 * 1000;
// After a wrong password, no new login before this delay (a manual test of
// the connection or a new configuration tries at once).
const AUTH_PAUSE_MS = 10 * 60 * 1000;
const LOST_AFTER = 2;
// How long an outage asked from Gladys (reboot, shutdown) stays expected.
const EXPECTED_DOWNTIME_MS = 60 * 60 * 1000;
const NETWORK_KINDS = new Set(['unreachable', 'http', 'tls']);
const AUTH_KINDS = new Set(['auth', 'not_admin', 'mfa', 'rate_limited']);

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.api - The OpenMediaVault client.
 * @param {Function} options.getConfig - `() => normalized config`.
 * @param {Function} options.isEnabled - `() => boolean`: address and account known.
 * @param {Function} options.onRound - `async (round) => void`.
 * @param {Function} options.onError - `async (err) => void`.
 * @param {Function} [options.onConnection] - `async ({ state, downSince }) => void`:
 * `lost` or `restored`, never for an expected outage.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ api, getConfig, isEnabled, onRound, onError, logger });
 * watcher.start();
 */
function createWatcher({
  api,
  getConfig,
  isEnabled,
  onRound,
  onError,
  onConnection = async () => {},
  now = () => Date.now(),
  logger,
}) {
  let system = null;
  let disks = new Map();
  let smart = new Map();
  let filesystems = new Map();
  let missingFilesystems = new Map();
  let mounted = null;
  let services = new Map();
  let jobs = new Map();
  let diskAt = null;
  let smartAt = null;
  let smartWaiting = false;
  let jobsAt = null;
  let fetchedAt = null;
  let lastError = null;
  // endpoint -> time it was found missing
  let missing = new Map();
  let rootRefusedAt = null;
  let authFailedAt = null;
  let failures = 0;
  let lost = false;
  let downSince = null;
  let expectedUntil = null;
  let expectedRebootSeen = false;
  let timer = null;
  let running = null;
  let started = false;

  /**
   * @description Read an optional call: undefined when it fails.
   * @param {string} name - The client method.
   * @returns {Promise<unknown>} The answer.
   */
  async function readOptional(name) {
    const since = missing.get(name);
    if (since !== undefined && now() - since < RETRY_MISSING_MS) {
      return undefined;
    }
    try {
      const answer = await api[name]();
      missing.delete(name);
      return answer;
    } catch (err) {
      if (err.kind === 'not_found') {
        if (since === undefined) {
          logger.info(`OpenMediaVault ${name}: ${err.message}, skipped`);
        }
        missing.set(name, now());
      } else {
        logger.warn(`OpenMediaVault ${name}: ${err.message}`);
      }
      return undefined;
    }
  }

  /**
   * @description The mounted file systems. A root file system OpenMediaVault
   * cannot describe (a container, an unusual boot device) fails the whole
   * call: read them again without it.
   * @returns {Promise<unknown>} The answer.
   */
  async function readMounted() {
    if (rootRefusedAt === null || now() - rootRefusedAt >= RETRY_MISSING_MS) {
      try {
        const answer = await api.filesystems();
        rootRefusedAt = null;
        return answer;
      } catch (err) {
        if (err.kind !== 'rpc') {
          logger.warn(`OpenMediaVault filesystems: ${err.message}`);
          return undefined;
        }
        if (rootRefusedAt === null) {
          logger.info(`OpenMediaVault cannot describe its root file system (${err.message})`);
        }
        rootRefusedAt = now();
      }
    }
    return readOptional('filesystemsWithoutRoot');
  }

  /**
   * @description Whether the S.M.A.R.T. health can be read now without
   * waking a disk.
   * @param {string} mode - awake, always or off.
   * @returns {boolean} True when it can.
   */
  function smartAllowed(mode) {
    if (mode === 'off') {
      return false;
    }
    if (mode === 'always') {
      return true;
    }
    const list = [...disks.values()];
    // Without power modes (OpenMediaVault 6), a sleeping disk cannot be seen.
    return list.every((disk) => disk.hasPowerMode) && list.every((d) => d.power !== 'standby');
  }

  /**
   * @description The disks, and their health when it is time.
   * @param {boolean} force - Read them now.
   * @param {object} round - The round being built.
   * @returns {Promise<void>}
   */
  async function readDiskPart(force, round) {
    const at = now();
    if (!force && diskAt !== null && at - diskAt < DISK_INTERVAL_MS) {
      return;
    }
    const answer = await readOptional('disks');
    if (answer === undefined) {
      return;
    }
    diskAt = at;
    // The power modes first: they decide whether S.M.A.R.T. may run.
    disks = new Map(readDisks(answer, smart).map((disk) => [disk.id, disk]));
    const { smartHealth } = getConfig();
    const due = smartAt === null || smartWaiting || at - smartAt >= SMART_INTERVAL_MS;
    if (due && smartHealth !== 'off') {
      if (smartAllowed(smartHealth)) {
        const list = await readOptional('smartList');
        if (list !== undefined) {
          smart = readSmart(list);
          smartAt = at;
          smartWaiting = false;
        }
      } else {
        smartWaiting = true;
      }
    } else if (smartHealth === 'off') {
      smart = new Map();
    }
    const previous = round.baseline ? new Map() : round.previousDisks;
    const next = new Map();
    for (const disk of readDisks(answer, smart)) {
      const before = previous.get(disk.id);
      const transition = diffHealth(before, disk);
      if (transition) {
        round.health.push({ disk, previous: transition.previous });
      }
      next.set(disk.id, disk);
    }
    disks = next;
  }

  /**
   * @description One reading of the NAS.
   * @param {boolean} force - Read the slow parts too.
   * @returns {Promise<void>}
   */
  async function readAll(force) {
    // The probe: a failure here fails the round.
    const info = await api.systemInformation();
    const at = now();
    const round = {
      baseline: fetchedAt === null,
      rebooted: false,
      updates: false,
      rebootRequired: false,
      health: [],
      usage: [],
      mounts: { missing: [], mounted: [] },
      services: [],
      previousDisks: disks,
    };

    // --- NAS --------------------------------------------------------------------
    const next = readSystem(info);
    if (!round.baseline) {
      round.rebooted = diffReboot(system, next);
      round.updates = diffUpdates(system, next);
      round.rebootRequired = diffRebootRequired(system, next);
    }
    if (round.rebooted && isExpected()) {
      // The reboot asked from Gladys: done, no event.
      round.rebooted = false;
      expectedRebootSeen = true;
    }
    system = next;

    // --- file systems -----------------------------------------------------------
    const fsAnswer = await readMounted();
    if (fsAnswer !== undefined) {
      const read = readFilesystems(fsAnswer);
      const ids = new Set(read.map((fs) => fs.id));
      round.mounts = diffMounts(round.baseline ? null : mounted, ids);
      for (const id of round.mounts.missing) {
        const gone = filesystems.get(id);
        if (gone) {
          missingFilesystems.set(id, { ...gone, missingSince: at });
        }
      }
      const nextFs = new Map();
      for (const fs of read) {
        const usage = round.baseline ? null : diffUsage(filesystems.get(fs.id), fs);
        if (usage) {
          round.usage.push({ fs, state: usage });
        }
        missingFilesystems.delete(fs.id);
        nextFs.set(fs.id, fs);
      }
      round.mounts.mounted = round.mounts.mounted.map((id) => nextFs.get(id));
      round.mounts.missing = round.mounts.missing
        .map((id) => missingFilesystems.get(id))
        .filter(Boolean);
      filesystems = nextFs;
      mounted = ids;
    }

    // --- services ---------------------------------------------------------------
    const serviceAnswer = await readOptional('services');
    if (serviceAnswer !== undefined) {
      const nextServices = new Map();
      for (const service of readServices(serviceAnswer)) {
        if (!round.baseline && diffService(services.get(service.id), service)) {
          round.services.push({ service });
        }
        nextServices.set(service.id, service);
      }
      services = nextServices;
    }

    // --- disks ------------------------------------------------------------------
    await readDiskPart(force, round);

    // --- rsync jobs -------------------------------------------------------------
    if (force || jobsAt === null || at - jobsAt >= JOBS_INTERVAL_MS) {
      const jobAnswer = await readOptional('rsyncJobs');
      if (jobAnswer !== undefined) {
        jobs = new Map(readRsyncJobs(jobAnswer).map((job) => [job.uuid, job]));
        jobsAt = at;
      }
    }

    delete round.previousDisks;
    fetchedAt = at;
    lastError = null;
    await onRound(round);
  }

  /**
   * @description Count a failed round; report an outage once.
   * @param {Error} err - The failure.
   * @returns {Promise<void>}
   */
  async function failed(err) {
    lastError = err;
    if (AUTH_KINDS.has(err.kind)) {
      authFailedAt = now();
    }
    if (!NETWORK_KINDS.has(err.kind) || fetchedAt === null) {
      return;
    }
    failures += 1;
    if (failures === 1) {
      downSince = now();
    }
    if (failures >= LOST_AFTER && !lost) {
      lost = true;
      if (!isExpected()) {
        await onConnection({ state: 'lost', downSince });
      }
    }
  }

  /**
   * @description A round answered: report the end of an outage once.
   * @returns {Promise<void>}
   */
  async function succeeded() {
    if (lost && !isExpected()) {
      await onConnection({ state: 'restored', downSince });
    }
    if (lost || expectedRebootSeen) {
      // The outage asked from Gladys is over.
      expectedUntil = null;
      expectedRebootSeen = false;
    }
    lost = false;
    failures = 0;
    downSince = null;
    authFailedAt = null;
  }

  const isExpected = () => expectedUntil !== null && now() < expectedUntil;

  /**
   * @description Plan the next round.
   */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (started) {
      timer = setTimeout(() => {
        round().finally(schedule);
      }, getConfig().pollInterval * 1000);
      timer.unref?.();
    }
  }

  /**
   * @description Read the NAS now; joins a round already running.
   * @param {object} [options] - `{ slow, retryAuth }`: read the slow parts
   * too; log in even within the pause after a refused password.
   * @returns {Promise<void>} Never rejects: failures go to onError.
   */
  function round({ slow: force = false, retryAuth = false } = {}) {
    if (running) {
      return running;
    }
    if (!isEnabled()) {
      return Promise.resolve();
    }
    if (!retryAuth && authFailedAt !== null && now() - authFailedAt < AUTH_PAUSE_MS) {
      return Promise.resolve();
    }
    running = readAll(force)
      .then(succeeded, async (err) => {
        logger.warn(`OpenMediaVault reading failed: ${err.message}`);
        await failed(err);
        await onError(err);
      })
      .catch((err) => logger.error('Unable to report a reading', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    round,
    start: () => {
      started = true;
      schedule();
    },
    stop: () => {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    reschedule: schedule,
    /** @description Forget everything: the next round is a new baseline. */
    reset: () => {
      system = null;
      disks = new Map();
      smart = new Map();
      filesystems = new Map();
      missingFilesystems = new Map();
      mounted = null;
      services = new Map();
      jobs = new Map();
      diskAt = null;
      smartAt = null;
      smartWaiting = false;
      jobsAt = null;
      fetchedAt = null;
      lastError = null;
      missing = new Map();
      rootRefusedAt = null;
      authFailedAt = null;
      failures = 0;
      lost = false;
      downSince = null;
      expectedUntil = null;
      expectedRebootSeen = false;
    },
    system: () => system,
    disks: () => [...disks.values()],
    disk: (id) => disks.get(id) ?? null,
    filesystems: () => [...filesystems.values()],
    filesystem: (id) => filesystems.get(id) ?? null,
    missingFilesystems: () => [...missingFilesystems.values()],
    services: () => [...services.values()],
    service: (id) => services.get(id) ?? null,
    jobs: () => [...jobs.values()],
    fetchedAt: () => fetchedAt,
    lastError: () => lastError,
    isLost: () => lost,
    smartWaiting: () => smartWaiting,
    smartAt: () => smartAt,
    /**
     * @description An outage is coming (reboot or shutdown asked from Gladys):
     * it fires no scene event, and the reboot it ends with neither.
     */
    expectDowntime: () => {
      expectedUntil = now() + EXPECTED_DOWNTIME_MS;
    },
    isExpectingDowntime: isExpected,
    /**
     * @description Apply a reading made by a scene action: no event.
     * @param {object} info - A System.getInformation answer.
     * @returns {object} The NAS snapshot.
     */
    patchSystem: (info) => {
      system = readSystem(info);
      return system;
    },
  };
}

export {
  createWatcher,
  DISK_INTERVAL_MS,
  SMART_INTERVAL_MS,
  JOBS_INTERVAL_MS,
  AUTH_PAUSE_MS,
  LOST_AFTER,
  EXPECTED_DOWNTIME_MS,
};
