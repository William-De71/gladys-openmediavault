// -----------------------------------------------------------------------------
// Entry point of the OpenMediaVault external integration.
//
// Brings an OpenMediaVault NAS into Gladys, over the RPC API of its web
// interface on the LAN:
//   - devices: the NAS, its disks, its file systems and its enabled
//     services, offered on the Discovery screen (see src/device.js);
//   - scene triggers: NAS unreachable or back, NAS restarted, updates
//     available, reboot required, disk health changed, file system above its
//     warning threshold, file system missing, service started or stopped;
//   - scene actions: read the status, run an rsync job, check for updates,
//     reboot, shut down;
//   - dashboard widgets: overview, storage, disks.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the OpenMediaVault integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
