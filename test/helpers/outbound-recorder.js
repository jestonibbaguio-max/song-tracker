// Fake for "the outside world".
//
// The backend has no email, SMS, payment, upload, queue, scheduler or
// third-party API integrations (see docs/backend-overview.md §1), so there is
// nothing service-specific to fake. Instead this records every outbound network
// connection the process attempts and blocks it, so a test can assert (and
// snapshot) that a request reached nothing outside the machine. Anything added
// later (an SMTP client, an HTTP SDK, fetch to a third party) goes through
// net.Socket#connect and will show up here instead of doing anything real.
//
// Loopback connections are allowed through untouched, because the test client
// talks to the API on 127.0.0.1.

const net = require('node:net');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);
const calls = [];
let installed = false;

function connectTarget(args) {
  // net.connect() passes a pre-normalised [options, cb] array; direct calls
  // pass (options[, cb]), (port[, host][, cb]) or (path[, cb]).
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === 'object') {
    return first.path ? { path: first.path } : { host: first.host ?? 'localhost', port: Number(first.port) };
  }
  if (typeof first === 'string' && Number.isNaN(Number(first))) return { path: first };
  return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(first) };
}

function install() {
  if (installed) return;
  installed = true;
  const originalConnect = net.Socket.prototype.connect;

  net.Socket.prototype.connect = function connect(...args) {
    const target = connectTarget(args);
    if (target.path === undefined && LOOPBACK_HOSTS.has(String(target.host).toLowerCase())) {
      return originalConnect.apply(this, args);
    }
    calls.push({ kind: 'network', ...target });
    const error = Object.assign(new Error(`Outbound connection blocked in tests: ${JSON.stringify(target)}`), {
      code: 'EOUTBOUNDBLOCKED',
    });
    process.nextTick(() => this.destroy(error));
    return this;
  };
}

/** Calls recorded since the last reset(), oldest first. */
function recordedCalls() {
  return calls.map((call) => ({ ...call }));
}

function reset() {
  calls.length = 0;
}

install();

module.exports = { recordedCalls, reset };
