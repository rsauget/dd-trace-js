const CiPlugin = require('../../dd-trace/src/plugins/ci_plugin')
const { storage } = require('../../datadog-core')

const {
  TEST_STATUS,
  JEST_TEST_RUNNER,
  finishAllTraceSpans,
  getTestSuiteCommonTags,
  addIntelligentTestRunnerSpanTags,
  TEST_PARAMETERS,
  TEST_COMMAND,
  TEST_FRAMEWORK_VERSION,
  TEST_SOURCE_START,
  getTestParentSpan,
  getTestCommonTags,
  getCodeOwnersForFilename,
  TEST_SESSION_ID,
  TEST_MODULE,
  TEST_MODULE_ID,
  TEST_SUITE_ID,
  TEST_CODE_OWNERS,
  CI_APP_ORIGIN
} = require('../../dd-trace/src/plugins/util/test')
const { COMPONENT } = require('../../dd-trace/src/constants')
const id = require('../../dd-trace/src/id')

const isJestWorker = !!process.env.JEST_WORKER_ID

function getIsTestSessionTrace (trace) {
  return trace.some(span =>
    span.type === 'test_session_end' || span.type === 'test_suite_end' || span.type === 'test_module_end'
  )
}


// https://github.com/facebook/jest/blob/d6ad15b0f88a05816c2fe034dd6900d28315d570/packages/jest-worker/src/types.ts#L38
const CHILD_MESSAGE_END = 2

class JestPlugin extends CiPlugin {
  static get id () {
    return 'jest'
  }

  constructor (...args) {
    super(...args)

    if (isJestWorker) {
      // Used to handle the end of a jest worker to be able to flush
      const handler = ([message]) => {
        if (message === CHILD_MESSAGE_END) {
          // testSuiteSpan is not defined for older versions of jest, where jest-jasmine2 is still used
          if (this.testSuiteSpan) {
            this.testSuiteSpan.finish()
            finishAllTraceSpans(this.testSuiteSpan)
          }
          this.tracer._exporter.flush()
          process.removeListener('message', handler)
        }
      }
      process.on('message', handler)
    }

    this.addSub('ci:jest:session:finish', ({
      status,
      isSuitesSkipped,
      isSuitesSkippingEnabled,
      isCodeCoverageEnabled,
      testCodeCoverageLinesTotal
    }) => {
      this.testSessionSpan.setTag(TEST_STATUS, status)
      this.testModuleSpan.setTag(TEST_STATUS, status)

      addIntelligentTestRunnerSpanTags(
        this.testSessionSpan,
        this.testModuleSpan,
        { isSuitesSkipped, isSuitesSkippingEnabled, isCodeCoverageEnabled, testCodeCoverageLinesTotal }
      )

      this.testModuleSpan.finish()
      this.testSessionSpan.finish()
      finishAllTraceSpans(this.testSessionSpan)
      this.tracer._exporter.flush()
    })


    this.addSub('ci:jest:test-suite:start', ({ testSuite, frameworkVersion }) => {
      let childOf
      let testCommand = 'yarn test' // fix this
      if (isJestWorker) {
        // the module/session info will be added at the parent process
        childOf = getTestParentSpan(this.tracer)
      } else {
        childOf = this.testModuleSpan // everything is run in the same process
      }

      const testSuiteMetadata = getTestSuiteCommonTags(testCommand, frameworkVersion, testSuite, 'jest')

      this.testSuiteSpan = this.tracer.startSpan('jest.test_suite', {
        childOf,
        tags: {
          [COMPONENT]: this.constructor.id,
          ...this.testEnvironmentMetadata,
          ...testSuiteMetadata
        }
      })
    })

    this.addSub('ci:jest:worker-report:trace', traces => {
      const formattedTraces = JSON.parse(traces).map(trace => {
        if (getIsTestSessionTrace(trace)) {
          return trace.map(span => ({
            ...span,
            span_id: id(span.span_id),
            trace_id: this.testSessionSpan.context()._traceId,
            parent_id: this.testModuleSpan.context()._spanId
          }))
        }
        return trace.map(span => ({
          ...span,
          span_id: id(span.span_id),
          trace_id: id(span.trace_id),
          parent_id: id(span.parent_id),
          meta: {
            ...span.meta,
            [TEST_SESSION_ID]: this.testSessionSpan.context().toTraceId(),
            [TEST_MODULE_ID]: this.testModuleSpan.context().toSpanId(),
            [TEST_COMMAND]: 'yarn test' // TODO fix
          }
        }))
      })

      formattedTraces.forEach(trace => {
        this.tracer._exporter.export(trace)
      })
    })

    this.addSub('ci:jest:worker-report:coverage', data => {
      // TODO: this will need new formatting
      const formattedCoverages = JSON.parse(data).map(coverage => ({
        sessionId: id(coverage.sessionId),
        suiteId: id(coverage.suiteId),
        files: coverage.files
      }))
      formattedCoverages.forEach(formattedCoverage => {
        this.tracer._exporter.exportCoverage(formattedCoverage)
      })
    })

    this.addSub('ci:jest:test-suite:finish', ({ status, errorMessage }) => {
      this.testSuiteSpan.setTag(TEST_STATUS, status)
      if (errorMessage) {
        this.testSuiteSpan.setTag('error', new Error(errorMessage))
      }
      this.testSuiteSpan.finish()
      // Flushing within jest workers is cheap, as it's just interprocess communication
      // We do not want to flush after every suite if jest is running tests serially,
      // as every flush is an HTTP request.
      if (isJestWorker) {
        // Suites potentially run in a different process than the session,
        // so calling finishAllTraceSpans on the session span is not enough
        finishAllTraceSpans(this.testSuiteSpan)
        this.tracer._exporter.flush()
      }
    })

    /**
     * This can't use `this.itrConfig` like `ci:mocha:test-suite:code-coverage`
     * because this subscription happens in a different process from the one
     * fetching the ITR config.
     */
    this.addSub('ci:jest:test-suite:code-coverage', (coverageFiles) => {
      const { _traceId, _spanId } = this.testSuiteSpan.context()
      const formattedCoverage = {
        sessionId: _traceId,
        suiteId: _spanId,
        files: coverageFiles
      }
      // TODO: change this too
      this.tracer._exporter.exportCoverage(formattedCoverage)
    })

    this.addSub('ci:jest:test:start', (test) => {
      const store = storage.getStore()
      const span = this.startTestSpan(test)

      this.enter(span, store)
    })

    this.addSub('ci:jest:test:finish', (status) => {
      const span = storage.getStore().span
      span.setTag(TEST_STATUS, status)
      span.finish()
      finishAllTraceSpans(span)
    })

    this.addSub('ci:jest:test:err', (error) => {
      if (error) {
        const store = storage.getStore()
        if (store && store.span) {
          const span = store.span
          span.setTag(TEST_STATUS, 'fail')
          span.setTag('error', error)
        }
      }
    })

    this.addSub('ci:jest:test:skip', (test) => {
      const span = this.startTestSpan(test)
      span.setTag(TEST_STATUS, 'skip')
      span.finish()
    })
  }

