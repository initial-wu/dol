'use strict';

// node native
const Stream = require('stream');
const util = require('util');

// http utilities
const statuses = require('statuses');
const Cookies = require('cookies');

// from koa
const isJSON = require('koa-is-json');

/**
 * Prototype of contexts.
 *
 * @exports
 */
const context = module.exports = {
  /**
   * Return JSON representation.
   *
   * @return {Object}
   * @public
   */

  toJSON() {
    return {
      request: this.request.toJSON(),
      response: this.response.toJSON(),
      app: this.app.toJSON(),
      req: '<original node req>',
      res: '<original node res>'
    };
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @public
   */

  inspect() {
    if (this === context) return this;
    return this.toJSON();
  },

  get cookies() {
    return this._cookies || (this._cookies = new Cookies(this.req, this.res, {
      keys: this.app.keys,
      secure: this.request.protocol === 'https'
    }));
  },

  /**
   * Default error handling for context.
   *
   * @param {Error} error
   */
  onerror(error) {
    if (null == error) return;

    if (!(error instanceof Error)) {
      error = new TypeError(util.format('non-error thrown: %j', error));
    }

    const response = this.response;
    const res = response.res;

    let headerSent = false;
    if (res.headerSent || !response.writable) {
      // set error.headerSent before an app error event emit
      headerSent = error.headerSent = true;
    }

    this.app.emit('error', error, this);

    if (headerSent) {
      return;
    }

    // first remove all headers
    if (typeof res.getHeaderNames === 'function') {
      res.getHeaderNames().forEach(name => res.removeHeader(name));
    } else {
      res._headers = {}; // Node < 7.7
    }

    // then set those specified in error.headers
    response.set(error.headers);

    // default to 500
    let status = 500;

    // ENOENT support
    if ('ENOENT' == error.code) status = 404;

    // error has a allowable status
    if (typeof error.status === 'number' && statuses[error.status]) {
      status = error.status;
    }

    const message = error.expose ? error.message : statuses[status];

    response.status = status;
    response.type = 'text';
    response.length = Buffer.byteLength(message);
    res.end(message);
  },

  /**
   * Default respond handling
   */
  respond() {
    const response = this.response;
    if (!response.writable) return;
    const res = this.res;

    const code = response.status;

    // ignore body
    if (statuses.empty[code]) {
      response.body = null;
      return res.end();
    }

    const request = this.request;

    if ('HEAD' === request.method) {
      const body = response.body;
      if (!res.headersSent && isJSON(body)) {
        response.length = Buffer.byteLength(JSON.stringify(body));
      }
      return res.end();
    }

    const body = response.body;

    // status body
    if (null == body) {
      const body = response.message || String(code);
      if (!res.headersSent) {
        response.type = 'text';
        response.length = Buffer.byteLength(body);
      }
      return res.end(body);
    }

    // responses
    if ('string' === typeof body) return res.end(body);
    if (Buffer.isBuffer(body)) return res.end(body);
    if (body instanceof Stream) return body.pipe(res);

    // responses as json
    const str = JSON.stringify(body);
    if (!res.headersSent) {
      response.length = Buffer.byteLength(str);
    }
    res.end(str);
  }
};
