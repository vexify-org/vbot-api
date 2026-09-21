'use strict';

/**
 * VBotConfig — environment-based configuration loader
 */
class VBotConfig {
  constructor(env = 'development') {
    this.env = env;
    this._store = {};
    this._loadEnv();
    this._loadDefaults();
  }

  _loadDefaults() {
    this._store = {
      env: this.env,
      port: 3000,
      host: '0.0.0.0',
      jsonSpaces: 2,
      cors: {
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: false,
      },
      rateLimit: {
        windowMs: 60000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
      },
    };
  }

  _loadEnv() {
    // Merge in env-specific config
    const envKey = `VBOT_${this.env.toUpperCase().replace(/-/g, '_')}`;
    for (const [key, val] of Object.entries(process.env)) {
      if (key.startsWith('VBOT_') || key.startsWith(envKey + '_')) {
        const configKey = key
          .replace(/^VBOT_/, '')
          .replace(/^[\d_]+/, '')
          .toLowerCase()
          .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        try {
          this._store[configKey] = JSON.parse(val);
        } catch {
          this._store[configKey] = val;
        }
      }
    }
  }

  get(key, defaultValue) {
    const val = this._store[key];
    return val !== undefined ? val : defaultValue;
  }

  set(key, value) {
    this._store[key] = value;
  }

  has(key) {
    return key in this._store;
  }

  all() {
    return { ...this._store };
  }

  merge(obj) {
    this._store = { ...this._store, ...obj };
    return this;
  }
}

module.exports = { VBotConfig };
