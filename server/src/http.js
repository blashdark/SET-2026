'use strict';

const MAX_BODY_BYTES = 1_000_000; // cap body at 1MB to reject oversized payloads

function sendJson(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error('Payload qua lon');
        error.status = 413; // read by index.js to map to an HTTP code
        reject(error);
        req.destroy(); // destroy the connection, stop reading
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw) return resolve({}); // empty body -> {} so requests without a body still work
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error('Body khong phai JSON hop le');
        error.status = 400;
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

module.exports = { sendJson, sendError, sendNoContent, readBody };
