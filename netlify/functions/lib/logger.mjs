// Shared API call logger. Every real SDK/API call records to this buffer.
// The handler reads + clears it after each step via popLog().

const _log = [];

export function record(method, params, status, detail) {
  _log.push({
    ts: new Date().toISOString(),
    method,
    params: JSON.parse(JSON.stringify(params)),
    status,
    detail: detail || "",
  });
}

/** Return accumulated log entries and clear the buffer. */
export function popLog() {
  return _log.splice(0);
}
