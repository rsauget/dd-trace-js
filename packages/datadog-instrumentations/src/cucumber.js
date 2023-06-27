'use strict'
const { createCoverageMap } = require('istanbul-lib-coverage')

const { addHook, channel, AsyncResource } = require('./helpers/instrument')
const shimmer = require('../../datadog-shimmer')
const log = require('../../dd-trace/src/log')

const testStartCh = channel('ci:cucumber:test:start')
const testFinishCh = channel('ci:cucumber:test:finish') // used for test steps too

const testStepStartCh = channel('ci:cucumber:test-step:start')

const errorCh = channel('ci:cucumber:error')

const testSuiteStartCh = channel('ci:cucumber:test-suite:start')
const testSuiteFinishCh = channel('ci:cucumber:test-suite:finish')
const testSuiteCodeCoverageCh = channel('ci:cucumber:test-suite:code-coverage')

const itrConfigurationCh = channel('ci:cucumber:itr-configuration')
const skippableSuitesCh = channel('ci:cucumber:test-suite:skippable')
const sessionStartCh = channel('ci:cucumber:session:start')
const sessionFinishCh = channel('ci:cucumber:session:finish')

const finishWorkerCh = channel('ci:cucumber:worker:finish')

const {
  getCoveredFilenamesFromCoverage,
  resetCoverage,
  mergeCoverage,
  fromCoverageMapToCoverage,
  getTestSuitePath
} = require('../../dd-trace/src/plugins/util/test')

const asyncResourceByTestSuite = {}

// I need to store async resources by test suite path: there can't be a concept of "active test suite span" since
// there will be workers running multiple suites at the same time

// We'll preserve the original coverage here
const originalCoverageMap = createCoverageMap()

// TODO: remove in a later major version
const patched = new WeakSet()

let pickleByFile = {}
const pickleResultByFile = {}

function getSuiteStatusFromTestStatuses (testStatuses) {
  if (testStatuses.some(status => status === 'fail')) {
    return 'fail'
  }
  if (testStatuses.every(status => status === 'skip')) {
    return 'skip'
  }
  return 'pass'
}

function getStatusFromResult (result) {
  if (result.status === 1) {
    return { status: 'pass' }
  }
  if (result.status === 2) {
    return { status: 'skip' }
  }
  if (result.status === 4) {
    return { status: 'skip', skipReason: 'not implemented' }
  }
  return { status: 'fail', errorMessage: result.message }
}

function getStatusFromResultLatest (result) {
  if (result.status === 'PASSED') {
    return { status: 'pass' }
  }
  if (result.status === 'SKIPPED' || result.status === 'PENDING') {
    return { status: 'skip' }
  }
  if (result.status === 'UNDEFINED') {
    return { status: 'skip', skipReason: 'not implemented' }
  }
  return { status: 'fail', errorMessage: result.message }
}

function wrapRun (pl, isLatestVersion) {
  if (patched.has(pl)) return

  patched.add(pl)

  shimmer.wrap(pl.prototype, 'run', run => function () {
    if (!testStartCh.hasSubscribers) {
      return run.apply(this, arguments)
    }

    const asyncResource = new AsyncResource('bound-anonymous-fn')
    return asyncResource.runInAsyncScope(() => {
      const testSuiteFullPath = this.pickle.uri

      const testSourceLine = this.gherkinDocument &&
        this.gherkinDocument.feature &&
        this.gherkinDocument.feature.location &&
        this.gherkinDocument.feature.location.line

      testStartCh.publish({
        testName: this.pickle.name,
        fullTestSuite: testSuiteFullPath,
        testSourceLine,
        testSuiteId: testSuites[testSuiteFullPath],
        moduleId,
        sessionId
      })
      try {
        const promise = run.apply(this, arguments)
        promise.finally(() => {
          const result = this.getWorstStepResult()
          const { status, skipReason, errorMessage } = isLatestVersion
            ? getStatusFromResultLatest(result) : getStatusFromResult(result)

          testFinishCh.publish({ status, skipReason, errorMessage })
        })
        return promise
      } catch (err) {
        errorCh.publish(err)
        throw err
      }
    })
  })
  shimmer.wrap(pl.prototype, 'runStep', runStep => function () {
    if (!testStepStartCh.hasSubscribers) {
      return runStep.apply(this, arguments)
    }
    const testStep = arguments[0]
    let resource

    if (isLatestVersion) {
      resource = testStep.text
    } else {
      resource = testStep.isHook ? 'hook' : testStep.pickleStep.text
    }

    const asyncResource = new AsyncResource('bound-anonymous-fn')
    return asyncResource.runInAsyncScope(() => {
      testStepStartCh.publish({ resource })
      try {
        const promise = runStep.apply(this, arguments)

        promise.then((result) => {
          const { status, skipReason, errorMessage } = isLatestVersion
            ? getStatusFromResultLatest(result) : getStatusFromResult(result)

          testFinishCh.publish({ isStep: true, status, skipReason, errorMessage })
        })
        return promise
      } catch (err) {
        errorCh.publish(err)
        throw err
      }
    })
  })
}

