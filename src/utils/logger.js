'use strict';

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const colors = { error: '31', warn: '33', info: '36', debug: '90', reset: '0' };

function color(code, str) {
  return `\x1b[${code}m${str}\x1b[${colors.reset}m`;
}

function createLogger(options = {}) {
  const level = levels[options.level] ?? 2;
  const prefix = options.prefix || '';
  const pretty = options.pretty || false;

  const log = (lvl, ...args) => {
    if (levels[lvl] > level) return;
    const ts = pretty ? new Date().toISOString().slice(11, 23) : '';
    const pre = prefix ? `[${prefix}]` : '';
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const line = [ts, pre, msg].filter(Boolean).join(' ');
    const colored = `[${lvl.toUpperCase().padEnd(5)}] ${line}`;
    console.log(color(colors[lvl] || '0', colored));
  };

  return {
    error: (...a) => log('error', ...a),
    warn: (...a) => log('warn', ...a),
    info: (...a) => log('info', ...a),
    debug: (...a) => log('debug', ...a),
  };
}

module.exports = { createLogger };
