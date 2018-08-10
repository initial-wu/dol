'use strict';

// node native
const extname = require('path').extname;
const Stream = require('stream');
const util = require('util');

// http utilities
const contentType = require('mime-types').contentType;
const contentDisposition = require('content-disposition');
const escape = require('escape-html');
const onFinished = require('on-finished');
const statuses = require('statuses');
const typeis = require('type-is').is;
const vary = require('vary');

// stream utilities
const destroy = require('destroy');
const inject = require('error-inject');

// from koa
const isJSON = require('koa-is-json');

// others
const only = require('only');

/**
 * Prototype of responses.
 *
 * @exports
 */
module.exports = {
  /**
   * Return JSON representation.
   *
   * @return {Object}
   * @public
   */
  toJSON() {
    return only(this, ['status', 'message', 'header']);
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @public
   */
  inspect() {
    if (!this.res) return null;
    const o = this.toJSON();
    o.body = this.body;
    return o;
  },

  /**
   * Checks if the request is writable.
   * Tests for the existence of the socket
   * as node sometimes does not set it.
   *
   * @return {Boolean}
   * @private
   */
  get writable() {
    const res = this.res;
    if (res.finished) return false;

    // There are already pending outgoing res, but still writable
    // https://github.com/nodejs/node/blob/v4.4.7/lib/_http_server.js#L486
    const socket = res.socket;
    return socket ? socket.writable : true;
  },

  /**
   * Return response headers.
   *
   * @return {Object}
   * @public
   */
  get headers() {
    const res = this.res;
    return typeof res.getHeaders === 'function'
      ? res.getHeaders()
      : res._headers || {}; // Node < 7.7
  },

  /**
   * Check if headers have been written to the socket.
   *
   * @return {Boolean}
   * @public
   */
  get headersSent() {
    return this.res.headersSent;
  },

  /**
   * Flush set headers, and begin the body
   */
  flushHeaders() {
    this.res.flushHeaders();
  },

  /**
   * Return response header `field`.
   *
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   * @param {String} field
   * @return {String}
   * @public
   */
  get(field) {
    return this.headers[field.toLowerCase()] || '';
  },

  /**
   * Set header `field` to `val`, or pass
   * an object of header fields.
   *
   * Examples:
   *
   *    this.set('Foo', ['bar', 'baz']);
   *    this.set('Accept', 'application/json');
   *    this.set({ Accept: 'text/plain', 'X-API-Key': 'tobi' });
   *
   * @param {String|Object|Array} field
   * @param {String} val
   * @public
   */
  set(field, val) {
    if (this.headersSent) return;

    if (2 === arguments.length) {
      if (Array.isArray(val)) val = val.map(String);
      else val = String(val);
      this.res.setHeader(field, val);
    } else {
      for (const key in field) {
        this.set(key, field[key]);
      }
    }
  },

  /**
   * Append additional header `field` with value `val`.
   *
   * Examples:
   *
   *    this.append('Link', ['<http://localhost/>', '<http://localhost:3000/>']);
   *    this.append('Set-Cookie', 'foo=bar; Path=/; HttpOnly');
   *    this.append('Warning', '199 Miscellaneous warning');
   *
   * @param {String} field
   * @param {String|Array} val
   * @public
   */
  append(field, val) {
    if (this.headersSent) return;

    const original = this.get(field);
    if (original) {
      val = Array.isArray(original)
        ? original.concat(val)
        : [original].concat(val);
    }

    return this.set(field, val);
  },

  /**
   * Remove header `field`.
   *
   * @param {String} name
   * @public
   */
  remove(field) {
    if (this.headersSent) return;
    this.res.removeHeader(field);
  },

  /**
   * Vary on `field`.
   *
   * @param {String} field
   * @public
   */
  vary(field) {
    if (this.headersSent) return;
    vary(this.res, field);
  },

  /**
   * Set Content-Length field to `n`.
   *
   * @param {Number} n
   * @public
   */
  set length(n) {
    this.set('Content-Length', n);
  },

  /**
   * Return parsed response "Content-Length" field when present.
   * Or deduce from `response.body`.
   * Or `null`
   *
   * @return {Number}
   * @public
   */
  get length() {
    const len = this.headers['content-length'];

    // null or undefined
    if (null == len) {
      const body = this.body;
      if (!body) return null;
      if ('string' == typeof body) return Buffer.byteLength(body);
      if (Buffer.isBuffer(body)) return body.length;
      if (isJSON(body)) return Buffer.byteLength(JSON.stringify(body));
      return null;
    }

    // convert into number
    return ~~len;
  },

  /**
   * Set Content-Type response header with `type` through `mime.lookup()`
   * when it does not contain a charset.
   *
   * Examples:
   *
   *     this.type = '.html';
   *     this.type = 'html';
   *     this.type = 'json';
   *     this.type = 'application/json';
   *     this.type = 'png';
   *
   * @param {String} type
   * @public
   */
  set type(type) {
    type = contentType(type);
    if (type) {
      this.set('Content-Type', type);
    } else {
      this.remove('Content-Type');
    }
  },

  /**
   * Return the response mime type
   * void of parameters such as "charset".
   *
   * @return {String}
   * @public
   */
  get type() {
    const type = this.get('Content-Type');
    return type ? type.split(';')[0] : '';
  },

  /**
   * Check whether the response is one of the listed types.
   * Pretty much the same as `this.request.is()`.
   *
   * @param {String|Array} types...
   * @return {String|false}
   * @public
   */

  is(types) {
    if (!types) return this.type || false;
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(this.type, types);
  },

  /**
   * Set Content-Disposition header to "attachment" with optional `filename`.
   *
   * @param {String} [filename]
   * @public
   */
  attachment(filename) {
    if (filename) this.type = extname(filename);
    this.set('Content-Disposition', contentDisposition(filename));
  },

  /**
   * Set the Last-Modified date using a string or a Date.
   *
   *     this.response.lastModified = new Date();
   *     this.response.lastModified = '2013-09-13';
   *
   * @param {String|Date} type
   * @public
   */
  set lastModified(val) {
    if ('string' === typeof val) val = new Date(val);
    this.set('Last-Modified', val.toUTCString());
  },

  /**
   * Get the Last-Modified date in Date form, if it exists.
   *
   * @return {Date}
   * @public
   */
  get lastModified() {
    const date = this.get('last-modified');
    return date ? new Date(date) : '';
  },

  /**
   * Set the ETag of a response.
   * This will normalize the quotes if necessary.
   *
   *     this.response.etag = 'md5hashsum';
   *     this.response.etag = '"md5hashsum"';
   *     this.response.etag = 'W/"123456789"';
   *
   * @param {String} etag
   * @public
   */

  set etag(val) {
    if (!/^(W\/)?"/.test(val)) val = `"${val}"`;
    this.set('ETag', val);
  },

  /**
   * Get the ETag of a response.
   *
   * @return {String}
   * @public
   */
  get etag() {
    return this.get('ETag');
  },

  /**
   * Set response status message
   *
   * @param {String} msg
   * @public
   */
  set message(msg) {
    this.res.statusMessage = msg;
  },

  /**
   * Get response status message
   *
   * @return {String}
   * @public
   */
  get message() {
    return this.res.statusMessage || '';
  },

  /**
   * Set response status code.
   * Set statusMessage & body automatically
   * @param {Number} code
   * @public
   */
  set status(code) {
    if (this.headersSent) return;

    if ('number' !== typeof code) {
      throw new TypeError(util.format('non-numeric status code: %j', code));
    }

    if (!statuses[code]) {
      throw new RangeError(util.format('invalid status code: %d', code));
    }

    // Record once the setter is called
    this._explicitStatus = true;
    this.res.statusCode = code;

    // Set statusMessage & body automatically
    if (this.req.httpVersionMajor < 2) this.res.statusMessage = statuses[code];
    if (this.body && statuses.empty[code]) this.body = null;
  },

  /**
   * Get response status code.
   *
   * @return {Number}
   * @public
   */
  get status() {
    return this.res.statusCode;
  },

  /**
   * Set response body.
   *
   * @param {String|Buffer|Object|Stream} val
   * @public
   */
  set body(val) {
    const original = this._body;

    if (original !== val && original instanceof Stream) {
      destroy(original);
    }

    this._body = val;

    // no content
    if (null == val) {
      if (!statuses.empty[this.status]) this.status = 204;
      this.remove('Content-Type');
      this.remove('Content-Length');
      this.remove('Transfer-Encoding');
      return;
    }

    // set the status
    if (!this._explicitStatus) this.status = 200;

    // set the content-type only if not yet set
    const setType = !this.headers['content-type'];

    // string
    if ('string' == typeof val) {
      if (setType) this.type = /^\s*</.test(val) ? 'html' : 'text';
      this.length = Buffer.byteLength(val);
      return;
    }

    // buffer
    if (Buffer.isBuffer(val)) {
      if (setType) this.type = 'bin';
      this.length = val.length;
      return;
    }

    // stream
    if (val instanceof Stream) {
      if (setType) this.type = 'bin';

      // destroy the stream when res is sent
      // or an error is emitted during sending
      onFinished(this.res, destroy.bind(null, val));
      inject(val, err => this.ctx.onerror(err));

      // overwriting
      if (null != original && original !== val) this.remove('Content-Length');

      return;
    }

    // json
    this.type = 'json';
    this.remove('Content-Length');
  },

  /**
   * Get response body.
   *
   * @return {Mixed}
   * @public
   */
  get body() {
    return this._body;
  },

  /**
   * Perform a 302 redirect to `url`.
   *
   * The string "back" is special-cased
   * to provide Referrer support, when Referrer
   * is not present `alt` or "/" is used.
   *
   * Examples:
   *
   *    this.redirect('back');
   *    this.redirect('back', '/index.html');
   *    this.redirect('/login');
   *    this.redirect('http://google.com');
   *
   * @param {String} url
   * @param {String} [alt]
   * @public
   */
  redirect(url, alt) {
    if ('back' == url) url = this.request.get('Referrer') || alt || '/';

    // location field
    this.set('Location', url);

    // status
    if (!statuses.redirect[this.status]) this.status = 302;

    // html
    if (this.request.accepts('html')) {
      url = escape(url);
      this.type = 'html';
      this.body = `Redirecting to <a href="${url}">${url}</a>.`;
      return;
    }

    // text
    this.type = 'text';
    this.body = `Redirecting to ${url}.`;
  }
};
