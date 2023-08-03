'use strict'

const Analyzer = require('./vulnerability-analyzer')
const { HARDCODED_SECRET } = require('../vulnerabilities')
const { getRelativePath } = require('../path-line')

const secretRules = [{
  id: 'github-app-token',
  regex: /(ghu|ghs)_[0-9a-zA-Z]{36}/
}, {
  id: 'aws-access-token',
  regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/
}
]

class HarcodedSecretAnalyzer extends Analyzer {
  constructor () {
    super(HARDCODED_SECRET)
  }

  onConfigure () {
    this.addSub('datadog:secrets:result', (secrets) => { this.analyze(secrets) })
  }

  analyze (secrets) {
    // TODO: check cases where there is context.
    const literalAndMatches = secrets.literals.map(literal => {
      const match = secretRules.find(rule => literal.value.match(rule.regex))
      return match ? { literal, match } : undefined
    }).filter(match => !!match)

    if (literalAndMatches) {
      literalAndMatches.forEach(literalAndMatch => {
        const line = literalAndMatch.literal.line
        const file = secrets.file && getRelativePath(secrets.file)
        this._report({ file, line, data: literalAndMatch.match.id })
      })
    }
  }

  _getEvidence (value) {
    return { value: `${value.data}` }
  }

  _getLocation (value) {
    return {
      path: value.file,
      line: value.line,
      isInternal: false
    }
  }
}

module.exports = new HarcodedSecretAnalyzer()
