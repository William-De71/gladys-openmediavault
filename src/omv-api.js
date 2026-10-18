// -----------------------------------------------------------------------------
// Client of the OpenMediaVault RPC API: the JSON calls the web interface
// itself sends to /rpc.php (`{ service, method, params, options }`).
//
// Authentication: a session of the web interface. `Session.login` with the
// user name and password opens it; OpenMediaVault answers with a session
// cookie and, since 6.x, a `sessionid` (sent back in the
// X-OPENMEDIAVAULT-SESSIONID header as well). The session is bound to the
// User-Agent and expires after the timeout of the web interface (5 minutes by
// default) without a call: a 401 logs in again, once.
//
// OpenMediaVault e-mails the user at the first login from a new browser, and
// sets a long-lived OPENMEDIAVAULT-LOGIN-* cookie to recognize it. That cookie
// is kept in /data (store.js), so a restart of the container is not a new
// browser; the session itself is never written to disk.
//
// Every call used here exists in OpenMediaVault 6, 7 and 8; the answers come
// from the RPC services of openmediavault/openmediavault and were checked
// against a real 8.5 (see test/helpers/fixtures.js). Errors carry a `kind` the
// app turns into a message:
//   auth         wrong user name or password (400 on Session.login)
//   not_admin    the account has no admin role ("Invalid context role")
//   mfa          the account needs a second factor: not supported
//   rate_limited too many failed attempts (429)
//   not_found    unknown service or method (plugin missing, older version)
//   tls          the certificate is refused (verify_tls on)
//   unreachable  network error, timeout
//   rpc          any other error OpenMediaVault reports (its message)
//   http         an answer that is not the RPC JSON
// -----------------------------------------------------------------------------

import https from 'node:https';
import http from 'node:http';

const TIMEOUT_MS = 30000;
// The cookie OpenMediaVault sets to recognize a browser it already e-mailed about.
const BROWSER_COOKIE = /^[A-Z]+-LOGIN-/;

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

