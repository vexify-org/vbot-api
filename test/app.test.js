'use strict';

const { VBotApp, createApp } = require('../src/app');

describe('VBotApp', () => {
  let app;

  beforeEach(() => {
    app = createApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  test('createApp returns a VBotApp instance', () => {
    expect(app).toBeInstanceOf(VBotApp);
    expect(app.options.port).toBe(3000);
  });

  test('app.use registers global middleware', () => {
    const mw = jest.fn((ctx, next) => next());
    app.use(mw);
    expect(app.middlewares).toHaveLength(1);
    expect(app.middlewares[0]).toBe(mw);
  });

  test('app.use throws for non-function', () => {
    expect(() => app.use('not a function')).toThrow(TypeError);
  });

  test('route shortcuts register routes', () => {
    const h = jest.fn();
    app.get('/test', h);
    app.post('/create', h);
    app.put('/update', h);
    app.delete('/remove', h);

    expect(app.router.routes).toHaveLength(4);
    expect(app.router.routes[0].method).toBe('GET');
    expect(app.router.routes[1].method).toBe('POST');
  });

  test('app.listen returns a promise', async () => {
    const promise = app.listen(0); // port 0 = random free port
    await expect(promise).resolves.toBeDefined();
    const server = await promise;
    expect(server).toBeDefined();
    await app.close();
  });

  test('app.emit emits error events', () => {
    const handler = jest.fn();
    app.on('error', handler);
    app.emit('error', new Error('test'), {});
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('Router', () => {
  const { Router } = require('../src/router');

  test('adds routes correctly', () => {
    const router = new Router();
    const h = jest.fn();
    router.add('GET', '/users/:id', h);
    expect(router.routes).toHaveLength(1);
    expect(router.routes[0].path).toBe('/users/:id');
  });

  test('matches simple paths', async () => {
    const router = new Router();
    const h = jest.fn();
    router.add('GET', '/hello', h);

    const ctx = { method: 'GET', path: '/hello', params: {} };
    const result = await router.match(ctx);

    expect(result).not.toBeNull();
    expect(result.handlers).toContain(h);
  });

  test('matches parameterized paths', async () => {
    const router = new Router();
    const h = jest.fn();
    router.add('GET', '/users/:id', h);

    const ctx = { method: 'GET', path: '/users/42', params: {} };
    const result = await router.match(ctx);

    expect(result).not.toBeNull();
    expect(result.params.id).toBe('42');
  });

  test('returns null for unmatched paths', async () => {
    const router = new Router();
    const h = jest.fn();
    router.add('GET', '/hello', h);

    const ctx = { method: 'GET', path: '/other', params: {} };
    const result = await router.match(ctx);
    expect(result).toBeNull();
  });

  test('filters by HTTP method', async () => {
    const router = new Router();
    router.add('GET', '/path', jest.fn());
    router.add('POST', '/path', jest.fn());

    const getCtx = { method: 'GET', path: '/path', params: {} };
    const postCtx = { method: 'POST', path: '/path', params: {} };

    const getResult = await router.match(getCtx);
    const postResult = await router.match(postCtx);

    expect(getResult.handlers.length).toBe(1);
    expect(postResult.handlers.length).toBe(1);
  });

  test('toJSON generates OpenAPI spec', () => {
    const router = new Router();
    router.add('GET', '/users/:id', jest.fn());
    router.add('POST', '/users', jest.fn());

    const spec = router.toJSON();
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.paths['/users/:id']).toBeDefined();
    expect(spec.paths['/users']).toBeDefined();
  });
});

describe('Validators', () => {
  const { Validator, ValidationError, validate } = require('../src/validators');

  test('required validation', () => {
    expect(() => new Validator({}).required('name').validate()).toThrow(ValidationError);
  });

  test('required passes with value', () => {
    expect(new Validator({ name: 'John' }).required('name').validate()).toBe(true);
  });

  test('email validation', () => {
    const v = new Validator({ email: 'not-an-email' });
    v.email('email');
    expect(() => v.validate()).toThrow(ValidationError);
  });

  test('email validation passes', () => {
    const v = new Validator({ email: 'test@example.com' });
    v.email('email');
    expect(v.validate()).toBe(true);
  });

  test('number validation with min/max', () => {
    const v = new Validator({ age: 150 });
    v.integer('age', { min: 0, max: 120 });
    expect(() => v.validate()).toThrow(ValidationError);
  });

  test('enum validation', () => {
    const v = new Validator({ status: 'invalid' });
    v.enum('status', ['active', 'inactive', 'pending']);
    expect(() => v.validate()).toThrow(ValidationError);
  });

  test('uuid validation', () => {
    const v = new Validator({ id: 'not-a-uuid' });
    v.uuid('id');
    expect(() => v.validate()).toThrow(ValidationError);

    const v2 = new Validator({ id: '550e8400-e29b-41d4-a716-446655440000' });
    v2.uuid('id');
    expect(v2.validate()).toBe(true);
  });

  test('string minLength/maxLength', () => {
    const v = new Validator({ name: 'ab' });
    v.string('name', { minLength: 5 });
    expect(() => v.validate()).toThrow(ValidationError);

    const v2 = new Validator({ name: 'verylongname' });
    v2.string('name', { maxLength: 5 });
    expect(() => v2.validate()).toThrow(ValidationError);
  });

  test('array validation', () => {
    const v = new Validator({ tags: 'not-an-array' });
    v.array('tags');
    expect(() => v.validate()).toThrow(ValidationError);

    const v2 = new Validator({ tags: ['a', 'b'] });
    v2.array('tags', { minLength: 1, maxLength: 5 });
    expect(v2.validate()).toBe(true);
  });
});

describe('Errors', () => {
  const { HttpError, notFound, badRequest, createError } = require('../src/utils/error');

  test('HttpError has correct properties', () => {
    const err = new HttpError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.expose).toBe(true);
  });

  test('HttpError 500 is not expose', () => {
    const err = new HttpError(500, 'Internal error');
    expect(err.expose).toBe(false);
  });

  test('notFound helper', () => {
    const err = notFound('User not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('User not found');
  });

  test('createError with props', () => {
    const err = createError(422, 'Invalid input', { field: 'email' });
    expect(err.field).toBe('email');
  });
});
