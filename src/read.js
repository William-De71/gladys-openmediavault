// -----------------------------------------------------------------------------
// OpenMediaVault answers -> plain snapshots. Pure functions, no I/O.
//
// An unknown value is null, never 0: a missing temperature must not draw a
// 0 °C in Gladys. The shapes come from the RPC services of
// openmediavault/openmediavault (6.x, 7.x, master) and from a real 8.5:
//   - System.getInformation: cpuUtilization (0-100), memUtilization (a ratio
//     0-1, as a string), memUsed / memTotal (strings), uptime (seconds,
//     a number since 6.x; "1 days 2 hours 3 minutes 4 seconds" before),
//     availablePkgUpdates, rebootRequired, configDirty, version
//     ("8.5.12-1 (Synchrony)"), hostname (FQDN);
//   - DiskMgmt.enumerateDevices: devicename, canonicaldevicefile, model,
//     vendor, serialnumber, wwn, size (string, bytes), powermode (7.x and
//     later: "ACTIVE or IDLE", "IDLE_A", "STANDBY", "SLEEP", "UNKNOWN",
//     "ERROR"), temperature ("" or a number, as a string), isroot;
//   - Smart.getList: { data: [{ devicename, serialnumber, overallstatus }] },
//     overallstatus GOOD, BAD_ATTRIBUTE_NOW, BAD_ATTRIBUTE_IN_THE_PAST,
//     BAD_SECTOR, BAD_SECTOR_MANY, BAD_STATUS (or false when unknown);
//   - FileSystemMgmt.enumerateMountedFilesystems: uuid, label, devicename,
//     type, mountpoint, size / available (strings, bytes), percentage
//     (integer, -1 when unknown), usagewarnthreshold (0 = no warning),
//     comment;
//   - Services.getStatus: { data: [{ name, title, enabled, running }] };
//   - Rsync.getList: { data: [{ uuid, enable, comment, type, mode, srcname,
//     destname, ... }] } (remote jobs carry a password: never kept here).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

/**
 * @description A finite number out of a number or a numeric string.
 * @param {unknown} value - The raw value.
 * @returns {number|null} The number.
 */
function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

const round = (value, digits = 1) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * @description The rows of a list answer (`[...]` or `{ total, data: [...] }`).
 * @param {unknown} answer - The answer.
 * @returns {Array<object>} The rows.
 */
function rowsOf(answer) {
  if (Array.isArray(answer)) {
    return answer.filter((row) => row && typeof row === 'object');
  }
  if (answer && Array.isArray(answer.data)) {
    return answer.data.filter((row) => row && typeof row === 'object');
  }
  return [];
}

/**
 * @description The uptime in seconds: a number since 6.x, a sentence before.
 * @param {unknown} raw - The `uptime` of System.getInformation.
 * @returns {number|null} The seconds.
 * @example
 * parseUptime('2 days 3 hours 4 minutes 5 seconds'); // -> 183845
 */
function parseUptime(raw) {
  const seconds = toNumber(raw);
  if (seconds !== null) {
    return seconds >= 0 ? seconds : null;
  }
  const match = /(\d+)\s*days?\s+(\d+)\s*hours?\s+(\d+)\s*minutes?\s+(\d+)\s*seconds?/i.exec(
    String(raw ?? ''),
  );
  if (!match) {
    return null;
  }
  const [days, hours, minutes, secs] = match.slice(1).map(Number);
  return ((days * 24 + hours) * 60 + minutes) * 60 + secs;
}

/**
 * @description The version without its code name: "8.5.12-1 (Synchrony)" -> "8.5.12-1".
 * @param {unknown} raw - The version.
 * @returns {string|null} The version.
 */
function parseVersion(raw) {
  const text = String(raw ?? '').trim();
  return text ? text.replace(/\s*\(.*\)\s*$/, '') : null;
}

/**
 * @description The code name of a version: "8.5.12-1 (Synchrony)" -> "Synchrony".
 * @param {unknown} raw - The version.
 * @returns {string|null} The code name.
 */
function versionName(raw) {
  const match = /\(([^)]+)\)\s*$/.exec(String(raw ?? ''));
  return match ? match[1] : null;
}

/**
 * @description The NAS snapshot.
 * @param {object} info - The System.getInformation answer.
 * @returns {object} `{ hostname, version, versionName, cpu, memory, memoryUsed,
 * memoryTotal, uptimeSeconds, uptimeDays, load, updates, rebootRequired,
 * configDirty, kernel, cpuModel }`.
 */
