'use strict';

/**
 * vbot-api example server
 */
const { createApp } = require('../src/index');
const { logger } = require('../src/middleware/logger');
const { cors } = require('../src/middleware/cors');
const { ratelimit } = require('../src/middleware/ratelimit');
const { auth } = require('../src/middleware/auth');
const { notFound, badRequest } = require('../src/utils/error');

const app = createApp({ port: 3000, logger: 'info' });

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(logger({ format: 'dev' }));
app.use(cors({ origin: '*', credentials: false }));
app.use(ratelimit({ windowMs: 60000, max: 200 }));

// ── Request ID middleware ─────────────────────────────────────────────────────
app.use(async (ctx, next) => {
  ctx.state.requestId = Math.random().toString(36).slice(2, 10);
  ctx.state.startedAt = Date.now();
  await next();
  const ms = Date.now() - ctx.state.startedAt;
  ctx.set('X-Request-Id', ctx.state.requestId);
  ctx.set('X-Response-Time', `${ms}ms`);
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', async (ctx) => {
  ctx.body = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
});

// GET with params
app.get('/users/:id', async (ctx) => {
  const { id } = ctx.params;
  ctx.body = {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    createdAt: new Date(Date.now() - Number(id) * 86400000).toISOString(),
  };
});

// List users with query params
app.get('/users', async (ctx) => {
  const { page = 1, limit = 10, search = '' } = ctx.query;
  const users = Array.from({ length: Math.min(Number(limit), 100) }, (_, i) => ({
    id: (Number(page) - 1) * Number(limit) + i + 1,
    name: `User ${(Number(page) - 1) * Number(limit) + i + 1}`,
    email: `user${(Number(page) - 1) * Number(limit) + i + 1}@example.com`,
  }));
  ctx.body = {
    data: users,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total: 1000,
      pages: Math.ceil(1000 / Number(limit)),
    },
  };
});

// POST create user
app.post('/users', async (ctx) => {
  const body = await ctx.json();
  if (!body.name || !body.email) {
    throw badRequest('name and email are required');
  }
  ctx.status = 201;
  ctx.body = {
    id: Math.floor(Math.random() * 10000),
    name: body.name,
    email: body.email,
    createdAt: new Date().toISOString(),
  };
});

// PUT update user
app.put('/users/:id', async (ctx) => {
  const { id } = ctx.params;
  const body = await ctx.json();
  ctx.body = {
    id: Number(id),
    ...body,
    updatedAt: new Date().toISOString(),
  };
});

// DELETE user
app.delete('/users/:id', async (ctx) => {
  ctx.status = 204;
});

// Posts routes
app.get('/posts', async (ctx) => {
  ctx.body = {
    data: [
      { id: 1, title: 'Hello World', author: 'Alice' },
      { id: 2, title: 'Getting Started with vbot-api', author: 'Bob' },
    ],
  };
});

app.get('/posts/:slug', async (ctx) => {
  ctx.body = {
    slug: ctx.params.slug,
    title: 'Sample Post',
    content: 'This is a sample post content.',
    author: 'Alice',
    publishedAt: new Date().toISOString(),
    tags: ['tech', 'javascript'],
  };
});

// Protected route example
const API_KEYS = new Set(['secret-key-123', 'admin-key-456']);

app.get('/admin/dashboard', auth({
  type: 'Bearer',
  validator: async (token, ctx) => {
    if (!API_KEYS.has(token)) throw new Error('Invalid API key');
    return { role: 'admin', token };
  },
}), async (ctx) => {
  ctx.body = {
    message: 'Welcome to the admin dashboard!',
    user: ctx.state.user,
    stats: {
      users: 1247,
      posts: 8934,
      uptime: process.uptime(),
    },
  };
});

// OpenAPI spec
app.get('/openapi.json', async (ctx) => {
  ctx.type = 'application/json';
  ctx.body = app.toJSON();
});

// 404 handler
app.notfound(async (ctx) => {
  ctx.status = 404;
  ctx.body = {
    error: 'Not Found',
    message: `Route ${ctx.method} ${ctx.path} not found`,
    requestId: ctx.state.requestId,
  };
});

// Error handler
app.onerror((err, ctx) => {
  if (ctx.headerSent) return;
  ctx.status = err.status || err.statusCode || 500;
  ctx.type = 'application/json';
  ctx.body = {
    error: err.expose ? err.message : 'Internal Server Error',
    requestId: ctx.state?.requestId,
    ...(app.options.env === 'development' ? { stack: err.stack } : {}),
  };
});

// ── Start server ──────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(app.options.port).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = app;