function pickleHook (PickleRunner) {
  const pl = PickleRunner.default

  wrapRun(pl, false)

  return PickleRunner
}

function testCaseHook (TestCaseRunner) {
  const pl = TestCaseRunner.default

  wrapRun(pl, true)

  return TestCaseRunner
}

addHook({
  name: '@cucumber/cucumber',
  versions: ['7.0.0 - 7.2.1'],
  file: 'lib/runtime/pickle_runner.js'
}, pickleHook)

addHook({
  name: '@cucumber/cucumber',
  versions: ['>=7.3.0'],
  file: 'lib/runtime/test_case_runner.js'
}, testCaseHook)

function getPicklesToRun (runtime, suitesToSkip) {
  return runtime.pickleIds.filter((pickleId) => {
    const test = runtime.eventDataCollector.getPickle(pickleId)
    return !suitesToSkip.includes(getTestSuitePath(test.uri, process.cwd()))
  }, {})
}

function getPickleByFile (runtime) {
  return runtime.pickleIds.reduce((acc, pickleId) => {
    const test = runtime.eventDataCollector.getPickle(pickleId)
    if (acc[test.uri]) {
      acc[test.uri].push(test)
    } else {
      acc[test.uri] = [test]
    }
    return acc
  }, {})
}

// for the worker
let testSuites = {}
let moduleId, sessionId

addHook({
  name: '@cucumber/cucumber',
  versions: ['>=7.0.0'],
  file: 'lib/runtime/parallel/worker.js'
}, workerPackage => {
  shimmer.wrap(workerPackage.default.prototype, 'finalize', finalize => async function () {
    let onFlushed
    const promise = new Promise(resolve => {
      onFlushed = resolve
    })
    finishWorkerCh.publish({ onFlushed })

    await promise
    return finalize.apply(this, arguments)
  })

  shimmer.wrap(workerPackage.default.prototype, 'receiveMessage', receiveMessage => async function (message) {
    const { ddCustom } = message
    // we always update the ids
    if (ddCustom) {
      testSuites = ddCustom.testSuiteIdByTestPath
      moduleId = ddCustom.moduleId
      sessionId = ddCustom.sessionId
    }

    return receiveMessage.apply(this, arguments)
  })

  return workerPackage
})

const testSuiteIdByTestPath = {}

addHook({
  name: '@cucumber/cucumber',
  versions: ['>=7.0.0'],
  file: 'lib/runtime/parallel/coordinator.js'
}, (coordinatorPackage) => {
  shimmer.wrap(coordinatorPackage.default.prototype, 'run', run => async function () {
    pickleByFile = getPickleByFile(this)
    return run.apply(this, arguments)
  })

  shimmer.wrap(coordinatorPackage.default.prototype, 'giveWork', giveWork => function (worker) {
    // we need to pass this to every worker, all the time
    const oldWorkerSend = worker.process.send

    // this changes by version!!!

    if (this.nextPickleIdIndex === this.pickleIds.length) {
      return giveWork.apply(this, arguments)
    }

    const pickleId = this.pickleIds[this.nextPickleIdIndex]
    const test = this.eventDataCollector.getPickle(pickleId)

    const testSuiteFullPath = test.uri

    let testSuiteId
    function setId (id) {
      testSuiteId = id
    }

    // we need to attach the ids always
    worker.process.send = function (command) {
      if (command.run) {
        // we always attach the ids info
        command.ddCustom = { testSuiteIdByTestPath, sessionId, moduleId }
      }

      return oldWorkerSend.apply(this, arguments)
    }

    if (!pickleResultByFile[testSuiteFullPath] && !testSuiteIdByTestPath[testSuiteFullPath]) {
      const asyncResource = new AsyncResource('bound-anonymous-fn')

      asyncResourceByTestSuite[testSuiteFullPath] = asyncResource

      asyncResource.runInAsyncScope(() => {
        testSuiteStartCh.publish({ testSuiteFullPath, setId })
      })

      testSuiteIdByTestPath[testSuiteFullPath] = testSuiteId
    }

    return giveWork.apply(this, arguments)
  })

  shimmer.wrap(coordinatorPackage.default.prototype, 'parseWorkerMessage', parseWorkerMessage => function (worker, message) {
    if (message.jsonEnvelope) {
      const envelope = JSON.parse(message.jsonEnvelope)
      if (envelope.testCaseFinished) {
        const { testCaseStartedId } = envelope.testCaseFinished
        const { testCaseId } = this.eventDataCollector.testCaseAttemptDataMap[testCaseStartedId]
        const { pickleId } = this.eventDataCollector.testCaseMap[testCaseId]
        const test = this.eventDataCollector.getPickle(pickleId)

        const testSuiteFullPath = test.uri

        // TODO: how to get test status?? We used this.getWorstResult() but here we have no PickleRunner
        if (!pickleResultByFile[testSuiteFullPath]) {
          pickleResultByFile[testSuiteFullPath] = ['pass']
        } else {
          pickleResultByFile[testSuiteFullPath].push('pass')
        }

        if (pickleResultByFile[testSuiteFullPath].length === pickleByFile[testSuiteFullPath].length) {
          const asyncResource = asyncResourceByTestSuite[testSuiteFullPath]
          asyncResource.runInAsyncScope(() => {
            const testSuiteStatus = getSuiteStatusFromTestStatuses(pickleResultByFile[testSuiteFullPath])
            testSuiteFinishCh.publish(testSuiteStatus)
          })
        }
      }
    }

    return parseWorkerMessage.apply(this, arguments)
  })

  return coordinatorPackage
})

