'use strict';

/**
 * Logger middleware — request logging
 */
function logger(options = {}) {
  const format = options.format || 'dev';
  const skip = options.skip || (() => false);

  return async function loggerMiddleware(ctx, next) {
    if (skip(ctx)) return next();

    const start = Date.now();
    const { method, url } = ctx;

    await next();

    const duration = Date.now() - start;
    const { status } = ctx;

    const logLine = format === 'json'
      ? JSON.stringify({ method, url, status, duration, ip: ctx.ip, userAgent: ctx.headers['user-agent'] })
      : format === 'short'
        ? `${method} ${url} ${status} ${duration}ms`
        : `[${new Date().toISOString()}] ${method} ${url} ${status} ${duration}ms - ${ctx.ip}`;

    if (ctx.logger) {
      if (status >= 500) ctx.logger.error(logLine);
      else if (status >= 400) ctx.logger.warn(logLine);
      else ctx.logger.info(logLine);
    } else {
      console.log(logLine);
    }
  };
}

module.exports = { logger };