  startTestSpan (test) {
    const { suite, name, runner, testParameters, frameworkVersion, testStartLine } = test

    const extraTags = {
      [JEST_TEST_RUNNER]: runner,
      [TEST_PARAMETERS]: testParameters,
      [TEST_FRAMEWORK_VERSION]: frameworkVersion,
      [TEST_SOURCE_START]: testStartLine,
      [TEST_SUITE_ID]: this.testSuiteSpan.context().toSpanId()
    }

    const childOf = getTestParentSpan(this.tracer)

    let testTags = {
      ...getTestCommonTags(
        name,
        suite,
        this.frameworkVersion,
        this.constructor.id
      ),
      [COMPONENT]: this.constructor.id,
      [TEST_MODULE]: this.constructor.id,
      ...extraTags
    }

    const codeOwners = getCodeOwnersForFilename(suite, this.codeOwnersEntries)
    if (codeOwners) {
      testTags[TEST_CODE_OWNERS] = codeOwners
    }

    childOf._trace.startTime = this.testSuiteSpan.context()._trace.startTime
    childOf._trace.ticks = this.testSuiteSpan.context()._trace.ticks

    if (this.testModuleSpan) {
      testTags[TEST_MODULE_ID] = this.testModuleSpan.context()._parentId.toString(10)
      testTags[TEST_SESSION_ID] = this.testSessionSpan.context().toTraceId()
      testTags[TEST_COMMAND] = 'yarn test'
    }

    // we need a custom handler because session ids will not be added now
    const testSpan = this.tracer
      .startSpan(`${this.constructor.id}.test`, {
        childOf,
        tags: {
          ...this.testEnvironmentMetadata,
          ...testTags
        }
      })

    testSpan.context()._trace.origin = CI_APP_ORIGIN

    return testSpan
  }
}

module.exports = JestPlugin
