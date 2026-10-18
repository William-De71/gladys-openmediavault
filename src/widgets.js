// -----------------------------------------------------------------------------
// Dashboard widgets of the OpenMediaVault integration.
//
//   - `overview`  the NAS at a glance: CPU and memory gauges, uptime,
//                 updates, disks, services, and three buttons (check for
//                 updates, reboot and shut down, with a confirmation);
//   - `storage`   the file systems and how full they are, or one of them
//                 (gauge, free space and the history of its usage once its
//                 device exists in Gladys);
//   - `disks`     the disks: temperature, standby, S.M.A.R.T. health.
//
// The contents come from the snapshots of the last reading: a widget never
// costs an OpenMediaVault call. Every text exists in the four languages (the
// content is cached per language and units). Content budget of a card: 8
// components, 1 main one (chart or card-list), 6 tiles, 2 texts, 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { t, formatNumber, formatBytes, ago } from './i18n.js';
import { shortHost, diskLabel, filesystemLabel } from './device.js';
import { updatesSummary } from './events.js';

const WIDGETS = { OVERVIEW: 'overview', STORAGE: 'storage', DISKS: 'disks' };
const WIDGET_ACTIONS = { CHECK_UPDATES: 'check_updates', REBOOT: 'reboot', SHUTDOWN: 'shutdown' };

const CHART_INTERVALS = [
  'last-hour',
  'last-twelve-hours',
  'last-day',
  'last-three-days',
  'last-week',
  'last-month',
];
const DEFAULT_INTERVAL = 'last-week';
const MAX_LIST_ITEMS = 8;
const TTL = { min: 10, max: 3600, message: 60 };
// Default warning threshold of a mount point in OpenMediaVault.
const DEFAULT_THRESHOLD = 85;

const HEALTH_COLORS = { good: 'success', warning: 'warning', bad: 'danger' };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('OpenMediaVault has not been read yet');
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

const ttlOf = (pollSeconds) => Math.min(TTL.max, Math.max(TTL.min, Math.round(pollSeconds)));

/**
 * @description A color for a load in %.
 * @param {number|null} value - The load.
 * @returns {string} The color.
 */
function loadColor(value) {
  if (typeof value !== 'number') {
    return 'neutral';
  }
  if (value >= 90) {
    return 'danger';
  }
  return value >= 75 ? 'warning' : 'success';
}

/**
 * @description A color for the usage of a file system: danger from the
 * warning threshold set in OpenMediaVault, warning in the 10 points before.
 * @param {number|null} used - The usage, in %.
 * @param {number|null} threshold - The threshold (85 % when none is set).
 * @returns {string} The color.
 */
function usageColor(used, threshold) {
  if (typeof used !== 'number') {
    return 'neutral';
  }
  const limit = threshold ?? DEFAULT_THRESHOLD;
  if (used >= limit) {
    return 'danger';
  }
  return used >= limit - 10 ? 'warning' : 'success';
}

/**
 * @description "12 d 4 h" out of days.
 * @param {number|null} days - The uptime.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function formatUptime(days, language) {
  if (typeof days !== 'number') {
    return '?';
  }
  const hours = Math.floor((days * 24) % 24);
  return t('uptimeValue', language, { days: Math.floor(days), hours });
}

/**
 * @description The `overview` widget.
 * @param {object} options - Options.
 * @param {object} options.system - The NAS snapshot (readSystem).
 * @param {Array<object>} options.disks - The disk snapshots.
 * @param {Array<object>} options.services - The service snapshots.
 * @param {Array<object>} options.missing - The file systems gone.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.fetchedAt - Time of the reading, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @returns {object} The content.
 * @example
 * buildOverviewWidget({ system, disks, services, missing: [], language: 'fr', now, fetchedAt, pollSeconds: 60 });
 */
