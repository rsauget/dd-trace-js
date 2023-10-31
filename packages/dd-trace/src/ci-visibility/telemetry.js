const telemetryMetrics = require('../telemetry/metrics')

const ciVisibilityMetrics = telemetryMetrics.manager.namespace('civisibility')

function remoteEmptyTags (tags) {
  return Object.keys(tags).reduce((acc, tag) => {
    if (tags[tag]) {
      acc[tag] = tags[tag]
    }
    return acc
  }, {})
}

function formatEventTags ({
  type,
  testFramework,
  errorType,
  endpoint,
  command,
  isCodeCoverageEnabled,
  isSuitesSkippingEnabled
}) {
  return remoteEmptyTags({
    event_type: type,
    test_framework: testFramework,
    error_type: errorType,
    endpoint,
    command,
    coverage_enabled: isCodeCoverageEnabled,
    itrskip_enabled: isSuitesSkippingEnabled
  })
}

// eventTags -> metricTags better name?
function incrementMetric (metric, eventTags = {}, value = 1) {
  ciVisibilityMetrics.count(metric, formatEventTags(eventTags)).inc(value)
}

function distributionMetric (metric, eventTags, measure) {
  ciVisibilityMetrics.distribution(metric, formatEventTags(eventTags)).track(measure)
}

module.exports = {
  incrementMetric,
  distributionMetric
}
