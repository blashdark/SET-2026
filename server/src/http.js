'use strict';

const MAX_BODY_BYTES = 1_000_000; // cap body at 1MB to reject oversized payloads

function sendJson(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data); // JSON.stringify: serialize the payload
  res.writeHead(status, { // res.writeHead: write status line + headers
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body) // Buffer.byteLength: byte size for the header
  });
  res.end(body); // res.end: finish and send the response
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sendNoContent(res) {
  res.writeHead(204); // 204: no content
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;

    req.on('data', (chunk) => { // 'data' fires per chunk of the request body
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error('Payload too large');
        error.status = 413; // read by index.js to map to an HTTP code
        reject(error);
        req.destroy(); // destroy the connection, stop reading
        return;
      }
      raw += chunk;
    });

    req.on('end', () => { // 'end' fires once the whole body arrived
      if (!raw) return resolve({}); // empty body -> {} so requests without a body still work
      try {
        resolve(JSON.parse(raw)); // JSON.parse: parse the buffered body
      } catch {
        const error = new Error('Body is not valid JSON');
        error.status = 400;
        reject(error);
      }
    });

    req.on('error', reject); // 'error' from the socket
  });
}

module.exports = { sendJson, sendError, sendNoContent, readBody };
