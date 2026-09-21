'use strict';

/**
 * Error types and helpers
 */

class HttpError extends Error {
  constructor(status, message, props = {}) {
    super(message || statusText(status));
    this.status = status;
    this.expose = status < 500;
    Object.assign(this, props);
  }
}

function statusText(code) {
  const STATUS_CODES = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return STATUS_CODES[code] || 'Error';
}

function isHttpError(err) {
  return err instanceof HttpError || (err.status >= 400 && err.expose !== undefined);
}

function createError(status, message, props) {
  return new HttpError(status, message, props);
}

function notFound(message = 'Not Found') {
  return createError(404, message);
}

function badRequest(message = 'Bad Request') {
  return createError(400, message);
}

function unauthorized(message = 'Unauthorized') {
  return createError(401, message);
}

function forbidden(message = 'Forbidden') {
  return createError(403, message);
}

function conflict(message = 'Conflict') {
  return createError(409, message);
}

function internal(message = 'Internal Server Error') {
  return createError(500, message, { expose: false });
}

module.exports = {
  HttpError,
  statusText,
  isHttpError,
  createError,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  internal,
};
