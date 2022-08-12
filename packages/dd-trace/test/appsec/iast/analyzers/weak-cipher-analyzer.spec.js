'use strict'

const proxyquire = require('proxyquire')

describe('weak-cipher-analyzer', () => {
  const VULNERABLE_CIPHER = 'rc2'
  const NON_VULNERABLE_CIPHER = 'sha512'

  let datadogCore
  let weakCipherAnalyzer
  beforeEach(() => {
    datadogCore = {
      storage: {
        getStore: sinon.stub()
      }
    }
    weakCipherAnalyzer = proxyquire('../../../../src/appsec/iast/analyzers/weak-cipher-analyzer', {
      '../../../../../datadog-core': datadogCore
    })
  })
  afterEach(() => {
    sinon.restore()
  })

  it('should subscribe to crypto hashing channel', () => {
    expect(weakCipherAnalyzer._subscriptions).to.have.lengthOf(1)
    expect(weakCipherAnalyzer._subscriptions[0]._channel.name).to.equals('asm:crypto:cipher:start')
  })

  it('should not detect vulnerability when no algorithm', () => {
    const isVulnerable = weakCipherAnalyzer._isVulnerable()
    expect(isVulnerable).to.be.false
  })

  it('should not detect vulnerability when no vulnerable algorithm', () => {
    const isVulnerable = weakCipherAnalyzer._isVulnerable(NON_VULNERABLE_CIPHER)
    expect(isVulnerable).to.be.false
  })

  it('should detect vulnerability with different casing in algorithm word', () => {
    const isVulnerable = weakCipherAnalyzer._isVulnerable(VULNERABLE_CIPHER)
    const isVulnerableInLowerCase = weakCipherAnalyzer._isVulnerable(VULNERABLE_CIPHER.toLowerCase())
    const isVulnerableInUpperCase = weakCipherAnalyzer._isVulnerable(VULNERABLE_CIPHER.toUpperCase())
    expect(isVulnerable).to.be.true
    expect(isVulnerableInLowerCase).to.be.true
    expect(isVulnerableInUpperCase).to.be.true
  })
})
