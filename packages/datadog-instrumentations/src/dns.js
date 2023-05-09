'use strict'

const {
  addHook,
  AsyncResource,
  tracingChannel
} = require('./helpers/instrument')
const shimmer = require('../../datadog-shimmer')

const rrtypes = {
  resolveAny: 'ANY',
  resolve4: 'A',
  resolve6: 'AAAA',
  resolveCname: 'CNAME',
  resolveMx: 'MX',
  resolveNs: 'NS',
  resolveTxt: 'TXT',
  resolveSrv: 'SRV',
  resolvePtr: 'PTR',
  resolveNaptr: 'NAPTR',
  resolveSoa: 'SOA'
}

addHook({ name: 'dns' }, dns => {
  dns.lookup = wrap('dns:lookup', dns.lookup, 2)
  dns.lookupService = wrap('dns:lookup_service', dns.lookupService, 3)
  dns.resolve = wrap('dns:resolve', dns.resolve, 2)
  dns.reverse = wrap('dns:reverse', dns.reverse, 2)

  patchResolveShorthands(dns)

  if (dns.Resolver) {
    dns.Resolver.prototype.resolve = wrap('dns:resolve', dns.Resolver.prototype.resolve, 2)
    dns.Resolver.prototype.reverse = wrap('dns:reverse', dns.Resolver.prototype.reverse, 2)

    patchResolveShorthands(dns.Resolver.prototype)
  }

  return dns
})

function patchResolveShorthands (prototype) {
  Object.keys(rrtypes)
    .filter(method => !!prototype[method])
    .forEach(method => {
      prototype[method] = wrap('dns:resolve', prototype[method], 2, rrtypes[method])
    })
}

function wrap (prefix, fn, expectedArgs, rrtype) {
  const tc = tracingChannel(prefix)

  const wrapped = function (...args) {
    if (
      !tc.start.hasSubscribers ||
      args.length < expectedArgs ||
      typeof args[args.length - 1] !== 'function'
    ) {
      return fn.apply(this, args)
    }

    // TODO(bengl) We should be able to do without this bind. We'll likely
    // need to grab the current store, stash it in the context, and temporarily
    // enterWith it between asyncStart and asyncEnd.
    args[args.length - 1] = AsyncResource.bind(args[args.length - 1])

    if (rrtype) {
      args.splice(args.length - 1, 0, rrtype)
    }

    return tc.traceCallback(fn, -1, { args }, this, ...args)
  }

  return shimmer.wrap(fn, wrapped)
}
