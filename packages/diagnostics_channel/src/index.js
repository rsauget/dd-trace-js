'use strict'

const {
  Channel,
  channel,
  tracingChannel
} = require('diagnostics_channel') // eslint-disable-line n/no-restricted-require

const [major, minor] = process.versions.node.split('.')
const channels = new WeakSet()

// Our own DC with a limited subset of functionality stable across Node versions.
// TODO: Move the rest of the polyfill here.
// TODO: Switch to using global subscribe/unsubscribe/hasSubscribers.
const dc = { channel, tracingChannel }

// Prevent going to 0 subscribers to avoid bug in Node.
// See https://github.com/nodejs/node/pull/47520
if (major === '19' && minor === '9') {
  dc.channel = function () {
    const ch = channel.apply(this, arguments)

    if (!channels.has(ch)) {
      const subscribe = ch.subscribe
      const unsubscribe = ch.unsubscribe

      ch.subscribe = function () {
        delete ch.subscribe
        delete ch.unsubscribe

        const result = subscribe.apply(this, arguments)

        this.subscribe(() => {}) // Keep it active forever.

        return result
      }

      if (ch.unsubscribe === Channel.prototype.unsubscribe) {
        // Needed because another subscriber could have subscribed to something
        // that we unsubscribe to before the library is loaded.
        ch.unsubscribe = function () {
          delete ch.subscribe
          delete ch.unsubscribe

          this.subscribe(() => {}) // Keep it active forever.

          return unsubscribe.apply(this, arguments)
        }
      }

      channels.add(ch)
    }

    return ch
  }
}

if (!Channel.prototype.runStores) {
  Channel.prototype.runStores = function (data, fn, thisArg, ...args) {
    return Reflect.apply(fn, thisArg, args);
  }

  Channel.prototype.bindStore =

  function defaultTransform(data) {
    return data;
  }

  function wrapStoreRun(store, data, next, transform = defaultTransform) {
    return () => {
      let context;
      try {
        context = transform(data);
      } catch (err) {
        process.nextTick(() => {
          throw err;
        });
        return next();
      }

      return store.run(context, next);
    };
  }

  const dummyChannel = channel('foo')
  function listener () {}
  dummyChannel.subscribe(listener)
  const ActiveChannelPrototype = Object.getPrototypeOf(dummyChannel)
  dummyChannel.unsubscribe(listener)
  ActiveChannelPrototype.runStores = function (data, fn, thisArg, ...args) {
    let run = () => {
      this.publish(data);
      return Reflect.apply(fn, thisArg, args);
    };

    if (!this._stores) {
      this._stores = new Map()
    }
    for (const entry of this._stores.entries()) {
      const store = entry[0];
      const transform = entry[1];
      run = wrapStoreRun(store, data, run, transform);
    }

    return run();
  }

  ActiveChannelPrototype.bindStore = function(store, transform) {
    if (!this._stores) {
      this._stores = new Map()
    }
    this._stores.set(store, transform);
  }
}

