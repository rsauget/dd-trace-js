'use strict'

const IncomingPlugin = require('./incoming')

class ConsumerPlugin extends IncomingPlugin {
  static get operation () { return 'receive' }
  static get type () { return 'messaging' }
}

module.exports = ConsumerPlugin
