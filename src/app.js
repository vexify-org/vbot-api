'use strict';

const { EventEmitter } = require('events');
const { Router } = require('./router');
const { Context } = require('./context');
const { VBotConfig } = require('./config');
const { createLogger } = require('./utils/logger');

const MIDDLEWARE_ERROR_HANDLER = Symbol.for('vbot.errorHandler');
const MIDDLEWARE_NOT_FOUND = Symbol.for('vbot.notFound');

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

  /**
   * Register global middleware
   * @param {Function} fn - Middleware function (ctx, next)
   */
  use(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be a function');
    }
    this.middlewares.push(fn);
    return this;
  }

  /**
   * Add a route handler
   * @param {string} method - HTTP method
   * @param {string} path - Route path
   * @param {...Function} handlers - Route handlers
   */
  _addRoute(method, path, ...handlers) {
    this.router.add(method, path, ...handlers);
    return this;
  }

  /**
   * GET route shorthand
   */
  get(path, ...handlers) { return this._addRoute('GET', path, ...handlers); }

  /**
   * POST route shorthand
   */
  post(path, ...handlers) { return this._addRoute('POST', path, ...handlers); }

  /**
   * PUT route shorthand
   */
  put(path, ...handlers) { return this._addRoute('PUT', path, ...handlers); }

  /**
   * PATCH route shorthand
   */
  patch(path, ...handlers) { return this._addRoute('PATCH', path, ...handlers); }

  /**
   * DELETE route shorthand
   */
  delete(path, ...handlers) { return this._addRoute('DELETE', path, ...handlers); }

  /**
   * OPTIONS route shorthand
   */
  options(path, ...handlers) { return this._addRoute('OPTIONS', path, ...handlers); }

  /**
   * HEAD route shorthand
   */
  head(path, ...handlers) { return this._addRoute('HEAD', path, ...handlers); }

  /**
   * Mount a sub-router or app at a path prefix
   * @param {string} prefix - Path prefix
   * @param {Router|VBotApp} routerOrApp - Router or app to mount
   */
  use(prefix, routerOrApp) {
    if (typeof prefix !== 'string') {
      // If first arg is not a string, treat as global middleware
      return super.use(prefix);
    }
    if (routerOrApp instanceof Router) {
      this.router.use(prefix, routerOrApp);
    } else if (routerOrApp instanceof VBotApp) {
      this.router.use(prefix, routerOrApp.router);
    } else if (typeof routerOrApp === 'function') {
      // Middleware with path prefix
      const mw = routerOrApp;
      return this.use(async (ctx, next) => {
        if (ctx.path.startsWith(prefix)) {
          ctx.path = ctx.path.slice(prefix.length) || '/';
          await mw(ctx, next);
        } else {
          await next();
        }
      });
    }
    return this;
  }

  /**
   * Register an error handler
   * @param {Function} handler - (err, ctx) => void
   */
  onerror(handler) {
    this.use((ctx, next) => next().catch(err => handler(err, ctx)));
    return this;
  }

  /**
   * Handle 404 not found
   * @param {Function} handler - (ctx) => void
   */
  notfound(handler) {
    this.router._notFoundHandler = handler;
    return this;
  }

  /**
   * Create a context object from a raw request
   */
  _createContext(req, res) {
    const ctx = new Context(req, res, this.contextOptions);
    ctx.app = this;
    ctx.logger = this.logger;
    return ctx;
  }

  /**
   * Compose middleware stack
   */
  _compose(middlewares, ctx) {
    let index = -1;

    const dispatch = i => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      if (i >= middlewares.length) {
        return Promise.resolve();
      }

      const handler = middlewares[i];
      try {
        const result = handler(ctx, () => dispatch(i + 1));
        if (!result || typeof result.then !== 'function') {
          throw new TypeError(`Middleware ${i} must return a Promise`);
        }
        return result.catch(err => {
          // Catch errors from downstream middleware
          return Promise.reject(err);
        });
      } catch (err) {
        return Promise.reject(err);
      }
    };

    return dispatch(0);
  }

  /**
   * Handle an incoming HTTP request
   */
  async _handleRequest(req, res) {
    const ctx = this._createContext(req, res);
    const startTime = Date.now();

    // Add router to middleware stack
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

    // Auto-respond if not yet sent
    if (!ctx.headerSent) {
      ctx.status = ctx.status || 404;
      ctx.body = ctx.body ?? (ctx.status === 404 ? { error: 'Not Found' } : null);
    }

    // Log request
    const duration = Date.now() - startTime;
    this.logger.info(`${ctx.method} ${ctx.url} ${ctx.status} ${duration}ms`);
  }

  /**
   * Start the HTTP server
   * @param {number} port
   * @param {string} host
   * @returns {Promise<import('http').Server>}
   */
  async listen(port, host) {
    if (this._running) return this.server;

    port = port ?? this.options.port;
    host = host ?? this.options.host;

    // Use native http module
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

  /**
   * Close the HTTP server
   */
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

  /**
   * Generate OpenAPI/Swagger documentation
   */
  toJSON() {
    return this.router.toJSON();
  }

  /**
   * Get registered routes
   */
  routes() {
    return this.router.routes;
  }
}

function createApp(options = {}) {
  return new VBotApp(options);
}

module.exports = { VBotApp, createApp };
