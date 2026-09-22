'use strict';

class Layer {
  constructor(path, handlers, options = {}) {
    this.path = path;
    this.handlers = handlers;
    this.options = options;
    this.method = null;
    this.keys = [];
    this.regexp = pathToRegexp(path, this.keys, {
      sensitive: false,
      strict: false,
      end: options.end !== false,
    });
  }

  match(path) {
    const match = this.regexp.exec(path);
    if (!match) return null;
    const params = {};
    for (let i = 1; i < match.length; i++) {
      const key = this.keys[i - 1];
      const val = match[i];
      if (key) params[key.name] = decodeParam(val);
    }
    return { params, path: match[0] };
  }
}

function decodeParam(val) {
  if (typeof val !== 'string' || val.length === 0) return val;
  try { return decodeURIComponent(val); } catch { return val; }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pathToRegexp(path, keys, options) {
  if (!Array.isArray(path)) path = [path];
  const strict = options.strict !== false;
  const end = options.end !== false;
  const keys_cache = keys || [];

  for (const p of path) {
    const c = p.split('/').filter(s => s !== '');

    if (c.length === 0) {
      return end
        ? new RegExp('^\\/$', options.sensitive ? '' : 'i')
        : new RegExp('^\\/', options.sensitive ? '' : 'i');
    }

    let reStr = '^';
    for (let i = 0; i < c.length; i++) {
      const seg = c[i];
      reStr += '/';

      // Check param BEFORE last-segment logic
      if (seg.startsWith(':')) {
        const name = seg.slice(1);
        const optional = name.endsWith('?');
        const realName = optional ? name.slice(0, -1) : name;
        const pat = `([^/]+)${optional ? '?' : ''}`;
        reStr += pat;
        keys_cache.push({ name: realName, optional, repeatable: false });
        // Last segment: add optional trailing slash
        if (i === c.length - 1 && !strict) reStr += '\\/?';
        continue;
      }

      if (seg === '*') {
        reStr += '.*';
        keys_cache.push({ name: 'wild', optional: true });
      } else {
        reStr += escapeRegex(seg);
        if (i === c.length - 1 && !strict) reStr += '\\/?';
      }
    }

    if (end) reStr += '$';
    return new RegExp(reStr, options.sensitive ? '' : 'i');
  }
  return new RegExp('');
}

module.exports = Layer;
