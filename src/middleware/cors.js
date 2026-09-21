'use strict';

/**
 * CORS middleware — Cross-Origin Resource Sharing
 */
function cors(options = {}) {
  const defaults = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
    exposedHeaders: '',
    credentials: false,
    maxAge: 86400,
    preflightContinue: false,
  };

  const opts = { ...defaults, ...options };

  return async function corsMiddleware(ctx, next) {
    const origin = ctx.headers['origin'];

    // Determine allowed origin
    let allowOrigin = opts.origin;
    if (typeof opts.origin === 'function') {
      allowOrigin = await opts.origin(ctx);
    } else if (Array.isArray(opts.origin)) {
      allowOrigin = opts.origin.includes(origin) ? origin : false;
    } else if (opts.origin !== '*' && origin !== opts.origin) {
      allowOrigin = false;
    }

    if (allowOrigin) {
      ctx.res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    }
    if (opts.credentials) {
      ctx.res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (opts.exposedHeaders) {
      ctx.res.setHeader('Access-Control-Expose-Headers', opts.exposedHeaders);
    }

    // Handle preflight
    if (ctx.method === 'OPTIONS') {
      ctx.res.setHeader('Access-Control-Allow-Methods', opts.methods);
      ctx.res.setHeader('Access-Control-Allow-Headers', opts.allowedHeaders);
      ctx.res.setHeader('Access-Control-Max-Age', String(opts.maxAge));
      ctx.status = 204;
      if (!opts.preflightContinue) return;
    }

    await next();
  };
}

module.exports = { cors };