function readSystem(info = {}) {
  const memoryTotal = toNumber(info.memTotal);
  const memoryUsed = toNumber(info.memUsed);
  const ratio = toNumber(info.memUtilization);
  let memory = null;
  if (ratio !== null) {
    memory = ratio * 100;
  } else if (memoryTotal && memoryUsed !== null) {
    memory = (memoryUsed / memoryTotal) * 100;
  }
  // cpuUsage: OpenMediaVault 5 and older.
  const cpu = toNumber(info.cpuUtilization ?? info.cpuUsage);
  const uptimeSeconds = parseUptime(info.uptime);
  const load = info.loadAverage ?? {};
  return {
    hostname: typeof info.hostname === 'string' && info.hostname ? info.hostname : null,
    version: parseVersion(info.version),
    versionName: versionName(info.version),
    cpu: cpu === null ? null : round(Math.min(100, Math.max(0, cpu))),
    memory: memory === null ? null : round(Math.min(100, Math.max(0, memory))),
    memoryUsed,
    memoryTotal,
    uptimeSeconds,
    uptimeDays: uptimeSeconds === null ? null : round(uptimeSeconds / 86400, 2),
    load: {
      one: toNumber(load['1min']),
      five: toNumber(load['5min']),
      fifteen: toNumber(load['15min']),
    },
    updates: toNumber(info.availablePkgUpdates),
    rebootRequired: info.rebootRequired === true,
    configDirty: info.configDirty === true,
    kernel: typeof info.kernel === 'string' ? info.kernel : null,
    cpuModel: typeof info.cpuModelName === 'string' ? info.cpuModelName : null,
  };
}

/**
 * @description A short stable id: lower-case letters, digits and dashes only.
 * @param {unknown} raw - A serial number, a WWN, an UUID.
 * @returns {string|null} The id, null when nothing usable remains.
 * @example
 * cleanId('WD-WCAV1B245569'); // -> 'wd-wcav1b245569'
 */
function cleanId(raw) {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text.length >= 4 && !/^0+$/.test(text.replace(/-/g, '')) ? text.slice(0, 64) : null;
}

/**
 * @description The power state of a disk out of the smartctl power mode.
 * @param {unknown} raw - powermode ("ACTIVE or IDLE", "STANDBY", "UNKNOWN"...).
 * @returns {string} active, standby or unknown.
 */
function readPowerMode(raw) {
  const text = String(raw ?? '').toUpperCase();
  if (/STANDBY|SLEEP/.test(text)) {
    return 'standby';
  }
  if (/ACTIVE|IDLE/.test(text)) {
    return 'active';
  }
  return 'unknown';
}

const HEALTH_BAD = new Set([
  'BAD_ATTRIBUTE_NOW',
  'BAD_ATTRIBUTE_IN_THE_PAST',
  'BAD_SECTOR',
  'BAD_SECTOR_MANY',
  'BAD_STATUS',
]);

/**
 * @description The health of an overall S.M.A.R.T. status.
 * @param {unknown} raw - overallstatus.
 * @returns {string|null} good, warning (a problem in the past), bad, or null.
 */
function readHealth(raw) {
  if (raw === 'GOOD') {
    return 'good';
  }
  if (raw === 'BAD_ATTRIBUTE_IN_THE_PAST') {
    return 'warning';
  }
  return HEALTH_BAD.has(raw) ? 'bad' : null;
}

/**
 * @description The disks, with their S.M.A.R.T. health when known.
 * @param {unknown} answer - The DiskMgmt.enumerateDevices answer.
 * @param {Map<string, object>} [smart] - devicename -> { serial, status } of
 * the last Smart.getList.
 * @returns {Array<object>} `{ id, devicename, devicefile, model, vendor,
 * serial, size, temperature, power, isRoot, status, health }`. A disk without
 * serial number nor WWN has no stable id: it is left out (a virtual disk).
 */
function readDisks(answer, smart = new Map()) {
  return rowsOf(answer).flatMap((row) => {
    const devicename = String(row.devicename ?? '');
    const fromSmart = smart.get(devicename);
    // udev gives the serial number; without it (some USB bridges, NVMe in a
    // container), smartctl may still know it.
    const serial = String(row.serialnumber || fromSmart?.serial || '').trim() || null;
    const id = cleanId(serial) ?? cleanId(row.wwn);
    if (!id || !devicename) {
      return [];
    }
    const temperature = toNumber(row.temperature);
    return [
      {
        id,
        devicename,
        devicefile: String(row.canonicaldevicefile || row.devicefile || `/dev/${devicename}`),
        model: String(row.model ?? '').trim() || null,
        vendor: String(row.vendor ?? '').trim() || null,
        serial,
        size: toNumber(row.size),
        temperature:
          temperature !== null && temperature > -50 && temperature < 150 ? temperature : null,
        power: readPowerMode(row.powermode),
        // powermode exists since 7.x: without it, the standby is unknown.
        hasPowerMode: typeof row.powermode === 'string',
        isRoot: row.isroot === true,
        status: fromSmart?.status ?? null,
        health: readHealth(fromSmart?.status),
      },
    ];
  });
}

