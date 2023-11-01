const telemetryMetrics = require('../telemetry/metrics')

const ciVisibilityMetrics = telemetryMetrics.manager.namespace('civisibility')

function remoteEmptyTags (tags) {
  return Object.keys(tags).reduce((acc, tag) => {
    if (tags[tag] !== undefined && tags[tag] !== null) {
      acc[tag] = tags[tag]
    }
    return acc
  }, {})
}

function formatMetricTags ({
  testLevel,
  testFramework,
  errorType,
  endpoint,
  command,
  isCodeCoverageEnabled,
  isSuitesSkippingEnabled,
  hasCodeOwners,
  isUnsupportedCIProvider,
  exitCode
}) {
  return remoteEmptyTags({
    event_type: testLevel,
    test_framework: testFramework,
    error_type: errorType,
    endpoint,
    command,
    coverage_enabled: isCodeCoverageEnabled,
    itrskip_enabled: isSuitesSkippingEnabled,
    has_code_owners: hasCodeOwners,
    is_unsupported_ci: isUnsupportedCIProvider,
    exit_code: exitCode
  })
}

function incrementCountMetric (name, tags = {}, value = 1) {
  ciVisibilityMetrics.count(name, formatMetricTags(tags)).inc(value)
}

function distributionMetric (name, tags, measure) {
  ciVisibilityMetrics.distribution(name, formatMetricTags(tags)).track(measure)
}

// CI Visibility telemetry events
const TELEMETRY_EVENT_CREATED = 'event_created'
const TELEMETRY_EVENT_FINISHED = 'event_finished'
const TELEMETRY_ITR_SKIPPED = 'itr_skipped'
const TELEMETRY_ITR_UNSKIPPABLE = 'itr_unskippable'
const TELEMETRY_ITR_FORCED_TO_RUN = 'itr_forced_run'
const TELEMETRY_CODE_COVERAGE_EMPTY = 'code_coverage.is_empty'
const TELEMETRY_EVENTS_ENQUEUED_FOR_SERIALIZATION = 'events_enqueued_for_serialization'
const TELEMETRY_ENDPOINT_PAYLOAD_REQUESTS = 'endpoint_payload.requests'
const TELEMETRY_ENDPOINT_PAYLOAD_BYTES = 'endpoint_payload.bytes'
const TELEMETRY_ENDPOINT_PAYLOAD_REQUESTS_MS = 'endpoint_payload.requests_ms'
const TELEMETRY_ENDPOINT_PAYLOAD_REQUESTS_ERRORS = 'endpoint_payload.requests_errors'
const TELEMETRY_GIT_COMMAND = 'git.command'
const TELEMETRY_GIT_COMMAND_MS = 'git.command_ms'
const TELEMETRY_GIT_COMMAND_ERRORS = 'git.command_errors'
const TELEMETRY_GIT_REQUESTS_SEARCH_COMMITS = 'git_requests.search_commits'
const TELEMETRY_GIT_REQUESTS_SEARCH_COMMITS_MS = 'git_requests.search_commits_ms'
const TELEMETRY_GIT_REQUESTS_SEARCH_COMMITS_ERRORS = 'git_requests.search_commits_errors'
const TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES = 'git_requests.objects_pack'
const TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES_MS = 'git_requests.objects_pack_ms'
const TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES_ERRORS = 'git_requests.objects_pack_errors'
const TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES_NUM = 'git_requests.objects_pack_files'
const TELEMETRY_GIT_REQUESTS_SETTINGS = 'git_requests.settings'
const TELEMETRY_GIT_REQUESTS_SETTINGS_MS = 'git_requests.settings_ms'
const TELEMETRY_GIT_REQUESTS_SETTINGS_ERRORS = 'git_requests.settings_errors'
const TELEMETRY_GIT_REQUESTS_SETTINGS_RESPONSE = 'git_requests.settings_response'
const TELEMETRY_ITR_SKIPPABLE_TESTS = 'itr_skippable_tests.request'
const TELEMETRY_ITR_SKIPPABLE_TESTS_MS = 'itr_skippable_tests.request_ms'
const TELEMETRY_ITR_SKIPPABLE_TESTS_ERRORS = 'itr_skippable_tests.request_errors'
const TELEMETRY_ITR_SKIPPABLE_TESTS_RESPONSE_SUITES = 'itr_skippable_tests.response_suites'
const TELEMETRY_ITR_SKIPPABLE_TESTS_RESPONSE_TESTS = 'itr_skippable_tests.response_tests'
const TELEMETRY_ITR_SKIPPABLE_TESTS_RESPONSE_BYTES = 'itr_skippable_tests.response_bytes'

module.exports = {
  incrementCountMetric,
  distributionMetric,
  TELEMETRY_EVENT_CREATED,
  TELEMETRY_EVENT_FINISHED,
  TELEMETRY_ITR_SKIPPED,
  TELEMETRY_ITR_UNSKIPPABLE,
  TELEMETRY_ITR_FORCED_TO_RUN,
  TELEMETRY_CODE_COVERAGE_EMPTY,
  TELEMETRY_EVENTS_ENQUEUED_FOR_SERIALIZATION,
  TELEMETRY_ENDPOINT_PAYLOAD_REQUESTS,
  TELEMETRY_ENDPOINT_PAYLOAD_BYTES,
  TELEMETRY_ENDPOINT_PAYLOAD_REQUESTS_MS,
  TELEMETRY_ENDPOINT_PAYLOAD_REQUESTS_ERRORS,
  TELEMETRY_GIT_COMMAND,
  TELEMETRY_GIT_COMMAND_MS,
  TELEMETRY_GIT_COMMAND_ERRORS,
  TELEMETRY_GIT_REQUESTS_SEARCH_COMMITS,
  TELEMETRY_GIT_REQUESTS_SEARCH_COMMITS_MS,
  TELEMETRY_GIT_REQUESTS_SEARCH_COMMITS_ERRORS,
  TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES_NUM,
  TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES,
  TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES_MS,
  TELEMETRY_GIT_REQUESTS_OBJECT_PACKFILES_ERRORS,
  TELEMETRY_GIT_REQUESTS_SETTINGS,
  TELEMETRY_GIT_REQUESTS_SETTINGS_MS,
  TELEMETRY_GIT_REQUESTS_SETTINGS_ERRORS,
  TELEMETRY_GIT_REQUESTS_SETTINGS_RESPONSE,
  TELEMETRY_ITR_SKIPPABLE_TESTS,
  TELEMETRY_ITR_SKIPPABLE_TESTS_MS,
  TELEMETRY_ITR_SKIPPABLE_TESTS_ERRORS,
  TELEMETRY_ITR_SKIPPABLE_TESTS_RESPONSE_SUITES,
  TELEMETRY_ITR_SKIPPABLE_TESTS_RESPONSE_TESTS,
  TELEMETRY_ITR_SKIPPABLE_TESTS_RESPONSE_BYTES
}
