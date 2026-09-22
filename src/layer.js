'use strict';

const LayerRE = /^(\/[^?]*)(\?)?$/;

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
      if (key) {
        params[key.name] = decodeParam(val);
      }
    }

    return { params, path: match[0] };
  }
}

function decodeParam(val) {
  if (typeof val !== 'string' || val.length === 0) return val;
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

const pathToRegexp = function(path, keys, options) {
  if (!Array.isArray(path)) {
    path = [path];
  }

  const strict = options.strict !== false;
  const end = options.end !== false;
  const keys_cache = keys || [];

  for (const p of path) {
    const c = p.split('/').filter(s => s !== '');
    let reStr = '^/';

    for (let i = 0; i < c.length; i++) {
      const seg = c[i];

      if (i === c.length - 1 && !strict) {
        // Last segment, make trailing slash optional in non-strict mode
        reStr += '\/?';
        continue;
      }

      if (seg === '*') {
        reStr += '.*';
        keys_cache.push({ name: 'wild', optional: true });
      } else if (seg.startsWith(':')) {
        const name = seg.slice(1);
        const optional = name.endsWith('?');
        const realName = optional ? name.slice(0, -1) : name;
        const pat = `([^/]+)${optional ? '?' : ''}`;
        reStr += pat;
        keys_cache.push({ name: realName, optional, repeatable: false });
      } else {
        reStr += escapeRegex(seg) + '/';
      }
    }

    if (end) {
      reStr = reStr.replace(/\/$/, '');
      reStr += '$';
    } else {
      reStr = reStr.replace(/\/$/, '');
    }

    return new RegExp(reStr, options.sensitive ? '' : 'i');
  }

  return new RegExp('');
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = Layer;
