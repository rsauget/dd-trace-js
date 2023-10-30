const telemetryMetrics = require('../telemetry/metrics')

const ciVisibilityMetrics = telemetryMetrics.manager.namespace('civisibility')

function remoteEmptyTags (tags) {
  Object.keys(tags).reduce((acc, tag) => {
    if (tags[tag]) {
      acc[tag] = tags[tag]
    }
    return acc
  }, {})
}

function formatEventTags ({ type, testFramework, errorType }) {
  return remoteEmptyTags({
    event_type: type,
    test_framework: testFramework,
    error_type: errorType
  })
}

function incrementMetric (metric, eventTags) {
  ciVisibilityMetrics.count(metric, formatEventTags(eventTags)).inc()
}

module.exports = {
  incrementMetric
}
