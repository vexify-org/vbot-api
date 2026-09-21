/**
 * VBot API Client - 基础客户端
 */
import { AuthManager } from './auth.js';
import { RequestHandler } from './request.js';
import { ResponseHandler } from './response.js';

export class VBotClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl - API 基础 URL
   * @param {string} [options.apiKey] - API Key
   * @param {string} [options.token] - Bearer Token
   * @param {number} [options.timeout=30000] - 请求超时（ms）
   * @param {object} [options.headers] - 默认请求头
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') || 'https://api.vbot.example.com';
    this.timeout = options.timeout ?? 30_000;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers
    };

    this.auth = new AuthManager({ apiKey: options.apiKey, token: options.token });
    this.request = new RequestHandler({ timeout: this.timeout });
    this.response = new ResponseHandler();
  }

  /** 设置 Bearer Token */
  setToken(token) {
    this.auth.setToken(token);
    return this;
  }

  /** 设置 API Key */
  setApiKey(apiKey) {
    this.auth.setApiKey(apiKey);
    return this;
  }

  /**
   * 发起 GET 请求
   * @param {string} path
   * @param {object} [params]
   * @param {object} [options]
   */
  async get(path, params, options = {}) {
    const url = this._buildUrl(path, params);
    return this._request('GET', url, null, options);
  }

  /**
   * 发起 POST 请求
   * @param {string} path
   * @param {object} [data]
   * @param {object} [options]
   */
  async post(path, data, options = {}) {
    return this._request('POST', this._buildUrl(path), data, options);
  }

  /**
   * 发起 PUT 请求
   */
  async put(path, data, options = {}) {
    return this._request('PUT', this._buildUrl(path), data, options);
  }

  /**
   * 发起 PATCH 请求
   */
  async patch(path, data, options = {}) {
    return this._request('PATCH', this._buildUrl(path), data, options);
  }

  /**
   * 发起 DELETE 请求
   */
  async delete(path, options = {}) {
    return this._request('DELETE', this._buildUrl(path), null, options);
  }

  _buildUrl(path, params) {
    const url = `${this.baseUrl}${path}`;
    if (!params) return url;
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null)
    ).toString();
    return qs ? `${url}?${qs}` : url;
  }

  async _request(method, url, data, options = {}) {
    const headers = {
      ...this.headers,
      ...this.auth.getHeaders(),
      ...options.headers
    };

    const reqOptions = {
      method,
      headers,
      signal: options.signal,
      body: data != null ? JSON.stringify(data) : undefined
    };

    const rawResponse = await this.request.send(url, reqOptions);
    return this.response.handle(rawResponse);
  }
}
