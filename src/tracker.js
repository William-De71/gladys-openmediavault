// -----------------------------------------------------------------------------
// Snapshots -> scene trigger transitions. Pure logic, no I/O.
//
// One event per transition, never a periodic snapshot. A `previous` of
// undefined (or null) is the baseline (first reading after a start or a new
// address): nothing fires from it, so a restart never replays what happened
// before.
// -----------------------------------------------------------------------------

// The uptime of two readings may differ by a little jitter; a reboot makes it
// drop to minutes.
const UPTIME_JITTER_S = 5;

/**
 * @description Whether the NAS restarted between two readings.
 * @param {object|null|undefined} previous - The previous NAS snapshot.
 * @param {object} current - The NAS snapshot.
 * @returns {boolean} True when its uptime went back.
 */
function diffReboot(previous, current) {
  if (typeof previous?.uptimeSeconds !== 'number' || typeof current?.uptimeSeconds !== 'number') {
    return false;
  }
  return current.uptimeSeconds + UPTIME_JITTER_S < previous.uptimeSeconds;
}

/**
 * @description Whether packages to upgrade appeared, or their number grew.
 * @param {object|null|undefined} previous - The previous NAS snapshot.
 * @param {object} current - The NAS snapshot.
 * @returns {boolean} True when an update became available.
 */
function diffUpdates(previous, current) {
  if (typeof previous?.updates !== 'number' || typeof current?.updates !== 'number') {
    return false;
  }
  return current.updates > 0 && current.updates > previous.updates;
}

/**
 * @description Whether a reboot became required (after an upgrade).
 * @param {object|null|undefined} previous - The previous NAS snapshot.
 * @param {object} current - The NAS snapshot.
 * @returns {boolean} True when it did.
 */
const diffRebootRequired = (previous, current) =>
  Boolean(previous) && previous.rebootRequired === false && current.rebootRequired === true;

/**
 * @description The change of the S.M.A.R.T. health of a disk.
 * @param {object|undefined} previous - The previous disk snapshot.
 * @param {object} current - The disk snapshot.
 * @returns {{ previous: string }|null} The transition, between two known healths.
 */
function diffHealth(previous, current) {
  if (!previous?.health || !current.health || previous.health === current.health) {
    return null;
  }
  return { previous: previous.health };
}

/**
 * @description Whether a file system is above its warning threshold.
 * @param {object} fs - The file system snapshot.
 * @returns {boolean|null} Null without a threshold or a usage.
 */
function isAbove(fs) {
  if (typeof fs?.used !== 'number' || typeof fs?.threshold !== 'number') {
    return null;
  }
  return fs.used >= fs.threshold;
}

/**
 * @description The crossing of the warning threshold of a file system (the
 * one set for its mount point in OpenMediaVault, 85 % by default).
 * @param {object|undefined} previous - The previous file system snapshot.
 * @param {object} current - The file system snapshot.
 * @returns {string|null} above, below or null.
 */
function diffUsage(previous, current) {
  const before = isAbove(previous);
  const now = isAbove(current);
  if (before === null || now === null || before === now) {
    return null;
  }
  return now ? 'above' : 'below';
}

/**
 * @description The file systems that disappeared or came back between two
 * readings (an USB disk unplugged, a mount that failed at boot).
 * @param {Set<string>|null} previous - The ids mounted at the last reading,
 * null for the baseline.
 * @param {Set<string>} current - The ids mounted now.
 * @returns {{ missing: string[], mounted: string[] }} The transitions.
 */
function diffMounts(previous, current) {
  if (!previous) {
    return { missing: [], mounted: [] };
  }
  return {
    missing: [...previous].filter((id) => !current.has(id)),
    mounted: [...current].filter((id) => !previous.has(id)),
  };
}

/**
 * @description The start or stop of an enabled service.
 * @param {object|undefined} previous - The previous service snapshot.
 * @param {object} current - The service snapshot.
 * @returns {boolean} True when it started or stopped.
 */
const diffService = (previous, current) =>
  Boolean(previous) && current.enabled && previous.running !== current.running;

export {
  UPTIME_JITTER_S,
  diffReboot,
  diffUpdates,
  diffRebootRequired,
  diffHealth,
  isAbove,
  diffUsage,
  diffMounts,
  diffService,
};