function buildOverviewWidget({
  system,
  disks,
  services,
  missing = [],
  language,
  now,
  fetchedAt,
  pollSeconds,
}) {
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('overviewCaption', language, {
          name: shortHost(system),
          version: system.version ?? '?',
          ago: ago(fetchedAt, now, language),
        }),
        80,
      ),
    },
  ];
  // An unknown load is no gauge at all rather than a misleading 0 %.
  [
    [system.cpu, 'tileCpu', 'cpu'],
    [system.memory, 'tileMemory', 'layers'],
  ]
    .filter(([value]) => typeof value === 'number')
    .forEach(([value, label, icon]) =>
      components.push({
        type: 'gauge',
        value,
        min: 0,
        max: 100,
        unit: '%',
        label: t(label, language),
        icon,
        color: loadColor(value),
      }),
    );

  const rows = [
    {
      label: t('rowUptime', language),
      value: clip(formatUptime(system.uptimeDays, language), 40),
      icon: 'clock',
    },
    {
      label: t('rowUpdates', language),
      value: clip(updatesValue(system, language), 40),
      icon: 'download',
      color: system.updates > 0 ? 'warning' : system.updates === 0 ? 'success' : 'neutral',
    },
  ];
  if (system.rebootRequired) {
    rows.push({
      label: t('rowReboot', language),
      value: t('rowRebootRequired', language),
      icon: 'refresh-cw',
      color: 'warning',
    });
  }
  if (disks.length > 0) {
    const failing = disks.filter((disk) => disk.health === 'bad').length;
    const warning = disks.filter((disk) => disk.health === 'warning').length;
    rows.push({
      label: t('rowDisks', language),
      value: clip(disksValue(disks, language), 40),
      icon: 'hard-drive',
      color: failing > 0 ? 'danger' : warning > 0 ? 'warning' : 'success',
    });
  }
  if (missing.length > 0) {
    rows.push({
      label: t('rowFilesystems', language),
      value: clip(t('rowMissing', language, { count: missing.length }), 40),
      icon: 'alert-triangle',
      color: 'danger',
    });
  }
  const enabled = services.filter((service) => service.enabled);
  if (enabled.length > 0) {
    const stopped = enabled.filter((service) => !service.running);
    rows.push({
      label: t('rowServices', language),
      value: clip(
        stopped.length === 0
          ? t('servicesRunning', language, { count: enabled.length })
          : t('servicesStopped', language, {
              names: stopped.map((service) => service.title).join(', '),
            }),
        40,
      ),
      icon: 'server',
      color: stopped.length > 0 ? 'danger' : 'success',
    });
  }
  components.push({ type: 'status', items: rows });

  components.push(
    {
      type: 'button',
      label: t('buttonCheckUpdates', language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.CHECK_UPDATES },
    },
    {
      type: 'button',
      label: t('buttonReboot', language),
      icon: 'rotate-ccw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.REBOOT, confirm: true },
    },
    {
      type: 'button',
      label: t('buttonShutdown', language),
      icon: 'power',
      style: 'danger',
      action: { key: WIDGET_ACTIONS.SHUTDOWN, confirm: true },
    },
  );
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The short state of the packages to upgrade.
 * @param {object} system - The NAS snapshot.
 * @param {string} language - The language.
 * @returns {string} The value.
 */
function updatesValue(system, language) {
  if (typeof system.updates !== 'number') {
    return t('updatesUnchecked', language);
  }
  if (system.updates === 0) {
    return t('updatesNone', language);
  }
  return t('updatesCount', language, { count: system.updates });
}

/**
 * @description "3 · up to 41 °C", "1 failing of 3" or "1 to watch of 3" for the disks row.
 * @param {Array<object>} disks - The disk snapshots.
 * @param {string} language - The language.
 * @returns {string} The value.
 */
function disksValue(disks, language) {
  const failing = disks.filter((disk) => disk.health === 'bad');
  if (failing.length > 0) {
    return t('disksFailing', language, { count: failing.length, total: disks.length });
  }
  const watched = disks.filter((disk) => disk.health === 'warning');
  if (watched.length > 0) {
    return t('disksWatched', language, { count: watched.length, total: disks.length });
  }
  const temperatures = disks.map((disk) => disk.temperature).filter((v) => typeof v === 'number');
  return temperatures.length > 0
    ? t('disksHottest', language, {
        count: disks.length,
        temperature: formatNumber(Math.max(...temperatures), language, 0),
      })
    : t('disksCount', language, { count: disks.length });
}

/**
 * @description The settings of the `storage` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ filesystem: string|null, interval: string }} The settings.
 */
function readStorageSettings(settings = {}) {
  return {
    filesystem:
      typeof settings.filesystem === 'string' && settings.filesystem ? settings.filesystem : null,
    interval: CHART_INTERVALS.includes(settings.interval) ? settings.interval : DEFAULT_INTERVAL,
  };
}

/**
 * @description "1.2 TiB free of 3.6 TiB".
 * @param {object} fs - The file system snapshot.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const freeOf = (fs, language) =>
  t('freeOf', language, {
    free: formatBytes(fs.available, language),
    size: formatBytes(fs.size, language),
  });

/**
 * @description The `storage` widget: every file system, or one of them.
 * @param {object} options - Options.
 * @param {Array<object>} options.filesystems - The mounted file systems.
 * @param {Array<object>} options.missing - The file systems gone.
 * @param {string} options.language - The user language.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {object|null} [options.chosen] - The file system of the settings.
 * @param {Function|null} [options.featureId] - `(key) => external id` of its
 * features, null when its device is not created (no chart then: the core has
 * no history of it).
 * @param {string} [options.interval] - The chart period.
 * @returns {object} The content.
 */
