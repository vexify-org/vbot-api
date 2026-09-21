/**
 * 认证管理器
 */
export class AuthManager {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? null;
    this.token = options.token ?? null;
  }

  /** 设置 Bearer Token */
  setToken(token) {
    this.token = token;
    return this;
  }

  /** 设置 API Key */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    return this;
  }

  /** 获取认证请求头 */
  getHeaders() {
    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }

  /** 是否已认证 */
  isAuthenticated() {
    return !!(this.token || this.apiKey);
  }
}
