'use strict';

// node native
const EventEmitter = require('events');
const util = require('util');

// http utilities
const onFinished = require('on-finished');

// from koa
const compose = require('koa-compose');

// local
const request = require('./request.js');
const response = require('./response.js');
const context = require('./context.js');

// others
const debug = require('debug');
const only = require('only');

/**
 * Application class.
 * Inherits from `Emitter.prototype`
 *
 *    on('error', error => void)
 */
module.exports = class Application extends EventEmitter {
  constructor() {
    super();

    // prototype
    this.context = Object.create(context);
    this.request = Object.create(request);
    this.response = Object.create(response);

    // middleware stack
    this.middlewares = [];

    // settings
    this.env = process.env.NODE_ENV || 'development';
    this.keys = null;
    this.proxy = false;
    this.silent = false;
  }

  /**
   * Return JSON representation.
   * Only shows settings.
   * @return {Object}
   * @public
   */
  toJSON() {
    return only(this, ['env', 'proxy']);
  }

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @public
   */
  inspect() {
    return this.toJSON();
  }

  /**
   * Use the given middleware `fn`.
   * Returns the application itself, so calls could be chained.
   *
   * @param {Function} fn
   * @return {Application} self
   * @public
   */
  use(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('middleware must be a function!');
    }
    debug('[use] %s', fn.name || fn._name || '-');
    this.middlewares.push(fn);
    return this;
  }

  /**
   * Return a request listener callback
   * for node's native http server.
   *
   * @return {Function} requestListener
   * @public
   */
  callback() {
    const middleware = compose(this.middlewares);

    if (!this.listenerCount('error')) this.on('error', this.onerror);

    /**
     * requestListener
     *
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    const requestListener = (req, res) => {
      const ctx = this.createContext(req, res);
      // set ctx.onerror=(error) => {...} to override the default handling
      const onerror = error => error && ctx.onerror(error);
      // set ctx.respond=false to bypass default handling
      // set ctx.respond=() => {...} to override the default handling
      const respond = () => ctx.respond && ctx.respond();

      // handle the error emited during sending
      onFinished(res, onerror);

      // respond after middleware excuted
      return middleware(ctx).then(respond).catch(onerror);
    };

    return requestListener;
  }

  /**
   * Initialize a new context.
   *
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @return {}
   * @private
   */
  createContext(req, res) {
    const context = Object.create(this.context);
    const request = Object.create(this.request);
    const response = Object.create(this.response);
    request.ctx = response.ctx = context;
    context.request = response.request = request;
    context.response = request.response = response;
    context.app = request.app = response.app = this;

    context.req = request.req = response.req = req;
    context.res = request.res = response.res = res;

    /** initialize ctx.request */
    request.originalUrl = req.url; // store the orginal url
    request._accept = null;

    /** initialize ctx.response */
    response._explicitStatus = false;
    response._body = null;
    res.statusCode = 404;

    /** initialize context */
    context.state = {};
    context._cookies = null;

    return context;
  }

  /**
   * Default error handler
   * Just output errors to stderr
   *
   * @param {Error} error
   * @private
   */
  onerror(error) {
    if (!(error instanceof Error)) {
      throw new TypeError(util.format('non-error thrown: %j', error));
    }

    if (error.expose) return;
    if (this.silent) return;

    const msg = error.stack || error.toString();
    console.error();
    console.error(msg.replace(/^/gm, '  '));
    console.error();
  }
};
