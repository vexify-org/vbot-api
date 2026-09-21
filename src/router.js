'use strict';

const pathToRegexp = require('path-to-regexp');

const Layer = require('./layer');

class Router {
  constructor(options = {}) {
    this.routes = [];
    this.params = {};
    this._notFoundHandler = null;
    this.middlewares = [];
  }

  /**
   * Add a route to the router
   */
  add(method, path, ...handlers) {
    if (!path || path === '*') path = '(.*)';

    const layer = new Layer(path, handlers, { end: path !== '(.*)' });
    layer.method = method.toUpperCase();

    this.routes.push(layer);
    return this;
  }

  /**
   * Mount a sub-router at a prefix
   */
  use(prefix, subRouter) {
    if (typeof prefix === 'function') {
      this.middlewares.push(prefix);
      return this;
    }

    for (const route of subRouter.routes) {
      const fullPath = prefix === '/' ? route.path : `${prefix}${route.path}`;
      const layer = new Layer(fullPath, route.handlers, route.options);
      layer.method = route.method;
      this.routes.push(layer);
    }

    return this;
  }

  /**
   * Match a request path to a route
   * Returns { handlers, params, path } or null
   */
  async match(ctx) {
    const method = ctx.method.toUpperCase();
    const url = ctx.path;
    const queryIndex = url.indexOf('?');
    const pathname = queryIndex >= 0 ? url.slice(0, queryIndex) : url;

    for (const route of this.routes) {
      if (route.method && route.method !== method) continue;

      const match = route.match(pathname);
      if (match) {
        ctx.params = { ...ctx.params, ...match.params };
        return { handlers: route.handlers, params: ctx.params, path: match.path };
      }
    }

    return null;
  }

  /**
   * Register a param handler for a named parameter
   */
  param(name, handler) {
    this.params[name] = handler;
    return this;
  }

  /**
   * Get registered routes
   */
  getRoutes() {
    return this.routes.map(r => ({
      method: r.method,
      path: r.path,
      handlers: r.handlers.length,
    }));
  }

  /**
   * Generate OpenAPI spec from routes
   */
  toJSON() {
    const paths = {};
    for (const route of this.routes) {
      if (!paths[route.path]) paths[route.path] = {};
      const method = (route.method || 'get').toLowerCase();
      paths[route.path][method] = {
        summary: `Handler for ${route.method} ${route.path}`,
        responses: {
          '200': { description: 'OK' },
          '404': { description: 'Not Found' },
          '500': { description: 'Internal Server Error' },
        },
      };
    }
    return { openapi: '3.0.0', info: { title: 'VBot API', version: '1.0.0' }, paths };
  }
}

module.exports = { Router };
