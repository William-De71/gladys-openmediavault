// -----------------------------------------------------------------------------
// Scene trigger payloads and scene action outputs.
//
// Event data is flat (at most 30 keys, scalar values, strings of at most
// 1,000 characters); a field of a trigger filters on the data key of the same
// name (`device`, `state`, `health`). Outputs are the declared ones only,
// never null: -1 for an unknown number, "" for an unknown text.
// -----------------------------------------------------------------------------

import { idsOf, shortHost, diskLabel, filesystemLabel, DEVICE_TYPES } from './device.js';
import { t, formatNumber, formatBytes } from './i18n.js';

const TRIGGERS = {
  CONNECTION_CHANGED: 'connection_changed',
  NAS_REBOOTED: 'nas_rebooted',
  UPDATES_AVAILABLE: 'updates_available',
  REBOOT_REQUIRED: 'reboot_required',
  DISK_HEALTH_CHANGED: 'disk_health_changed',
  FILESYSTEM_USAGE: 'filesystem_usage',
  FILESYSTEM_MOUNT_CHANGED: 'filesystem_mount_changed',
  SERVICE_STATE_CHANGED: 'service_state_changed',
};

const MAX_STRING = 1000;
const text = (value) => String(value ?? '').slice(0, MAX_STRING);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : -1);
const gigabytes = (bytes) => (typeof bytes === 'number' ? Math.round((bytes / 1e9) * 10) / 10 : -1);

/**
 * @description The event of the NAS that stopped or started answering again.
 * @param {object|null} system - The last NAS snapshot.
 * @param {{ state: string, downSince: number|null }} change - lost or restored.
 * @param {number} now - Now, in ms.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function connectionEvent(system, { state, downSince }, now, language) {
  const minutes = downSince ? Math.max(0, Math.round((now - downSince) / 60000)) : -1;
  return {
    key: TRIGGERS.CONNECTION_CHANGED,
    data: {
      state,
      hostname: text(system?.hostname),
      down_minutes: state === 'restored' ? minutes : -1,
      summary: text(
        t(`summaryConnection_${state}`, language, { name: shortHost(system), minutes }),
      ),
    },
  };
}

/**
 * @description The event of a NAS that restarted.
 * @param {object} system - The NAS snapshot.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function rebootEvent(system, language) {
  return {
    key: TRIGGERS.NAS_REBOOTED,
    data: {
      hostname: text(system.hostname),
      uptime_minutes:
        typeof system.uptimeSeconds === 'number' ? Math.round(system.uptimeSeconds / 60) : -1,
      version: text(system.version),
      summary: text(t('summaryRebooted', language, { name: shortHost(system) })),
    },
  };
}

/**
 * @description The event of packages to upgrade.
 * @param {object} system - The NAS snapshot.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function updatesEvent(system, language) {
  return {
    key: TRIGGERS.UPDATES_AVAILABLE,
    data: {
      updates: number(system.updates),
      version: text(system.version),
      summary: text(updatesSummary(system, language)),
    },
  };
}

/**
 * @description The event of a reboot that became required.
 * @param {object} system - The NAS snapshot.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function rebootRequiredEvent(system, language) {
  return {
    key: TRIGGERS.REBOOT_REQUIRED,
    data: {
      hostname: text(system.hostname),
      summary: text(t('summaryRebootRequired', language, { name: shortHost(system) })),
    },
  };
}

/**
 * @description The event of a disk whose S.M.A.R.T. health changed.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ disk: object, previous: string }} change - The transition.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function healthEvent(gladys, { disk, previous }, language) {
  const name = diskLabel(disk);
  return {
    key: TRIGGERS.DISK_HEALTH_CHANGED,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.DISK, disk.id).device,
      device_name: text(t('diskDeviceName', language, { name })),
      health: disk.health,
      previous_health: previous,
      status: text(disk.status),
      disk: text(disk.devicefile),
      model: text(disk.model),
      serial: text(disk.serial),
      temperature: number(disk.temperature),
      summary: text(
        t(`summaryHealth_${disk.health}`, language, {
          name,
          status: disk.status ?? '?',
        }),
      ),
    },
  };
}

/**
 * @description The event of a file system crossing its warning threshold.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ fs: object, state: string }} change - above or below.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function usageEvent(gladys, { fs, state }, language) {
  const name = filesystemLabel(fs);
  return {
    key: TRIGGERS.FILESYSTEM_USAGE,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.FILESYSTEM, fs.id).device,
      device_name: text(t('filesystemDeviceName', language, { name })),
      state,
      used_percent: number(fs.used),
      threshold: number(fs.threshold),
      free_gb: gigabytes(fs.available),
      mountpoint: text(fs.mountpoint),
      summary: text(
        t(`summaryUsage_${state}`, language, {
          name,
          used: formatNumber(fs.used, language, 0),
          threshold: fs.threshold,
          free: formatBytes(fs.available, language),
        }),
      ),
    },
  };
}

/**
 * @description The event of a file system that disappeared or came back.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} fs - The file system snapshot (the last one known).
 * @param {string} state - missing or mounted.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function mountEvent(gladys, fs, state, language) {
  const name = filesystemLabel(fs);
  return {
    key: TRIGGERS.FILESYSTEM_MOUNT_CHANGED,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.FILESYSTEM, fs.id).device,
      device_name: text(t('filesystemDeviceName', language, { name })),
      state,
      mountpoint: text(fs.mountpoint),
      type: text(fs.type),
      summary: text(t(`summaryMount_${state}`, language, { name, mountpoint: fs.mountpoint })),
    },
  };
}

/**
 * @description The event of an enabled service that started or stopped.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ service: object }} change - The service.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function serviceEvent(gladys, { service }, language) {
  const state = service.running ? 'started' : 'stopped';
  return {
    key: TRIGGERS.SERVICE_STATE_CHANGED,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.SERVICE, service.id).device,
      device_name: text(t('serviceDeviceName', language, { name: service.title })),
      service: text(service.id),
      title: text(service.title),
      state,
      summary: text(t(`summaryService_${state}`, language, { name: service.title })),
    },
  };
}

/**
 * @description One sentence about the packages to upgrade.
 * @param {object|null} system - The NAS snapshot.
 * @param {string} language - The language.
 * @returns {string} The sentence.
 */
