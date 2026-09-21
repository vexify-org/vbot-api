'use strict';

const http = require('http');
const URL = require('url');

/**
 * VBot Context — wraps HTTP request/response into a unified object
 */
class Context {
  constructor(req, res, options = {}) {
    this.req = req;
    this.res = res;
    this.options = options;

    // Parse URL
    const parsed = URL.parse(req.url, true);
    this.url = req.url;
    this.path = parsed.pathname || '/';
    this.query = parsed.query || {};
    this.search = parsed.search || null;

    // HTTP basics
    this.method = req.method || 'GET';
    this.protocol = (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
    this.hostname = req.headers.host || 'localhost';
    this.href = `${this.protocol}://${this.hostname}${this.path}`;

    // Headers (case-insensitive access via helper)
    this.headers = {};
    for (const [key, val] of Object.entries(req.headers)) {
      this.headers[key.toLowerCase()] = val;
    }

    // Body (lazy parsed)
    this._body = null;
    this._bodyParsed = false;

    // Response state
    this.statusCode = 200;
    this._body = null;
    this.type = 'json'; // default response type
    this.headerSent = false;

    // App reference (set by app)
    this.app = null;
    this.logger = null;

    // Request state
    this.params = {};
    this.state = {}; // shared state object for middleware

    // IP
    this.ip = this._getClientIP();

    // Trust proxy
    this.trustProxy = options.trustProxy || false;
  }

  _getClientIP() {
    const headers = this.headers;
    if (this.trustProxy) {
      return headers['x-forwarded-for']?.split(',')[0]?.trim()
        || headers['x-real-ip']
        || this.req.socket?.remoteAddress
        || '';
    }
    return this.req.socket?.remoteAddress || '';
  }

  // ── Request helpers ────────────────────────────────────────────
  get header() {
    return this.headers;
  }

  get(key) {
    return this.headers[key?.toLowerCase()];
  }

  get accepts() {
    return accept(this.headers['accept'] || '*/*');
  }

  get is() {
    return contentType(this.headers['content-type'] || '');
  }

  get length() {
    return parseInt(this.headers['content-length'] || '0', 10);
  }

  // ── Response helpers ────────────────────────────────────────────
  get status() {
    return this.statusCode;
  }

  set status(code) {
    this.statusCode = code;
    if (!this.headerSent) {
      this.res.statusCode = code;
    }
  }

  get body() {
    return this._body;
  }

  set body(val) {
    this._body = val;
    if (this._body === null || this._body === undefined) return;
    if (this.headerSent) return;

    // Auto-set content-type
    if (!this.res.getHeader('Content-Type')) {
      const ct = this.type === 'json' ? 'application/json' : this.type.startsWith('text/') ? this.type : 'application/octet-stream';
      this.res.setHeader('Content-Type', ct);
    }
  }

  get headerSent() {
    return this.res.headersSent;
  }

  set(key, value) {
    this.res.setHeader(String(key), String(value));
    return this;
  }

  append(key, value) {
    const existing = this.res.getHeader(String(key));
    if (existing) {
      this.res.setHeader(String(key), Array.isArray(existing) ? [...existing, value] : [existing, value]);
    } else {
      this.res.setHeader(String(key), String(value));
    }
    return this;
  }

  set type(ct) {
    this._contentType = ct;
    if (!this.headerSent) {
      this.res.setHeader('Content-Type', ct);
    }
  }

  get type() {
    return this._contentType || 'application/json';
  }

  get(length) {
    return this.res.getHeader('Content-Length');
  }

  redirect(url, alt) {
    if (!this.headerSent) {
      this.res.statusCode = 302;
      this.res.setHeader('Location', url);
    }
    this.body = `Redirecting to ${url}`;
    return this;
  }

  remove(key) {
    this.res.removeHeader(String(key));
    return this;
  }

  // ── Body parsing ────────────────────────────────────────────────
  async json() {
    if (this._bodyParsed) return this._body;
    return this._parseBody('json');
  }

  async text() {
    if (this._bodyParsed) return this._body;
    return this._parseBody('text');
  }

  async form() {
    if (this._bodyParsed) return this._body;
    return this._parseBody('form');
  }

  async _parseBody(type) {
    if (this._bodyParsed) return this._body;

    const raw = await this._rawBody();
    if (!raw) {
      this._body = type === 'json' ? {} : '';
      this._bodyParsed = true;
      return this._body;
    }

    try {
      switch (type) {
        case 'json':
          this._body = JSON.parse(raw);
          break;
        case 'form':
          this._body = parseFormData(raw);
          break;
        default:
          this._body = raw;
      }
    } catch {
      this._body = type === 'json' ? {} : raw;
    }

    this._bodyParsed = true;
    return this._body;
  }

  _rawBody() {
    return new Promise((resolve, reject) => {
      const chunks = [];
      this.req.on('data', chunk => chunks.push(chunk));
      this.req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      this.req.on('error', reject);
    });
  }

  // ── Respond ─────────────────────────────────────────────────────
  async respond() {
    if (this.headerSent) return;

    const body = this._body;
    let payload;

    if (body === null || body === undefined) {
      payload = '';
    } else if (typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Error)) {
      payload = JSON.stringify(body);
      if (!this.res.getHeader('Content-Type')) {
        this.res.setHeader('Content-Type', 'application/json');
      }
    } else {
      payload = String(body);
    }

    const len = Buffer.byteLength(payload);
    this.res.setHeader('Content-Length', String(len));
    this.res.writeHead(this.statusCode);
    this.res.end(payload);
    this.headerSent = true;
  }

  // ── Shortcuts ──────────────────────────────────────────────────
  get(name) {
    return this.params[name];
  }

  assert(value, status, message) {
    if (!value) {
      const err = new Error(message || `Assertion failed: ${value}`);
      err.status = status;
      err.expose = true;
      throw err;
    }
  }

  throw(status, message) {
    const err = new Error(message || http.STATUS_CODES[status] || 'Error');
    err.status = status;
    err.expose = true;
    throw err;
  }

  get cookies() {
    return parseCookies(this.headers['cookie'] || '');
  }
}

function accept(header) {
  const types = (header || '*/*').split(',').map(t => t.trim().split(';')[0]);
  return {
    types,
    includes: type => types.includes(type) || types.includes('*/*'),
    json: types.includes('application/json'),
    html: types.includes('text/html'),
    xml: types.includes('application/xml') || types.includes('text/xml'),
  };
}

function contentType(header) {
  return header.split(';')[0].trim().toLowerCase();
}

function parseFormData(str) {
  const params = new URL.URLSearchParams(str);
  const result = {};
  for (const [key, val] of params) {
    result[key] = val;
  }
  return result;
}

function parseCookies(str) {
  const result = {};
  for (const pair of str.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    result[key] = val;
  }
  return result;
}

module.exports = { Context };
