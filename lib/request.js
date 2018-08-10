'use strict';

// node native
const stringify = require('url');

// http utilities
const accepts = require('accepts');
const contentType = require('content-type');
const fresh = require('fresh');
const parseurl = require('parseurl');
const querystring = require('querystring');
const typeis = require('type-is').is;

// others
const only = require('only');

/**
 * Prototype or requests.
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
    return only(this, ['method', 'url', 'header']);
  },

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @public
   */
  inspect() {
    if (!this.req) return null;
    return this.toJSON();
  },

  /**
   * Return request header.
   *
   * The `Referrer` header field is special-cased,
   * both `Referrer` and `Referer` are interchangeable.
   *
   * Examples:
   *
   *     this.get('Content-Type');
   *     // => "text/plain"
   *
   *     this.get('content-type');
   *     // => "text/plain"
   *
   *     this.get('Something');
   *     // => undefined
   *
   * @param {String} field
   * @return {String}
   * @public
   */
  get(field) {
    const headers = this.req.headers;
    switch (field = field.toLowerCase()) {
      case 'referer':
      case 'referrer':
        return headers.referrer || headers.referer || '';
      default:
        return headers[field] || '';
    }
  },

  /**
   * If `app.proxy` is `true`, parse
   * the "X-Forwarded-For" ip address list.
   * Or else the list only include the client's ip.
   *
   * For example if the value were `client, proxy1, proxy2`
   * you would receive the array `["client", "proxy1", "proxy2"]`
   * where "proxy2" is the furthest down-stream.
   *
   * @return {Array}
   * @public
   */
  get ips() {
    if (!this.app.proxy) return [this.req.socket.remoteAddress];
    const forwarded = this.get('X-Forwarded-For');
    return forwarded ? forwarded.split(/\s*,\s*/) : [];
  },

  get ip() {
    return this.ips[0] || '';
  },

  /**
   * Return the protocol string "http" or "https"
   * when requested with TLS. When the proxy setting
   * is enabled the "X-Forwarded-Proto" header
   * field will be trusted. If you're running behind
   * a reverse proxy that supplies https for you this
   * may be enabled.
   *
   * @return {String}
   * @public
   */
  get protocol() {
    if (this.req.socket.encrypted) return 'https';
    if (!this.app.proxy) return 'http';
    const proto = this.get('X-Forwarded-Proto');
    return proto ? proto.split(/\s*,\s*/)[0] : 'http';
  },

  /**
   * Parse the "Host" header field host
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   *
   * @return {String} hostname:port
   * @public
   */
  get host() {
    const host = (this.app.proxy && this.get('X-Forwarded-Host')) ||
                  this.get('Host');
    return host ? host.split(/\s*,\s*/)[0] : '';
  },

  /**
   * Parse the "Host" header field hostname
   * and support X-Forwarded-Host when a
   * proxy is enabled.
   *
   * @return {String} hostname
   * @public
   */
  get hostname() {
    const host = this.host;
    if ('[' === host.charAt(0)) return host.substring(0, host.indexOf(']'));
    return host ? host.split(':')[0] : '';
  },

  /**
   * Get origin of URL.
   *
   * @return {String}
   * @public
   */
  get origin() {
    return `${this.protocol}://${this.host}`;
  },

  /**
   * Get WHATWG parsed URL.
   * Lazily memoized.
   *
   * @return {URL|Object}
   * @public
   */
  get URL() {
    if (!this.memoizedURL) {
      const protocol = this.protocol;
      const host = this.host;
      const originalUrl = this.originalUrl || '';
      try {
        this.memoizedURL = new URL(`${protocol}://${host}${originalUrl}`);
      } catch (err) {
        this.memoizedURL = Object.create(null);
      }
    }
    return this.memoizedURL;
  },

  /**
   * Get full request URL.
   *
   * @return {String}
   * @public
   */
  get href() {
    if (/^https?:\/\//i.test(this.originalUrl)) return this.originalUrl;
    return this.origin + this.originalUrl;
  },

  /**
   * Key-value pairs of header names and values.
   * Header names are lower-cased
   *
   * @return {Object}
   * @public
   */
  get headers() {
    return this.req.headers;
  },

  /**
   * Key-value pairs of header names and values.
   *
   * @param {Object} val
   * @public
   */
  set headers(val) {
    this.req.headers = val;
  },

  /**
   * Get request method.
   * @return {String}
   * @public
   */
  get method() {
    return this.req.method;
  },

  set method(val) {
    this.req.method = val;
  },

  /**
   * Check if the request is idempotent.
   *
   * @return {Boolean}
   * @public
   */
  get idempotent() {
    const methods = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'];
    return !!~methods.indexOf(this.req.method);
  },

  /**
   * Request URL string.
   * This contains only the URL that is present in the actual HTTP request
   *
   * @return {string}
   */
  get url() {
    return this.req.url;
  },

  set url(val) {
    this.req.url = val;
  },

  /**
   * Get request pathname.
   *
   * @return {String}
   * @public
   */
  get path() {
    return parseurl(this).pathname;
  },

  /**
   * Set pathname, retaining the query-string when present.
   *
   * @param {String} path
   * @public
   */
  set path(path) {
    const url = parseurl(this);
    if (url.pathname === path) return;

    url.pathname = path;
    url.path = null;

    this.req.url = stringify(url);
  },

  get search() {
    return parseurl(this).search || '';
  },

  set search(str) {
    const url = parseurl(this);
    if (url.search === str) return;

    url.search = str;
    url.path = null;

    this.url = stringify(url);
  },

  /**
   * Get query string.
   * @return {String}
   * @public
   */
  get querystring() {
    return parseurl(this).query || '';
  },

  set querystring(str) {
    this.search = `${str}`;
  },

  /**
   * Get parsed query-string.
   *
   * @return {Object}
   * @public
   */

  get query() {
    const str = this.querystring;
    const cache = this._querycache = this._querycache || {};
    return cache[str] || (cache[str] = querystring.parse(str));
  },

  /**
   * Set query-string as an object.
   *
   * @param {Object} obj
   * @public
   */

  set query(obj) {
    this.querystring = querystring.stringify(obj);
  },

  /**
   * Check if the request is fresh, aka
   * Last-Modified and/or the ETag still match.
   *
   * @return {Boolean}
   * @public
   */

  get fresh() {
    const method = this.req.method;
    const status = this.res.status;

    // GET or HEAD for weak freshness validation only
    if ('GET' !== method && 'HEAD' !== method) return false;

    // 2xx or 304 as per rfc2616 14.26
    if ((status >= 200 && status < 300) || 304 === status) {
      return fresh(this.header, this.response.header);
    }

    return false;
  },

  /**
   * Return parsed Content-Length when present.
   *
   * @return {Number}
   * @public
   */
  get length() {
    const len = this.get('Content-Length');
    if (len == '') return;
    return ~~len;
  },

  /**
   * Return the request mime type void of
   * parameters such as "charset".
   *
   * @return {String}
   * @public
   */
  get type() {
    const type = this.get('Content-Type');
    return type ? type.split(';')[0] : '';
  },

  /**
   * Get the charset when present or undefined.
   *
   * @return {String}
   * @public
   */
  get charset() {
    let type = this.get('Content-Type');
    if (!type) return '';

    try {
      type = contentType.parse(type);
    } catch (e) {
      return '';
    }

    return type.parameters.charset || '';
  },

  /**
   * Check if the incoming request contains the "Content-Type"
   * header field, and it contains any of the give mime `type`s.
   * If there is no request body, `null` is returned.
   * If there is no content type, `false` is returned.
   * Otherwise, it returns the first `type` that matches.
   *
   * Examples:
   *
   *     // With Content-Type: text/html; charset=utf-8
   *     this.is('html'); // => 'html'
   *     this.is('text/html'); // => 'text/html'
   *     this.is('text/*', 'application/json'); // => 'text/html'
   *
   *     // When Content-Type is application/json
   *     this.is('json', 'urlencoded'); // => 'json'
   *     this.is('application/json'); // => 'application/json'
   *     this.is('html', 'application/*'); // => 'application/json'
   *
   *     this.is('html'); // => false
   *
   * @param {String|Array} types...
   * @return {String|false|null}
   * @public
   */
  is(types) {
    if (!types) return this.type || false;
    if (!Array.isArray(types)) types = [].slice.call(arguments);
    return typeis(this.type, types);
  },

  get accept() {
    return this._accept || (this._accept = accepts(this.req));
  },

  /**
   * Check if the given `type(s)` is acceptable, returning
   * the best match when true, otherwise `false`, in which
   * case you should respond with 406 "Not Acceptable".
   *
   * The `type` value may be a single mime type string
   * such as "application/json", the extension name
   * such as "json" or an array `["json", "html", "text/plain"]`. When a list
   * or array is given the _best_ match, if any is returned.
   *
   * Examples:
   *
   *     // Accept: text/html
   *     this.accepts('html');
   *     // => "html"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('html');
   *     // => "html"
   *     this.accepts('text/html');
   *     // => "text/html"
   *     this.accepts('json', 'text');
   *     // => "json"
   *     this.accepts('application/json');
   *     // => "application/json"
   *
   *     // Accept: text/*, application/json
   *     this.accepts('image/png');
   *     this.accepts('png');
   *     // => false
   *
   *     // Accept: text/*;q=.5, application/json
   *     this.accepts(['html', 'json']);
   *     this.accepts('html', 'json');
   *     // => "json"
   *
   * @param {String|Array} type(s)...
   * @return {String|Array|false}
   * @public
   */

  accepts(...args) {
    return this.accept.types(...args);
  },

  /**
   * Return accepted encodings or best fit based on `encodings`.
   *
   * Given `Accept-Encoding: gzip, deflate`
   * an array sorted by quality is returned:
   *
   *     ['gzip', 'deflate']
   *
   * @param {String|Array} encoding(s)...
   * @return {String|Array}
   * @public
   */

  acceptsEncodings(...args) {
    return this.accept.encodings(...args);
  },

  /**
   * Return accepted charsets or best fit based on `charsets`.
   *
   * Given `Accept-Charset: utf-8, iso-8859-1;q=0.2, utf-7;q=0.5`
   * an array sorted by quality is returned:
   *
   *     ['utf-8', 'utf-7', 'iso-8859-1']
   *
   * @param {String|Array} charset(s)...
   * @return {String|Array}
   * @public
   */

  acceptsCharsets(...args) {
    return this.accept.charsets(...args);
  },

  /**
   * Return accepted languages or best fit based on `langs`.
   *
   * Given `Accept-Language: en;q=0.8, es, pt`
   * an array sorted by quality is returned:
   *
   *     ['es', 'pt', 'en']
   *
   * @param {String|Array} lang(s)...
   * @return {Array|String}
   * @public
   */

  acceptsLanguages(...args) {
    return this.accept.languages(...args);
  }
};