// TODO: change instrumentation based on this
let isParallel

addHook({
  name: '@cucumber/cucumber',
  versions: ['>=7.0.0'],
  file: 'lib/cli/index.js'
}, (cliPackage, cucumberVersion) => {
  shimmer.wrap(cliPackage.default.prototype, 'run', run => async function () {
    const asyncResource = new AsyncResource('bound-anonymous-fn')

    const config = await this.getConfiguration()
    isParallel = config.parallel > 1

    // do config and ITR calls here

    const processArgv = process.argv.slice(2).join(' ')
    const command = process.env.npm_lifecycle_script || `cucumber-js ${processArgv}`

    function setIds (ids) {
      sessionId = ids.sessionId
      moduleId = ids.moduleId
    }

    asyncResource.runInAsyncScope(() => {
      sessionStartCh.publish({ command, frameworkVersion: cucumberVersion, setIds })
    })
    const result = await run.apply(this, arguments)

    asyncResource.runInAsyncScope(() => {
      sessionFinishCh.publish({
        status: result.success ? 'pass' : 'fail'
      })
    })

    return result
  })
  return cliPackage
})

addHook({
  name: '@cucumber/cucumber',
  versions: ['>=7.0.0'],
  file: 'lib/runtime/index.js'
}, (runtimePackage, cucumberVersion) => {
  shimmer.wrap(runtimePackage.default.prototype, 'start', start => async function () {
    const asyncResource = new AsyncResource('bound-anonymous-fn')
    let onDone

    // this calls need to happen at lib/cli/index
    const configPromise = new Promise(resolve => {
      onDone = resolve
    })

    asyncResource.runInAsyncScope(() => {
      itrConfigurationCh.publish({ onDone })
    })

    await configPromise

    const skippableSuitesPromise = new Promise(resolve => {
      onDone = resolve
    })

    asyncResource.runInAsyncScope(() => {
      skippableSuitesCh.publish({ onDone })
    })

    const { err, skippableSuites } = await skippableSuitesPromise

    if (!err) {
      this.pickleIds = getPicklesToRun(this, skippableSuites)
    }

    pickleByFile = getPickleByFile(this)

    const processArgv = process.argv.slice(2).join(' ')
    const command = process.env.npm_lifecycle_script || `cucumber-js ${processArgv}`

    asyncResource.runInAsyncScope(() => {
      sessionStartCh.publish({ command, frameworkVersion: cucumberVersion })
    })
    const success = await start.apply(this, arguments)

    let testCodeCoverageLinesTotal

    if (global.__coverage__) {
      try {
        testCodeCoverageLinesTotal = originalCoverageMap.getCoverageSummary().lines.pct
      } catch (e) {
        // ignore errors
      }
      // restore the original coverage
      global.__coverage__ = fromCoverageMapToCoverage(originalCoverageMap)
    }

    asyncResource.runInAsyncScope(() => {
      sessionFinishCh.publish({
        status: success ? 'pass' : 'fail',
        isSuitesSkipped: skippableSuites ? !!skippableSuites.length : false,
        testCodeCoverageLinesTotal
      })
    })
    return success
  })

  return runtimePackage
})