function buildStorageWidget({
  filesystems,
  missing = [],
  language,
  pollSeconds,
  chosen = null,
  featureId = null,
  interval = DEFAULT_INTERVAL,
}) {
  if (chosen) {
    const components = [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          [filesystemLabel(chosen), chosen.type?.toUpperCase(), chosen.mountpoint]
            .filter(Boolean)
            .join(' · '),
          80,
        ),
      },
    ];
    if (typeof chosen.used === 'number') {
      components.push({
        type: 'gauge',
        value: chosen.used,
        min: 0,
        max: 100,
        unit: '%',
        label: t('tileUsed', language),
        icon: 'hard-drive',
        color: usageColor(chosen.used, chosen.threshold),
      });
    }
    components.push(
      {
        type: 'value',
        value: formatBytes(chosen.available, language),
        label: t('tileFree', language),
        icon: 'database',
        color: 'info',
      },
      {
        type: 'value',
        value: formatBytes(chosen.size, language),
        label: t('tileSize', language),
        icon: 'archive',
        color: 'neutral',
      },
    );
    if (featureId) {
      components.push({
        type: 'chart',
        device_features: [featureId('used')],
        interval,
        chart_type: 'line',
        title: t('chartUsed', language),
        unit: '%',
      });
    }
    return { ttl_seconds: ttlOf(pollSeconds), components };
  }

  if (filesystems.length === 0 && missing.length === 0) {
    return messageContent(t('noFilesystems', language), ttlOf(pollSeconds));
  }
  const free = filesystems.reduce((sum, fs) => sum + (fs.available ?? 0), 0);
  const size = filesystems.reduce((sum, fs) => sum + (fs.size ?? 0), 0);
  const items = [
    ...missing.map((fs) => ({
      title: clip(filesystemLabel(fs), 60),
      subtitle: clip(fs.mountpoint ?? '', 60),
      badge: { text: clip(t('badgeMissing', language), 16), color: 'danger' },
    })),
    ...[...filesystems]
      .sort((a, b) => (b.used ?? -1) - (a.used ?? -1))
      .map((fs) => ({
        title: clip(filesystemLabel(fs), 60),
        subtitle: clip([freeOf(fs, language), fs.mountpoint].filter(Boolean).join(' · '), 60),
        badge: {
          text: typeof fs.used === 'number' ? `${formatNumber(fs.used, language, 0)} %` : '?',
          color: usageColor(fs.used, fs.threshold),
        },
      })),
  ];
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          t('storageCaption', language, {
            count: filesystems.length,
            free: formatBytes(free, language),
            size: formatBytes(size, language),
          }),
          80,
        ),
      },
      { type: 'card-list', display: 'list', items: items.slice(0, MAX_LIST_ITEMS) },
    ],
  };
}

/**
 * @description The `disks` widget: failing disks first, then by name.
 * @param {object} options - Options.
 * @param {Array<object>} options.disks - The disk snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} options.smartHealth - awake, always or off.
 * @param {number|null} options.smartAt - Time of the last S.M.A.R.T. reading.
 * @param {boolean} options.smartWaiting - A reading waits for a sleeping disk.
 * @returns {object} The content.
 */
function buildDisksWidget({
  disks,
  language,
  now,
  pollSeconds,
  smartHealth,
  smartAt,
  smartWaiting,
}) {
  if (disks.length === 0) {
    return messageContent(t('noDisks', language), ttlOf(pollSeconds));
  }
  const rank = { bad: 0, warning: 1, good: 2 };
  const sorted = [...disks].sort(
    (a, b) =>
      (rank[a.health] ?? 3) - (rank[b.health] ?? 3) ||
      diskLabel(a).localeCompare(diskLabel(b), language),
  );
  let caption;
  if (smartHealth === 'off') {
    caption = t('smartOff', language);
  } else if (smartAt === null) {
    caption = t(smartWaiting ? 'smartWaiting' : 'smartNotYet', language);
  } else {
    caption = t('smartRead', language, { ago: ago(smartAt, now, language) });
  }
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(`${t('disksCount', language, { count: disks.length })} · ${caption}`, 80),
      },
      {
        type: 'card-list',
        display: 'list',
        items: sorted.slice(0, MAX_LIST_ITEMS).map((disk) => ({
          title: clip(diskLabel(disk), 60),
          subtitle: clip(
            [
              typeof disk.temperature === 'number'
                ? `${formatNumber(disk.temperature, language, 0)} °C`
                : null,
              disk.power === 'unknown' ? null : t(`power_${disk.power}`, language),
              disk.devicefile,
              formatBytes(disk.size, language),
            ]
              .filter(Boolean)
              .join(' · '),
            60,
          ),
          badge: {
            text: clip(t(disk.health ? `health_${disk.health}` : 'health_unknown', language), 16),
            color: HEALTH_COLORS[disk.health] ?? 'neutral',
          },
        })),
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  CHART_INTERVALS,
  DEFAULT_INTERVAL,
  clip,
  messageContent,
  formatUptime,
  updatesSummary,
  readStorageSettings,
  buildOverviewWidget,
  buildStorageWidget,
  buildDisksWidget,
};