class OmvError extends Error {
  /**
   * @param {string} kind - See the header of this file.
   * @param {string} message - The message (never carries the password).
   * @param {number} [status] - The HTTP status.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'OmvError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The error of a failed connection.
 * @param {Error} err - The socket error.
 * @returns {OmvError} The error.
 */
function networkError(err) {
  if (err instanceof OmvError) {
    return err;
  }
  if (TLS_CODES.has(err.code)) {
    return new OmvError('tls', `HTTPS certificate refused: ${err.code}`);
  }
  return new OmvError('unreachable', `OpenMediaVault unreachable: ${err.code ?? err.message}`);
}

/**
 * @description The error of an RPC answer (`{ response: null, error }`). The
 * trace OpenMediaVault adds is never kept: it can quote the parameters.
 * @param {number} status - The HTTP status.
 * @param {object|null} error - The `error` member.
 * @param {string} call - "Service.method".
 * @returns {OmvError} The error.
 */
function rpcError(status, error, call) {
  const message = String(error?.message ?? `HTTP ${status}`).slice(0, 300);
  if (status === 401 || /^Session (not authenticated|expired)/i.test(message)) {
    return new OmvError('session', `${call}: ${message}`, status);
  }
  if (status === 429) {
    return new OmvError('rate_limited', `${call}: ${message}`, status);
  }
  if (/Incorrect username or password/i.test(message)) {
    return new OmvError('auth', `${call}: ${message}`, status);
  }
  if (/Invalid context role/i.test(message)) {
    return new OmvError('not_admin', `${call}: ${message}`, status);
  }
  if (
    status === 404 ||
    /does not exist for the RPC service|RPC service '.*' not found/i.test(message)
  ) {
    return new OmvError('not_found', `${call}: ${message}`, status);
  }
  return new OmvError('rpc', `${call}: ${message}`, status);
}

/**
 * @description The default transport: one HTTP(S) request, its whole body.
 * @param {object} options - `{ url, method, headers, body, rejectUnauthorized, timeoutMs }`.
 * @returns {Promise<{ status: number, headers: object, body: string }>} The answer.
 */
function nodeRequest({ url, method, headers, body, rejectUnauthorized, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(
      target,
      { method, headers, rejectUnauthorized, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * @description The `name=value` pairs of the Set-Cookie headers of an answer.
 * @param {object} [headers] - The answer headers.
 * @returns {Array<{ name: string, value: string, expired: boolean }>} The cookies.
 * @example
 * readSetCookies({ 'set-cookie': ['A=1; path=/'] }); // -> [{ name: 'A', value: '1', expired: false }]
 */
function readSetCookies(headers = {}) {
  const raw = headers['set-cookie'] ?? headers['Set-Cookie'] ?? [];
  return (Array.isArray(raw) ? raw : [raw]).flatMap((line) => {
    const [pair, ...attributes] = String(line).split(';');
    const at = pair.indexOf('=');
    if (at <= 0) {
      return [];
    }
    const expired = attributes.some((attribute) => {
      const [key, value = ''] = attribute.trim().split('=');
      if (/^max-age$/i.test(key)) {
        return Number(value) <= 0;
      }
      return /^expires$/i.test(key) && Date.parse(value) < Date.now();
    });
    return [{ name: pair.slice(0, at).trim(), value: pair.slice(at + 1).trim(), expired }];
  });
}

/**
 * @description Create the OpenMediaVault client.
 * @param {object} options - Options.
 * @param {Function} options.getConfig - `() => ({ url, username, password, verifyTls })`.
 * @param {Function} [options.request] - Transport (tests): same contract as nodeRequest.
 * @param {string} [options.userAgent] - User-Agent header (the session is bound to it).
 * @param {object} [options.cookies] - `{ get(): object, set(object): Promise }`:
 * the browser cookie kept between restarts (store.js).
 * @returns {object} The client.
 * @example
 * const api = createOmvClient({ getConfig: () => config });
 * await api.systemInformation();
 */
function createOmvClient({
  getConfig,
  request = nodeRequest,
  userAgent = 'gladys-openmediavault',
  cookies = null,
}) {
  // name -> value, the cookies of the current session and the browser cookie.
  let jar = new Map();
  let sessionId = null;
  let loggingIn = null;
  // The account of the session (a change of user logs in again).
  let sessionOf = null;

  /**
   * @description Keep the cookies of an answer; store the browser cookie.
   * @param {object} headers - The answer headers.
   */
  function keepCookies(headers) {
    let browserChanged = false;
    for (const { name, value, expired } of readSetCookies(headers)) {
      if (expired) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
      browserChanged ||= BROWSER_COOKIE.test(name);
    }
    if (browserChanged && cookies) {
      const kept = Object.fromEntries([...jar].filter(([name]) => BROWSER_COOKIE.test(name)));
      Promise.resolve(cookies.set(kept)).catch(() => {});
    }
  }

  /**
   * @description Send one RPC and parse its answer.
   * @param {string} service - The RPC service.
   * @param {string} method - Its method.
   * @param {object|null} params - The parameters.
   * @param {object} [extra] - `{ timeoutMs }`.
   * @returns {Promise<any>} The `response` member.
   */
  async function send(service, method, params, extra = {}) {
    const { url, verifyTls } = getConfig();
    const call = `${service}.${method}`;
    const body = JSON.stringify({
      service,
      method,
      params: params ?? null,
      options: { updatelastaccess: true },
    });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Accept: 'application/json',
      'User-Agent': userAgent,
    };
    if (jar.size > 0) {
      headers.Cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (sessionId) {
      headers['X-OPENMEDIAVAULT-SESSIONID'] = sessionId;
    }
    let answer;
    try {
      answer = await request({
        url: `${url}/rpc.php`,
        method: 'POST',
        headers,
        body,
        rejectUnauthorized: verifyTls,
        timeoutMs: extra.timeoutMs ?? TIMEOUT_MS,
      });
    } catch (err) {
      throw networkError(err);
    }
    keepCookies(answer.headers);
    let parsed;
    try {
      parsed = JSON.parse(answer.body);
    } catch {
      // A proxy page, the web interface of something else, a 502...
      throw new OmvError(
        answer.status === 404 ? 'not_found' : 'http',
        `${call}: OpenMediaVault answered ${answer.status} without RPC JSON`,
        answer.status,
      );
    }
    if (!parsed || typeof parsed !== 'object' || !('response' in parsed || 'error' in parsed)) {
      throw new OmvError('http', `${call}: not an OpenMediaVault RPC answer`, answer.status);
    }
    if (parsed.error) {
      throw rpcError(answer.status, parsed.error, call);
    }
    if (answer.status !== 200) {
      throw rpcError(answer.status, null, call);
    }
    return parsed.response;
  }

  /**
   * @description Open a session. Concurrent callers share the same login.
   * @returns {Promise<void>}
   */
  function login() {
    if (!loggingIn) {
      loggingIn = (async () => {
        const { url, username, password } = getConfig();
        if (!url || !username || !password) {
          throw new OmvError('auth', 'No OpenMediaVault address, user or password configured');
        }
        sessionId = null;
        // Keep only the browser cookie (the stored one, read after the store
        // loaded): an old session cookie must not be sent.
        jar = new Map(
          [...Object.entries(cookies?.get() ?? {}), ...jar].filter(([name]) =>
            BROWSER_COOKIE.test(name),
          ),
        );
        const answer = await send('Session', 'login', { username, password });
        // 8.5 and later: `status`; older versions: `authenticated`.
        if (answer?.status === 'challengeRequired') {
          throw new OmvError('mfa', `The account ${username} needs a second factor to log in`);
        }
        if (answer?.status !== 'authenticated' && answer?.authenticated !== true) {
          throw new OmvError('auth', 'OpenMediaVault refused the login');
        }
        if (answer?.permissions?.role && answer.permissions.role !== 'admin') {
          throw new OmvError('not_admin', `The account ${username} has no admin role`);
        }
        sessionId = typeof answer?.sessionid === 'string' ? answer.sessionid : null;
        sessionOf = `${url}|${username}|${password}`;
      })().finally(() => {
        loggingIn = null;
      });
    }
    return loggingIn;
  }

  /**
   * @description Call an RPC method with a session: log in first when needed,
   * and once again when the session expired.
   * @param {string} service - The RPC service.
   * @param {string} method - Its method.
   * @param {object|null} [params] - The parameters.
   * @param {object} [extra] - `{ timeoutMs }`.
   * @returns {Promise<any>} The answer.
   */
  async function rpc(service, method, params = null, extra = {}) {
    const { url, username, password } = getConfig();
    if (sessionOf !== `${url}|${username}|${password}`) {
      sessionOf = null;
      await login();
    }
    try {
      return await send(service, method, params, extra);
    } catch (err) {
      if (err.kind !== 'session') {
        throw err;
      }
      sessionOf = null;
      await login();
      return send(service, method, params, extra);
    }
  }

  /**
   * @description Close the session (best effort, on shutdown).
   * @returns {Promise<void>}
   */
  async function logout() {
    if (!sessionOf) {
      return;
    }
    sessionOf = null;
    try {
      await send('Session', 'logout', null, { timeoutMs: 3000 });
    } catch {
      // The session expires on its own.
    }
    sessionId = null;
  }

  const list = { start: 0, limit: null };

  return {
    login: async () => {
      sessionOf = null;
      await login();
    },
    logout,
    // Whether a session is open (tests).
    hasSession: () => sessionOf !== null,
    rpc,

    // --- reading ---------------------------------------------------------------
    // CPU (measured over one second), memory, uptime, updates, reboot required.
    systemInformation: () => rpc('System', 'getInformation'),
    // Disks: model, serial, power mode and temperature without waking a disk
    // in standby (smartctl --nocheck=standby).
    disks: () => rpc('DiskMgmt', 'enumerateDevices'),
    // S.M.A.R.T. of every physical disk, overall status included: smartctl
    // runs on each disk, WITHOUT --nocheck, so a disk in standby spins up.
    smartList: () => rpc('Smart', 'getList', list, { timeoutMs: 120000 }),
    // The mounted file systems that have a mount point in OpenMediaVault.
    filesystems: () => rpc('FileSystemMgmt', 'enumerateMountedFilesystems', { includeroot: true }),
    filesystemsWithoutRoot: () =>
      rpc('FileSystemMgmt', 'enumerateMountedFilesystems', { includeroot: false }),
    services: () => rpc('Services', 'getStatus'),
    rsyncJobs: () => rpc('Rsync', 'getList', list),

    // --- background jobs -------------------------------------------------------
    // The output of a background job; `running: false` once it is over (the
    // status file is then removed by OpenMediaVault). A failed job throws its error.
    jobOutput: (filename) => rpc('Exec', 'getOutput', { filename, pos: 0 }),

    // --- commands --------------------------------------------------------------
    // Each returns the status file name of its background job.
    runRsyncJob: (uuid) => rpc('Rsync', 'execute', { uuid }),
    aptUpdate: () => rpc('Apt', 'update'),
    reboot: (delay = 0) => rpc('System', 'reboot', { delay }),
    shutdown: (delay = 0) => rpc('System', 'shutdown', { delay }),
  };
}

export { createOmvClient, OmvError, nodeRequest, readSetCookies, BROWSER_COOKIE };