if (!tracingChannel) {
  function ERR_INVALID_ARG_TYPE (arg, types, value) {
    return new TypeError(`The "${
      arg
    }" argument must be of type ${
      types.join('|')
    }. Received ${typeof value}`)
  }

  const traceEvents = [
    'start',
    'end',
    'asyncStart',
    'asyncEnd',
    'error',
  ];

  function assertChannel(value, name) {
    if (!(value instanceof Channel)) {
      throw new ERR_INVALID_ARG_TYPE(name, ['Channel'], value);
    }
  }

  class TracingChannel {
    constructor(nameOrChannels) {
      if (typeof nameOrChannels === 'string') {
        this.start = channel(`tracing:${nameOrChannels}:start`);
        this.end = channel(`tracing:${nameOrChannels}:end`);
        this.asyncStart = channel(`tracing:${nameOrChannels}:asyncStart`);
        this.asyncEnd = channel(`tracing:${nameOrChannels}:asyncEnd`);
        this.error = channel(`tracing:${nameOrChannels}:error`);
      } else if (typeof nameOrChannels === 'object') {
        const { start, end, asyncStart, asyncEnd, error } = nameOrChannels;

        assertChannel(start, 'nameOrChannels.start');
        assertChannel(end, 'nameOrChannels.end');
        assertChannel(asyncStart, 'nameOrChannels.asyncStart');
        assertChannel(asyncEnd, 'nameOrChannels.asyncEnd');
        assertChannel(error, 'nameOrChannels.error');

        this.start = start;
        this.end = end;
        this.asyncStart = asyncStart;
        this.asyncEnd = asyncEnd;
        this.error = error;
      } else {
        throw new ERR_INVALID_ARG_TYPE('nameOrChannels',
                                       ['string', 'object', 'Channel'],
                                       nameOrChannels);
      }
    }

    subscribe(handlers) {
      for (const name of traceEvents) {
        if (!handlers[name]) continue;

        this[name] && this[name].subscribe(handlers[name]);
      }
    }

    unsubscribe(handlers) {
      let done = true;

      for (const name of traceEvents) {
        if (!handlers[name]) continue;

        if (!this[name] || !this[name].unsubscribe(handlers[name])) {
          done = false;
        }
      }

      return done;
    }

    traceSync(fn, context = {}, thisArg, ...args) {
      const { start, end, error } = this;

      return start.runStores(context, () => {
        try {
          const result = Reflect.apply(fn, thisArg, args);
          context.result = result;
          return result;
        } catch (err) {
          context.error = err;
          error.publish(context);
          throw err;
        } finally {
          end.publish(context);
        }
      });
    }

    tracePromise(fn, context = {}, thisArg, ...args) {
      const { start, end, asyncStart, asyncEnd, error } = this;

      function reject(err) {
        context.error = err;
        error.publish(context);
        asyncStart.publish(context);
        // TODO: Is there a way to have asyncEnd _after_ the continuation?
        asyncEnd.publish(context);
        return Promise.reject(err);
      }

      function resolve(result) {
        context.result = result;
        asyncStart.publish(context);
        // TODO: Is there a way to have asyncEnd _after_ the continuation?
        asyncEnd.publish(context);
        return result;
      }

      return start.runStores(context, () => {
        try {
          let promise = Reflect.apply(fn, thisArg, args);
          // Convert thenables to native promises
          if (!(promise instanceof Promise)) {
            promise = Promise.resolve(promise);
          }
          return Promise.prototype.then(promise, resolve, reject);
        } catch (err) {
          context.error = err;
          error.publish(context);
          throw err;
        } finally {
          end.publish(context);
        }
      });
    }

    traceCallback(fn, position = -1, context = {}, thisArg, ...args) {
      const { start, end, asyncStart, asyncEnd, error } = this;

      function wrappedCallback(err, res) {
        if (err) {
          context.error = err;
          error.publish(context);
        } else {
          context.result = res;
        }

        // Using runStores here enables manual context failure recovery
        asyncStart.runStores(context, () => {
          try {
            if (callback) {
              return Reflect.apply(callback, this, arguments);
            }
          } finally {
            asyncEnd.publish(context);
          }
        });
      }

      const callback = args[position < 0 ? args.length + position : position];
      if (typeof callback !== 'function') {
        throw new ERR_INVALID_ARG_TYPE('callback', ['function'], callback);
      }
      Array.prototype.splice.call(args, position, 1, wrappedCallback);

      return start.runStores(context, () => {
        try {
          return Reflect.apply(fn, thisArg, args);
        } catch (err) {
          context.error = err;
          error.publish(context);
          throw err;
        } finally {
          end.publish(context);
        }
      });
    }
  }

  function tracingChannel(nameOrChannels) {
    return new TracingChannel(nameOrChannels);
  }

  dc.tracingChannel = tracingChannel
}

module.exports = dc