function updatesSummary(system, language) {
  if (typeof system?.updates !== 'number') {
    return t('updatesUnknown', language);
  }
  if (system.updates === 0) {
    return t('updatesUpToDate', language, { version: system.version ?? '?' });
  }
  const sentence = t('updatesSentence', language, { count: system.updates });
  return system.rebootRequired ? `${sentence} ${t('rebootSentence', language)}` : sentence;
}

/**
 * @description The outputs of the "read the status" scene action.
 * @param {object} snapshot - `{ system, disks, filesystems, missing, services }`.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
function statusOutputs({ system, disks, filesystems, missing, services }, language) {
  const fullest = filesystems
    .filter((fs) => typeof fs.used === 'number')
    .sort((a, b) => b.used - a.used)[0];
  const badDisks = disks.filter((disk) => disk.health === 'bad' || disk.health === 'warning');
  const stopped = services.filter((service) => service.enabled && !service.running);
  const temperatures = disks.map((disk) => disk.temperature).filter((v) => typeof v === 'number');
  const summary = [
    t('summaryStatus', language, {
      name: shortHost(system),
      cpu: formatNumber(system?.cpu, language, 0),
      memory: formatNumber(system?.memory, language, 0),
    }),
    fullest
      ? t('summaryStatusFullest', language, {
          name: filesystemLabel(fullest),
          used: formatNumber(fullest.used, language, 0),
        })
      : '',
    badDisks.length > 0 ? t('summaryStatusBadDisks', language, { count: badDisks.length }) : '',
    missing.length > 0 ? t('summaryStatusMissing', language, { count: missing.length }) : '',
    stopped.length > 0
      ? t('summaryStatusStopped', language, {
          names: stopped.map((service) => service.title).join(', '),
        })
      : '',
    updatesSummary(system, language),
  ]
    .filter(Boolean)
    .join(' ');
  return {
    cpu: number(system?.cpu),
    memory: number(system?.memory),
    uptime_days: number(system?.uptimeDays),
    updates: number(system?.updates),
    reboot_required: system?.rebootRequired ? 1 : 0,
    storage_used_max: number(fullest?.used),
    disk_temperature_max: temperatures.length > 0 ? Math.max(...temperatures) : -1,
    disks_failing: badDisks.length,
    services_stopped: stopped.length,
    version: text(system?.version),
    summary: text(summary),
  };
}

/**
 * @description The outputs of the "check for updates" scene action.
 * @param {object|null} system - The NAS snapshot read after the check.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
const updatesOutputs = (system, language) => ({
  updates: number(system?.updates),
  summary: text(updatesSummary(system, language)),
});

export {
  TRIGGERS,
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
};
