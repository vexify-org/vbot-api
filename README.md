# vbot-api

> Production-grade API framework for modern JavaScript — Express/Koa-style with a clean design

**vbot-api** is a full-featured HTTP API framework that gives you Express/Koa-style routing, middleware, request validation, auth, rate-limiting, CORS, and OpenAPI generation — all in a lightweight, dependency-free core.

## Features

- ⚡ **Fast** — Native HTTP module, minimal overhead
- 🛤️ **Routing** — Parameterized routes, nested routers, sub-apps
- 🔗 **Middleware** — Stackable middleware with async/await support
- 🔐 **Auth** — Bearer token + Basic Auth middleware
- 🚦 **Rate Limiting** — Built-in token-bucket rate limiter
- 🌐 **CORS** — Full CORS support with config
- ✅ **Validation** — Lightweight request validators
- 📄 **Auto-docs** — OpenAPI/Swagger spec generation
- 🧪 **Testable** — Built for easy unit testing

## Quick Start

```js
import { createApp } from 'vbot-api';

const app = createApp();

// Middleware
app.use(async (ctx, next) => {
  ctx.state.requestId = Math.random().toString(36).slice(2);
  await next();
});

// Routes
app.get('/users/:id', async (ctx) => {
  ctx.body = { id: ctx.params.id, name: 'test' };
});

app.post('/users', async (ctx) => {
  const { name, email } = await ctx.json();
  ctx.status = 201;
  ctx.body = { id: 1, name, email };
});

app.listen(3000);
```

## API Reference

### `createApp(options)`

Creates a new VBot application.

```js
const app = createApp({
  env: 'development',      // NODE_ENV
  port: 3000,             // HTTP port
  host: '0.0.0.0',        // bind address
  logger: 'info',         // log level (false to disable)
  trustProxy: false,       // trust X-Forwarded-* headers
});
```

### Context (`ctx`)

The context object is passed to every middleware and route handler.

**Request properties:**
- `ctx.method` — HTTP method (GET, POST, etc.)
- `ctx.path` — URL path
- `ctx.url` — Full URL
- `ctx.query` — Query string object
- `ctx.params` — Route parameters
- `ctx.headers` — Lowercase headers
- `ctx.get(key)` — Get a header
- `ctx.ip` — Client IP
- `ctx.accepts` — Content negotiation
- `ctx.state` — Shared middleware state
- `await ctx.json()` — Parse JSON body
- `await ctx.text()` — Parse text body
- `await ctx.form()` — Parse form body

**Response properties:**
- `ctx.status` — HTTP status code
- `ctx.body` — Response body
- `ctx.type` — Content-Type
- `ctx.set(key, val)` — Set a header
- `ctx.append(key, val)` — Append a header
- `ctx.remove(key)` — Remove a header
- `ctx.redirect(url)` — Redirect response

### Middleware

```js
// Global middleware (all routes)
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  ctx.logger.info(`Request took ${Date.now() - start}ms`);
});

// Route-specific
app.get('/admin', authMiddleware, async (ctx) => {
  ctx.body = { secret: 'data' };
});
```

### Routing

```js
// All HTTP methods
app.get(path, ...handlers)
app.post(path, ...handlers)
app.put(path, ...handlers)
app.patch(path, ...handlers)
app.delete(path, ...handlers)
app.options(path, ...handlers)
app.head(path, ...handlers)

// Multiple handlers (chain of responsibility)
app.get('/resource', loadResource, transformResponse, async (ctx) => {
  ctx.body = ctx.state.resource;
});
```

### Sub-routers

```js
const api = createApp();
api.get('/users', ...);
api.get('/posts', ...);

app.use('/api/v1', api);
```

### Validation

```js
const { Validator } = require('vbot-api/src/validators');

app.post('/users', async (ctx) => {
  const body = await ctx.json();
  const v = new Validator(body);
  v.required('name').string('name', { minLength: 2 });
  v.required('email').email('email');
  v.validate(); // throws ValidationError on failure
  ctx.body = { created: true };
});
```

### Error Handling

```js
app.onerror((err, ctx) => {
  ctx.status = err.status || 500;
  ctx.body = {
    error: err.expose ? err.message : 'Something went wrong',
  };
});
```

## Middleware Reference

### `logger(options)`

Request logging middleware.

```js
app.use(logger({ format: 'dev' })); // 'dev', 'json', 'short'
```

### `cors(options)`

CORS middleware.

```js
app.use(cors({
  origin: '*',
  credentials: false,
  maxAge: 86400,
}));
```

### `auth(options)`

Bearer token auth.

```js
app.use(auth({
  type: 'Bearer',
  validator: async (token, ctx) => {
    const user = await verifyToken(token);
    if (!user) throw new Error('Invalid token');
    return user;
  },
}));
```

### `basicAuth(options)`

HTTP Basic Auth.

```js
app.use(basicAuth({
  validate: async (username, password, ctx) => {
    return username === 'admin' && password === 'secret';
  },
}));
```

### `ratelimit(options)`

Rate limiting middleware.

```js
app.use(ratelimit({
  windowMs: 60000,   // 1 minute
  max: 100,          // 100 requests per window
}));
```

## Architecture

```
vbot-api/
├── src/
│   ├── index.js          # Main export
│   ├── app.js            # VBotApp class
│   ├── router.js         # Router class
│   ├── layer.js          # Route layer (path matching)
│   ├── context.js        # Request/Response context
│   ├── config.js         # VBotConfig (env-based)
│   ├── middleware/
│   │   ├── logger.js     # Request logging
│   │   ├── cors.js       # CORS support
│   │   ├── auth.js       # Bearer + Basic auth
│   │   └── ratelimit.js  # Rate limiting
│   └── validators/
│       └── index.js      # Request validators
├── package.json
├── README.md
└── test/
```

## License

MIT © 2024 VBot Team
