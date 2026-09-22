'use strict';

const { EventEmitter } = require('events');
const { Router } = require('./router');
const { Context } = require('./context');
const { VBotConfig } = require('./config');
const { createLogger } = require('./utils/logger');

class VBotApp extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      env: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      logger: true,
      prettyPrint: false,
      trustProxy: false,
      ...options,
    };

    this.logger = createLogger({
      level: this.options.logger === true ? 'info' : this.options.logger,
      pretty: this.options.prettyPrint,
    });

    this.config = new VBotConfig(this.options.env);
    this.router = new Router();
    this.middlewares = [];
    this.contextOptions = {
      env: this.options.env,
      trustProxy: this.options.trustProxy,
    };
    this._running = false;
    this.server = null;
  }

  use(fnOrPrefix, routerOrApp) {
    // Case 1: Single function arg = global middleware
    if (typeof fnOrPrefix === 'function') {
      if (arguments.length === 1) {
        // Global middleware
        if (typeof fnOrPrefix !== 'function') {
          throw new TypeError('Middleware must be a function');
        }
        this.middlewares.push(fnOrPrefix);
        return this;
      }
      // Two args but first is function = treat as prefix-based middleware
      const prefix = fnOrPrefix;
      const mw = routerOrApp;
      if (typeof mw !== 'function') {
        throw new TypeError('app.use(prefix, fn) requires a function');
      }
      return this.use(async (ctx, next) => {
        if (ctx.path.startsWith(prefix)) {
          ctx.path = ctx.path.slice(prefix.length) || '/';
          await mw(ctx, next);
        } else {
          await next();
        }
      });
    }

    // Case 2: First arg is string prefix
    if (typeof fnOrPrefix !== 'string') {
      throw new TypeError('app.use() requires a function, string prefix, or Router');
    }

    const prefix = fnOrPrefix;
    if (routerOrApp instanceof Router) {
      this.router.use(prefix, routerOrApp);
    } else if (routerOrApp instanceof VBotApp) {
      this.router.use(prefix, routerOrApp.router);
    } else if (typeof routerOrApp === 'function') {
      const mw = routerOrApp;
      return this.use(async (ctx, next) => {
        if (ctx.path.startsWith(prefix)) {
          ctx.path = ctx.path.slice(prefix.length) || '/';
          await mw(ctx, next);
        } else {
          await next();
        }
      });
    } else if (routerOrApp === undefined) {
      throw new TypeError('app.use() requires a Router, VBotApp, or function');
    }
    return this;
  }

  onerror(handler) {
    this.use((ctx, next) => next().catch(err => handler(err, ctx)));
    return this;
  }

  notfound(handler) {
    this.router._notFoundHandler = handler;
    return this;
  }

  _createContext(req, res) {
    return new Context(req, res, this.contextOptions);
  }

  _compose(middlewares, ctx) {
    let index = -1;
    const dispatch = i => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      if (i >= middlewares.length) return Promise.resolve();
      const handler = middlewares[i];
      try {
        const result = handler(ctx, () => dispatch(i + 1));
        if (!result || typeof result.then !== 'function') {
          throw new TypeError(`Middleware ${i} must return a Promise`);
        }
        return result.catch(err => Promise.reject(err));
      } catch (err) {
        return Promise.reject(err);
      }
    };
    return dispatch(0);
  }

  async _handleRequest(req, res) {
    const ctx = this._createContext(req, res);
    const startTime = Date.now();
    const allMiddlewares = [
      ...this.middlewares,
      async (c, next) => {
        const matched = await this.router.match(c);
        if (matched) {
          c.params = matched.params;
          c.path = matched.path || c.path;
          await this._compose(matched.handlers, c);
        } else if (this.router._notFoundHandler) {
          await this.router._notFoundHandler(c);
        }
        await next();
      },
    ];
    try {
      await this._compose(allMiddlewares, ctx);
    } catch (err) {
      ctx.app.emit('error', err, ctx);
      if (!ctx.headerSent) {
        ctx.status = err.status || err.statusCode || 500;
        ctx.body = {
          error: err.expose ? err.message : 'Internal Server Error',
          ...(this.options.env === 'development' ? { stack: err.stack } : {}),
        };
      }
    }
    if (!ctx.headerSent) {
      ctx.status = ctx.status || 404;
      ctx.body = ctx.body ?? (ctx.status === 404 ? { error: 'Not Found' } : null);
    }
    const duration = Date.now() - startTime;
    this.logger.info(`${ctx.method} ${ctx.url} ${ctx.status} ${duration}ms`);
  }

  async listen(port, host) {
    if (this._running) return this.server;
    port = port ?? this.options.port;
    host = host ?? this.options.host;
    const http = require('http');
    this.server = http.createServer((req, res) => this._handleRequest(req, res));
    return new Promise((resolve, reject) => {
      this.server.on('error', err => {
        this.logger.error(`Server error: ${err.message}`);
        reject(err);
      });
      this.server.listen(port, host, () => {
        this._running = true;
        this.logger.info(`Server running at http://${host}:${port}`);
        resolve(this.server);
      });
    });
  }

  async close() {
    if (!this._running || !this.server) return;
    return new Promise(resolve => {
      this.server.close(() => {
        this._running = false;
        this.logger.info('Server closed');
        resolve();
      });
    });
  }

  toJSON() { return this.router.toJSON(); }
  routes() { return this.router.routes; }

  _addRoute(method, path, ...handlers) {
    this.router.add(method, path, ...handlers);
    return this;
  }
  get(path, ...h) { return this._addRoute('GET', path, ...h); }
  post(path, ...h) { return this._addRoute('POST', path, ...h); }
  put(path, ...h) { return this._addRoute('PUT', path, ...h); }
  patch(path, ...h) { return this._addRoute('PATCH', path, ...h); }
  delete(path, ...h) { return this._addRoute('DELETE', path, ...h); }
  options(path, ...h) { return this._addRoute('OPTIONS', path, ...h); }
  head(path, ...h) { return this._addRoute('HEAD', path, ...h); }
}

function createApp(options = {}) {
  return new VBotApp(options);
}

module.exports = { VBotApp, createApp };
