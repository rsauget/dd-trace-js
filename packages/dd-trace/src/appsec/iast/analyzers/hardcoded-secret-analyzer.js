'use strict'

const Analyzer = require('./vulnerability-analyzer')
const { HARDCODED_SECRET } = require('../vulnerabilities')
const waf = require('../../waf')
const addresses = require('../../addresses')
const WAFContextWrapper = require('../../waf/waf_context_wrapper')
const log = require('../../../log')

class IastContextWrapper extends WAFContextWrapper {
  run (params) {
    const inputs = this._formatInput(params)

    if (!inputs) return

    try {
      const result = this.ddwafContext.run(inputs, this.wafTimeout)

      return result
    } catch (err) {
      log.error('Error while running the AppSec WAF')
      log.error(err)
    }
  }
}

class HarcodedSecretAnalyzer extends Analyzer {
  constructor () {
    super(HARDCODED_SECRET)
  }

  onConfigure () {
    this.addSub('datadog:secrets:result', (secrets) => { this.analyze(secrets) })
  }

  analyze (secrets) {
    // TODO: check cases where there is context.
    const wafContext = waf.wafManager.newWAFContext(IastContextWrapper)
    const result = wafContext.run({ [addresses.HARCODED_SECRET]: { secrets: secrets.literals } })

    if (result.data) {
      this._report({ file: secrets.file, data: result.data })
    }
  }

  _getEvidence (value) {
    const data = JSON.parse(value.data)[0]
    return { value: `${data.rule.id}` }
  }

  _getLocation (value) {
    return {
      path: value.file,
      line: 0,
      isInternal: false
    }
  }
}

module.exports = new HarcodedSecretAnalyzer()
