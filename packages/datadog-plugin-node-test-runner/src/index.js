const CiPlugin = require('../../dd-trace/src/plugins/ci_plugin')
const {
  TEST_STATUS,
  finishAllTraceSpans,
  getTestSuitePath
} = require('../../dd-trace/src/plugins/util/test')
const { storage } = require('../../datadog-core')

class NodeTestRunner extends CiPlugin {
  static get id () {
    return 'node-test-runner'
  }
  constructor (...args) {
    super(...args)
    this.sourceRoot = process.cwd()

    this.addSub('dd-trace:ci:node-test-runner:test:start', ({ testName, testSuite }) => {
      const store = storage.getStore()
      const testSuiteRelative = getTestSuitePath(testSuite, this.sourceRoot)
      const testSpan = this.startTestSpan(testName, testSuiteRelative)
      this.enter(testSpan, store)
    })
    this.addSub('dd-trace:ci:node-test-runner:test:finish', ({ status, error }) => {
      const store = storage.getStore()
      if (store && store.span) {
        const testSpan = store.span
        testSpan.setTag(TEST_STATUS, status)
        if (error) {
          testSpan.setTag('error', error)
        }
        testSpan.finish()
        finishAllTraceSpans(testSpan)
      }
    })
  }
}

module.exports = NodeTestRunner
