'use strict';

/**
 * Rate limit middleware
 * In-memory token bucket / sliding window rate limiter
 */
function ratelimit(options = {}) {
  const defaults = {
    windowMs: 60000,
    max: 100,
    standardHeaders: false,
    legacyHeaders: true,
    keyGenerator: ctx => ctx.ip,
    handler: (ctx, next) => {
      ctx.throw(429, 'Too Many Requests');
    },
    skip: () => false,
    message: 'Too Many Requests',
  };

  const opts = { ...defaults, ...options };
  const store = new Map();

  // Cleanup old entries periodically
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.reset > opts.windowMs * 2) {
        store.delete(key);
      }
    }
  };
  const cleanupTimer = setInterval(cleanup, opts.windowMs);

  return async function ratelimitMiddleware(ctx, next) {
    if (opts.skip(ctx)) return next();

    const key = opts.keyGenerator(ctx);
    const now = Date.now();

    if (!store.has(key)) {
      store.set(key, { count: 0, reset: now + opts.windowMs });
    }

    const entry = store.get(key);

    // Reset window
    if (now >= entry.reset) {
      entry.count = 0;
      entry.reset = now + opts.windowMs;
    }

    entry.count++;

    const remaining = Math.max(0, opts.max - entry.count);
    const reset = Math.ceil((entry.reset - now) / 1000);

    // Set headers
    if (opts.standardHeaders) {
      ctx.res.setHeader('RateLimit-Limit', String(opts.max));
      ctx.res.setHeader('RateLimit-Remaining', String(remaining));
      ctx.res.setHeader('RateLimit-Reset', String(reset));
    }
    if (opts.legacyHeaders) {
      ctx.res.setHeader('X-RateLimit-Limit', String(opts.max));
      ctx.res.setHeader('X-RateLimit-Remaining', String(remaining));
      ctx.res.setHeader('X-RateLimit-Reset', String(reset));
    }

    if (entry.count > opts.max) {
      return opts.handler(ctx, next);
    }

    await next();
  };
}

module.exports = { ratelimit };
