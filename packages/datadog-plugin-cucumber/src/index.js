'use strict'

const CiPlugin = require('../../dd-trace/src/plugins/ci_plugin')
const { storage } = require('../../datadog-core')

const {
  TEST_SKIP_REASON,
  TEST_STATUS,
  TEST_SOURCE_START,
  finishAllTraceSpans,
  getTestSuitePath,
  getTestSuiteCommonTags,
  addIntelligentTestRunnerSpanTags,
  TEST_SUITE_ID,
  TEST_MODULE_ID,
  TEST_SESSION_ID,
  TEST_COMMAND,
  TEST_MODULE
} = require('../../dd-trace/src/plugins/util/test')
const { RESOURCE_NAME } = require('../../../ext/tags')
const { COMPONENT, ERROR_MESSAGE } = require('../../dd-trace/src/constants')

class CucumberPlugin extends CiPlugin {
  static get id () {
    return 'cucumber'
  }

  constructor (...args) {
    super(...args)

    this.sourceRoot = process.cwd()

    this.addSub('ci:cucumber:session:finish', ({ status, isSuitesSkipped, testCodeCoverageLinesTotal }) => {
      const { isSuitesSkippingEnabled, isCodeCoverageEnabled } = this.itrConfig || {}
      addIntelligentTestRunnerSpanTags(
        this.testSessionSpan,
        this.testModuleSpan,
        { isSuitesSkipped, isSuitesSkippingEnabled, isCodeCoverageEnabled, testCodeCoverageLinesTotal }
      )

      this.testSessionSpan.setTag(TEST_STATUS, status)
      this.testModuleSpan.setTag(TEST_STATUS, status)
      this.testModuleSpan.finish()
      this.testSessionSpan.finish()
      finishAllTraceSpans(this.testSessionSpan)

      this.itrConfig = null
      this.tracer._exporter.flush()
    })

    this.addSub('ci:cucumber:worker:finish', ({ onFlushed }) => {
      this.tracer._exporter.flush(onFlushed)
    })

    this.addSub('ci:cucumber:test-suite:start', ({ testSuiteFullPath, setId }) => {
      const store = storage.getStore()
      const testSuiteMetadata = getTestSuiteCommonTags(
        'yarn test',
        this.frameworkVersion,
        getTestSuitePath(testSuiteFullPath, this.sourceRoot),
        'cucumber'
      )
      const testSuiteSpan = this.tracer.startSpan('cucumber.test_suite', {
        childOf: this.testModuleSpan,
        tags: {
          [COMPONENT]: this.constructor.id,
          ...this.testEnvironmentMetadata,
          ...testSuiteMetadata
        }
      })
      this.enter(testSuiteSpan, store)
      setId(testSuiteSpan.context().toSpanId())
    })

    this.addSub('ci:cucumber:test-suite:finish', status => {
      const store = storage.getStore()
      if (store && store.span) {
        const testSuiteSpan = storage.getStore().span
        testSuiteSpan.setTag(TEST_STATUS, status)
        testSuiteSpan.finish()
      }
    })

    this.addSub('ci:cucumber:test-suite:code-coverage', ({ coverageFiles, suiteFile }) => {
      if (!this.itrConfig || !this.itrConfig.isCodeCoverageEnabled) {
        return
      }

      const store = storage.getStore()
      // IMPORTANT: CODE COVERAGE NEEDS TO USE THE ACTIVE SPAN CORRECTLY
      if (store && store.span) {
        const testSuiteSpan = store.span
        const relativeCoverageFiles = [...coverageFiles, suiteFile]
          .map(filename => getTestSuitePath(filename, this.sourceRoot))

        const formattedCoverage = {
          sessionId: testSuiteSpan.context()._traceId,
          suiteId: testSuiteSpan.context()._spanId,
          files: relativeCoverageFiles
        }

        this.tracer._exporter.exportCoverage(formattedCoverage)
      }
    })

    this.addSub('ci:cucumber:test:start', ({
      testName,
      fullTestSuite,
      testSourceLine,
      testSuiteId,
      moduleId,
      sessionId
    }) => {
      const store = storage.getStore()
      const testSuite = getTestSuitePath(fullTestSuite, this.sourceRoot)
      const testSpan = this.startTestSpan(testName, testSuite, testSourceLine, { testSuiteId, moduleId, sessionId })

      this.enter(testSpan, store)
    })

    this.addSub('ci:cucumber:test-step:start', ({ resource }) => {
      const store = storage.getStore()
      const childOf = store ? store.span : store
      const span = this.tracer.startSpan('cucumber.step', {
        childOf,
        tags: {
          [COMPONENT]: this.constructor.id,
          'cucumber.step': resource,
          [RESOURCE_NAME]: resource
        }
      })
      this.enter(span, store)
    })

    this.addSub('ci:cucumber:test:finish', ({ isStep, status, skipReason, errorMessage }) => {
      const span = storage.getStore().span
      const statusTag = isStep ? 'step.status' : TEST_STATUS

      span.setTag(statusTag, status)

      if (skipReason) {
        span.setTag(TEST_SKIP_REASON, skipReason)
      }

      if (errorMessage) {
        span.setTag(ERROR_MESSAGE, errorMessage)
      }

      span.finish()
      if (!isStep) {
        finishAllTraceSpans(span)
      }
    })

    this.addSub('ci:cucumber:error', (err) => {
      if (err) {
        const span = storage.getStore().span
        span.setTag('error', err)
      }
    })
  }

  startTestSpan (testName, testSuite, testSourceLine, { testSuiteId, moduleId, sessionId }) {
    const extraTags = {
      [TEST_SUITE_ID]: testSuiteId,
      [TEST_SESSION_ID]: sessionId,
      [TEST_COMMAND]: 'yarn test',
      [TEST_MODULE]: this.constructor.id,
      [TEST_MODULE_ID]: moduleId,
      [TEST_SOURCE_START]: testSourceLine
    }

    return super.startTestSpan(
      testName,
      testSuite,
      null,
      extraTags
    )
  }
}

module.exports = CucumberPlugin
