'use strict';

/**
 * Validators — request validation helpers
 * Provides a simple validation system without external dependencies
 */

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.expose = true;
    this.field = field;
  }
}

class Validator {
  constructor(data = {}) {
    this._data = data;
    this._errors = [];
  }

  _fail(field, message) {
    this._errors.push({ field, message });
  }

  required(field) {
    const val = this._get(field);
    if (val === undefined || val === null || val === '') {
      this._fail(field, `${field} is required`);
    }
    return this;
  }

  string(field, options = {}) {
    const val = this._get(field);
    if (val === undefined || val === null) return this;
    if (typeof val !== 'string') {
      this._fail(field, `${field} must be a string`);
      return this;
    }
    if (options.minLength !== undefined && val.length < options.minLength) {
      this._fail(field, `${field} must be at least ${options.minLength} characters`);
    }
    if (options.maxLength !== undefined && val.length > options.maxLength) {
      this._fail(field, `${field} must be at most ${options.maxLength} characters`);
    }
    if (options.pattern && !options.pattern.test(val)) {
      this._fail(field, options.message || `${field} format is invalid`);
    }
    return this;
  }

  number(field, options = {}) {
    const val = this._get(field);
    if (val === undefined || val === null) return this;
    const num = Number(val);
    if (isNaN(num)) {
      this._fail(field, `${field} must be a number`);
      return this;
    }
    if (options.min !== undefined && num < options.min) {
      this._fail(field, `${field} must be at least ${options.min}`);
    }
    if (options.max !== undefined && num > options.max) {
      this._fail(field, `${field} must be at most ${options.max}`);
    }
    return this;
  }

  integer(field, options = {}) {
    const val = this._get(field);
    if (val === undefined || val === null) return this;
    const num = Number(val);
    if (!Number.isInteger(num)) {
      this._fail(field, `${field} must be an integer`);
      return this;
    }
    return this.number(field, options);
  }

  boolean(field) {
    const val = this._get(field);
    if (val === undefined || val === null) return this;
    if (val !== true && val !== false && val !== 'true' && val !== 'false' && val !== 0 && val !== 1) {
      this._fail(field, `${field} must be a boolean`);
    }
    return this;
  }

  enum(field, values) {
    const val = this._get(field);
    if (val === undefined || val === null) return this;
    if (!values.includes(val)) {
      this._fail(field, `${field} must be one of: ${values.join(', ')}`);
    }
    return this;
  }

  email(field) {
    return this.string(field, {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: `${field} must be a valid email address`,
    });
  }

  uuid(field) {
    return this.string(field, {
      pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      message: `${field} must be a valid UUID`,
    });
  }

  array(field, options = {}) {
    const val = this._get(field);
    if (val === undefined || val === null) return this;
    if (!Array.isArray(val)) {
      this._fail(field, `${field} must be an array`);
      return this;
    }
    if (options.minLength !== undefined && val.length < options.minLength) {
      this._fail(field, `${field} must have at least ${options.minLength} items`);
    }
    if (options.maxLength !== undefined && val.length > options.maxLength) {
      this._fail(field, `${field} must have at most ${options.maxLength} items`);
    }
    return this;
  }

  _get(field) {
    if (this._data && typeof this._data.get === 'function') {
      return this._data.get(field);
    }
    return this._data?.[field];
  }

  validate() {
    if (this._errors.length > 0) {
      const err = new ValidationError('Validation failed');
      err.errors = this._errors;
      err.status = 422;
      throw err;
    }
    return true;
  }

  get errors() {
    return this._errors;
  }

  get isValid() {
    return this._errors.length === 0;
  }
}

function validate(data, rules) {
  const v = new Validator(data);
  for (const [field, ruleSet] of Object.entries(rules)) {
    if (Array.isArray(ruleSet)) {
      for (const rule of ruleSet) {
        if (typeof rule === 'string') {
          const parts = rule.split(':');
          const ruleName = parts[0];
          const args = parts[1] ? parts[1].split(',') : [];
          applyRule(v, field, ruleName, args);
        } else if (typeof rule === 'function') {
          rule(v, field);
        }
      }
    }
  }
  return v.validate();
}

function applyRule(v, field, ruleName, args) {
  switch (ruleName) {
    case 'required': v.required(field); break;
    case 'string': v.string(field); break;
    case 'number': v.number(field); break;
    case 'integer': v.integer(field); break;
    case 'boolean': v.boolean(field); break;
    case 'email': v.email(field); break;
    case 'uuid': v.uuid(field); break;
    case 'array': v.array(field); break;
    case 'min': v.number(field, { min: Number(args[0]) }); break;
    case 'max': v.number(field, { max: Number(args[0]) }); break;
    case 'minLength': v.string(field, { minLength: Number(args[0]) }); break;
    case 'maxLength': v.string(field, { maxLength: Number(args[0]) }); break;
    case 'enum': v.enum(field, args); break;
  }
}

module.exports = {
  Validator,
  ValidationError,
  validate,
};
