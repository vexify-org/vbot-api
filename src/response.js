/**
 * 响应处理器
 */
export class ResponseHandler {
  constructor() {
    this._parsers = new Map();
  }

  /**
   * 注册自定义响应解析器
   * @param {string} contentType
   * @param {(text: string) => any} parser
   */
  registerParser(contentType, parser) {
    this._parsers.set(contentType, parser);
  }

  /**
   * 处理响应
   * @param {Response} response
   * @returns {Promise<object>}
   */
  async handle(response) {
    const status = response.status;
    const contentType = response.headers.get('content-type') || '';

    // 解析响应体
    let body;
    try {
      if (contentType.includes('application/json')) {
        body = await response.json();
      } else if (contentType.includes('text/')) {
        body = await response.text();
      } else {
        body = await response.blob();
      }
    } catch {
      body = null;
    }

    // 错误处理
    if (status >= 400) {
      const error = new VBotAPIError(
        this._extractMessage(body) || `HTTP ${status}`,
        status,
        body
      );
      throw error;
    }

    // 成功响应包装
    return {
      ok: true,
      status,
      data: body,
      headers: response.headers
    };
  }

  _extractMessage(body) {
    if (!body) return null;
    if (typeof body === 'string') return body;
    return body.message || body.msg || body.error || body.detail || null;
  }
}

export class VBotAPIError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {any} body
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'VBotAPIError';
    this.status = status;
    this.body = body;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isServerError() {
    return this.status >= 500;
  }
}
