/**
 * 请求处理器
 */
export class RequestHandler {
  constructor(options = {}) {
    this.timeout = options.timeout ?? 30_000;
  }

  /**
   * 发送 HTTP 请求
   * @param {string} url
   * @param {RequestInit} options
   * @returns {Promise<Response>}
   */
  async send(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new VBotRequestError(`Request timeout after ${this.timeout}ms`, 'ETIMEOUT');
      }
      throw new VBotRequestError(err.message, 'EREQERR');
    }
  }

  /**
   * 构造带查询参数的 URL
   * @param {string} base
   * @param {object} params
   */
  static buildQuery(base, params) {
    if (!params || Object.keys(params).length === 0) return base;
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null)
    ).toString();
    return `${base}?${qs}`;
  }
}

export class VBotRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'VBotRequestError';
    this.code = code;
  }
}
