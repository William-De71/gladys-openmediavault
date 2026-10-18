// The OpenMediaVault client: sessions, cookies, errors. One test starts a
// local HTTP server on 127.0.0.1 to check the real transport (nodeRequest):
// no outside network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { createOmvClient, nodeRequest, readSetCookies } from '../src/omv-api.js';
import { omv, errorAnswer, PASSWORD } from './helpers/fixtures.js';

const config = {
  url: 'http://192.168.1.10',
  username: 'admin',
  password: PASSWORD,
  verifyTls: false,
};

test('logs in once, then sends the session as a cookie and a header', async () => {
  const request = omv();
  const api = createOmvClient({ getConfig: () => config, request });
  await api.systemInformation();
  await api.services();
  assert.deepEqual(
    request.calls.map((call) => call.call),
    ['Session.login', 'System.getInformation', 'Services.getStatus'],
  );
  assert.deepEqual(request.calls[0].params, { username: 'admin', password: PASSWORD });
  assert.match(request.lastHeaders.Cookie, /OPENMEDIAVAULT-SESSIONID=0+1; OPENMEDIAVAULT-LOGIN-/);
  assert.equal(request.lastHeaders['Content-Type'], 'application/json');
  assert.equal(request.lastHeaders['X-OPENMEDIAVAULT-SESSIONID'].length, 32);
});

test('an expired session logs in again once, then the call goes through', async () => {
  const request = omv();
  const api = createOmvClient({ getConfig: () => config, request });
  await api.systemInformation();
  request.expireSessions();
  const info = await api.systemInformation();
  assert.equal(info.hostname, 'nas.home.lan');
  assert.equal(request.logins, 2);
});

test('a new user, password or address logs in again', async () => {
  const request = omv();
  let current = config;
  const api = createOmvClient({ getConfig: () => current, request });
  await api.systemInformation();
  current = { ...config, url: 'http://192.168.1.11' };
  await api.systemInformation();
  assert.equal(request.logins, 2);
});

test('errors carry a kind the app turns into a message; never the trace', async () => {
  const cases = [
    [() => errorAnswer(400, 'Incorrect username or password.'), 'auth'],
    [() => errorAnswer(429, 'Too many failed verification attempts.'), 'rate_limited'],
    [() => errorAnswer(500, 'Invalid context role.'), 'not_admin'],
    [
      () => errorAnswer(500, "The method 'x' does not exist for the RPC service 'System'."),
      'not_found',
    ],
    [() => errorAnswer(404, "RPC service 'Nope' not found."), 'not_found'],
    [() => errorAnswer(500, 'Failed to execute command'), 'rpc'],
    [() => ({ status: 502, headers: {}, body: '<html>Bad gateway</html>' }), 'http'],
    [() => ({ status: 200, headers: {}, body: '{"items":[]}' }), 'http'],
  ];
  for (const [answer, kind] of cases) {
    const request = async () => answer();
    const api = createOmvClient({ getConfig: () => config, request });
    await assert.rejects(
      api.systemInformation(),
      (err) =>
        err.kind === kind && !err.message.includes('trace') && !err.message.includes('/usr/'),
      kind,
    );
  }
  for (const [code, kind] of [
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls'],
    ['ECONNREFUSED', 'unreachable'],
    ['ETIMEDOUT', 'unreachable'],
  ]) {
    const request = async () => {
      throw Object.assign(new Error(code), { code });
    };
    const api = createOmvClient({ getConfig: () => config, request });
    await assert.rejects(api.systemInformation(), (err) => err.kind === kind, code);
  }
});

test('a login that needs a second factor, or an account without the admin role, is refused', async () => {
  const mfa = omv();
  mfa.setMfa(true);
  await assert.rejects(
    createOmvClient({ getConfig: () => config, request: mfa }).systemInformation(),
    (err) => err.kind === 'mfa',
  );
  const user = omv();
  user.setRole('user');
  await assert.rejects(
    createOmvClient({ getConfig: () => config, request: user }).systemInformation(),
    (err) => err.kind === 'not_admin',
  );
  assert.equal(user.calls.length, 1, 'no reading after the refused login');
});

test('the 6.x and 7.x login answer (authenticated: true) is accepted', async () => {
  const request = omv();
  const old = async (options) => {
    const answer = await request(options);
    const body = JSON.parse(answer.body);
    if (body.response?.status === 'authenticated') {
      const { sessionid, username, permissions } = body.response;
      body.response = { authenticated: true, username, permissions, sessionid };
      return { ...answer, body: JSON.stringify(body) };
    }
    return answer;
  };
  const api = createOmvClient({ getConfig: () => config, request: old });
  assert.equal((await api.systemInformation()).hostname, 'nas.home.lan');
});