/**
 * @description The S.M.A.R.T. overall statuses, by device name.
 * @param {unknown} answer - The Smart.getList answer.
 * @returns {Map<string, { serial: string|null, status: string|null }>} The statuses.
 */
function readSmart(answer) {
  return new Map(
    rowsOf(answer)
      .filter((row) => typeof row.devicename === 'string')
      .map((row) => [
        row.devicename,
        {
          serial: String(row.serialnumber ?? '').trim() || null,
          status: typeof row.overallstatus === 'string' ? row.overallstatus : null,
        },
      ]),
  );
}

/**
 * @description The id of a file system: its UUID, else a hash of its mount
 * point (some layered file systems have no UUID).
 * @param {object} row - The file system row.
 * @returns {string|null} The id.
 */
function filesystemId(row) {
  const uuid = cleanId(row.uuid);
  if (uuid) {
    return uuid;
  }
  const mountpoint = String(row.mountpoint ?? '');
  return mountpoint
    ? `mp-${createHash('sha1').update(mountpoint).digest('hex').slice(0, 12)}`
    : null;
}

/**
 * @description The mounted file systems.
 * @param {unknown} answer - The FileSystemMgmt.enumerateMountedFilesystems answer.
 * @returns {Array<object>} `{ id, label, devicename, type, mountpoint, size,
 * available, used, threshold, comment, isRoot }`; sizes in bytes, used in %.
 */
function readFilesystems(answer) {
  return rowsOf(answer).flatMap((row) => {
    const id = filesystemId(row);
    if (!id) {
      return [];
    }
    const size = toNumber(row.size);
    const available = toNumber(row.available);
    let used = toNumber(row.percentage);
    if ((used === null || used < 0) && size && available !== null && size > 0) {
      used = ((size - available) / size) * 100;
    }
    const threshold = toNumber(row.usagewarnthreshold);
    const mountpoint = String(row.mountpoint ?? '');
    return [
      {
        id,
        label: String(row.label ?? '').trim() || null,
        devicename: String(row.devicename ?? '').trim() || null,
        type: String(row.type ?? '').trim() || null,
        mountpoint: mountpoint || null,
        size: size !== null && size >= 0 ? size : null,
        available: available !== null && available >= 0 ? available : null,
        used: used !== null && used >= 0 ? round(Math.min(100, used)) : null,
        threshold: threshold !== null && threshold > 0 && threshold <= 100 ? threshold : null,
        comment: String(row.comment ?? '').trim() || null,
        isRoot: mountpoint === '/',
      },
    ];
  });
}

/**
 * @description The services OpenMediaVault manages.
 * @param {unknown} answer - The Services.getStatus answer.
 * @returns {Array<{ id: string, title: string, enabled: boolean, running: boolean }>} The services.
 */
function readServices(answer) {
  return rowsOf(answer)
    .filter((row) => typeof row.name === 'string' && /^[a-z0-9_-]+$/i.test(row.name))
    .map((row) => ({
      id: row.name.toLowerCase(),
      title: String(row.title ?? '').trim() || row.name,
      enabled: row.enabled === true,
      running: row.running === true,
    }));
}

/**
 * @description The rsync jobs, without their passwords.
 * @param {unknown} answer - The Rsync.getList answer.
 * @returns {Array<{ uuid: string, name: string, enabled: boolean, type: string,
 * mode: string, source: string, destination: string }>} The jobs.
 */
function readRsyncJobs(answer) {
  return rowsOf(answer)
    .filter((row) => typeof row.uuid === 'string' && /^[0-9a-f-]{36}$/i.test(row.uuid))
    .map((row) => {
      // A remote URI may hold a user name: keep only its host part.
      const source = String(row.srcname ?? '')
        .trim()
        .replace(/^[^@]*@/, '');
      const destination = String(row.destname ?? '')
        .trim()
        .replace(/^[^@]*@/, '');
      return {
        uuid: row.uuid.toLowerCase(),
        name: String(row.comment ?? '').trim() || `${source} → ${destination}`,
        enabled: row.enable === true,
        type: row.type === 'remote' ? 'remote' : 'local',
        mode: row.mode === 'pull' ? 'pull' : 'push',
        source,
        destination,
      };
    });
}

export {
  toNumber,
  rowsOf,
  parseUptime,
  parseVersion,
  readSystem,
  cleanId,
  readPowerMode,
  readHealth,
  readDisks,
  readSmart,
  readFilesystems,
  readServices,
  readRsyncJobs,
};
