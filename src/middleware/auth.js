'use strict';

/**
 * Auth middleware — Bearer token and Basic auth
 */
function auth(options = {}) {
  const defaults = {
    realm: 'Protected',
    header: 'Authorization',
    type: 'Bearer',
    query: 'access_token',
    validator: async (token, ctx) => { throw new Error('No validator set'); },
    passthrough: false,
  };

  const opts = { ...defaults, ...options };

  return async function authMiddleware(ctx, next) {
    // Extract token from header, query, or body
    let token = extractBearerToken(ctx.headers[opts.header?.toLowerCase()], opts.type);

    if (!token && opts.query) {
      token = ctx.query[opts.query];
    }

    if (!token) {
      if (opts.passthrough) return next();

      ctx.res.setHeader('WWW-Authenticate', `${opts.type} realm="${opts.realm}"`);
      ctx.throw(401, 'Authentication required');
    }

    try {
      ctx.state.user = await opts.validator(token, ctx);
      await next();
    } catch (err) {
      if (opts.passthrough) {
        ctx.state.authError = err;
        await next();
      } else {
        ctx.throw(401, err.message || 'Invalid token');
      }
    }
  };
}

function extractBearerToken(header, type) {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== type.toLowerCase()) return null;
  return parts[1];
}

/**
 * Basic auth middleware
 */
function basicAuth(options = {}) {
  const defaults = {
    realm: 'Protected',
    credentials: null, // { username, password } or async (username, password, ctx) => {}
    validate: async (username, password, ctx) => {
      if (!options.credentials) return false;
      const { username: u, password: p } = options.credentials;
      return u === username && p === password;
    },
    passthrough: false,
  };

  const opts = { ...defaults, ...options };

  return async function basicAuthMiddleware(ctx, next) {
    const header = ctx.headers['authorization'] || '';
    const parts = header.split(' ');
    if (parts[0].toLowerCase() !== 'basic') {
      if (opts.passthrough) return next();
      ctx.res.setHeader('WWW-Authenticate', `Basic realm="${opts.realm}"`);
      ctx.throw(401, 'Authentication required');
    }

    let credentials;
    try {
      credentials = Buffer.from(parts[1], 'base64').toString('utf-8');
    } catch {
      ctx.throw(401, 'Invalid basic auth header');
    }

    const colonIdx = credentials.indexOf(':');
    if (colonIdx === -1) {
      ctx.throw(401, 'Invalid basic auth credentials');
    }

    const username = credentials.slice(0, colonIdx);
    const password = credentials.slice(colonIdx + 1);

    const valid = await opts.validate(username, password, ctx);
    if (!valid) {
      if (opts.passthrough) {
        ctx.state.authError = new Error('Invalid credentials');
        return next();
      }
      ctx.throw(401, 'Invalid credentials');
    }

    ctx.state.user = { username };
    await next();
  };
}

module.exports = { auth, basicAuth };