test('no request without an address, a user and a password; never the password in an error', async () => {
  const request = omv();
  const api = createOmvClient({ getConfig: () => ({ ...config, password: '' }), request });
  await assert.rejects(api.systemInformation(), (err) => err.kind === 'auth');
  assert.equal(request.calls.length, 0);
  const wrong = omv();
  wrong.setPassword('other');
  await assert.rejects(
    createOmvClient({ getConfig: () => config, request: wrong }).systemInformation(),
    (err) => !err.message.includes(PASSWORD),
  );
});

test('only the browser cookie is kept, and sent back at the next login, never the session', async () => {
  const kept = [];
  const request = omv();
  const cookies = { get: () => ({}), set: (value) => kept.push(value) };
  const api = createOmvClient({ getConfig: () => config, request, cookies });
  await api.systemInformation();
  assert.deepEqual(Object.keys(kept.at(-1)), ['OPENMEDIAVAULT-LOGIN-2432792431322455']);

  const next = omv();
  const stored = { get: () => kept.at(-1), set: () => {} };
  await createOmvClient({ getConfig: () => config, request: next, cookies: stored }).services();
  assert.equal(
    next.loginCookies[0],
    'OPENMEDIAVAULT-LOGIN-2432792431322455=Without%20change%20something%20sleeps%20inside%20us.',
  );
});

test('readSetCookies: names, values, deletions', () => {
  assert.deepEqual(
    readSetCookies({
      'set-cookie': [
        'A=1; path=/; HttpOnly',
        'B=; expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'C=3; Max-Age=0',
        'broken',
      ],
    }),
    [
      { name: 'A', value: '1', expired: false },
      { name: 'B', value: '', expired: true },
      { name: 'C', value: '3', expired: true },
    ],
  );
  assert.deepEqual(readSetCookies({}), []);
});

test('logout closes the session, best effort', async () => {
  const request = omv();
  const api = createOmvClient({ getConfig: () => config, request });
  await api.systemInformation();
  assert.equal(api.hasSession(), true);
  await api.logout();
  assert.equal(api.hasSession(), false);
  assert.equal(request.calls.at(-1).call, 'Session.logout');
  await api.logout();
  assert.equal(request.callsOf('Session.logout').length, 1);
});

test('commands send the parameters OpenMediaVault validates', async () => {
  const request = omv();
  const api = createOmvClient({ getConfig: () => config, request });
  await api.reboot(30);
  await api.shutdown();
  await api.runRsyncJob('e896415d-a07f-4e5a-9586-df1ec35308fe');
  await api.filesystems();
  await api.rsyncJobs();
  assert.deepEqual(
    request.calls.slice(1).map((call) => [call.call, call.params]),
    [
      ['System.reboot', { delay: 30 }],
      ['System.shutdown', { delay: 0 }],
      ['Rsync.execute', { uuid: 'e896415d-a07f-4e5a-9586-df1ec35308fe' }],
      ['FileSystemMgmt.enumerateMountedFilesystems', { includeroot: true }],
      ['Rsync.getList', { start: 0, limit: null }],
    ],
  );
});

test('nodeRequest: POST to rpc.php, cookies of the answer, JSON parsed', async (t) => {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const { service, method } = JSON.parse(body);
      seen.push([req.method, req.url, `${service}.${method}`, req.headers.cookie ?? '']);
      if (service === 'Session') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': ['OPENMEDIAVAULT-SESSIONID=abc; path=/; HttpOnly'],
        });
        res.end(
          JSON.stringify({
            response: { status: 'authenticated', permissions: { role: 'admin' }, sessionid: 'abc' },
            error: null,
          }),
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response: { total: 0, data: [] }, error: null }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const local = { ...config, url: `http://127.0.0.1:${server.address().port}` };
  const api = createOmvClient({ getConfig: () => local, request: nodeRequest });
  assert.deepEqual(await api.services(), { total: 0, data: [] });
  assert.deepEqual(seen, [
    ['POST', '/rpc.php', 'Session.login', ''],
    ['POST', '/rpc.php', 'Services.getStatus', 'OPENMEDIAVAULT-SESSIONID=abc'],
  ]);
});

test('nodeRequest: a closed port is unreachable', async () => {
  const api = createOmvClient({
    getConfig: () => ({ ...config, url: 'http://127.0.0.1:9' }),
    request: nodeRequest,
  });
  await assert.rejects(api.systemInformation(), (err) => err.kind === 'unreachable');
});
