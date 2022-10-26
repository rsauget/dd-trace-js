'use strict'

const fs = require('fs')
const { execSync } = require('node:child_process');
const log = require('../../log')

const TRACE_PREFIX = '['
const TRACE_SUFFIX = ']\n'
const TRACE_FORMAT_OVERHEAD = TRACE_PREFIX.length + TRACE_SUFFIX.length
const MAX_SIZE = 64 * 1024 // 64kb

class BinaryExporter {

  constructor () {
    try {
      if(!fs.existsSync('/tmp/_datadog')) {
        fs.mkdirSync('/tmp/_datadog');
      }
      if(!fs.existsSync('/tmp/_datadog/traces')) {
        fs.mkdirSync('/tmp/_datadog/traces');
      }
    } catch (e) {
      console.error(e);
    }
  }

  export (spans) {
    log.debug(() => 'Adding trace to queue')

    let size = TRACE_FORMAT_OVERHEAD
    let queue = []

    for (const span of spans) {
      span.trace_id = parseInt(span.trace_id, 16)
      span.parent_id = parseInt(span.parent_id, 16)
      span.span_id = parseInt(span.span_id, 16)

      const spanStr = JSON.stringify(span)
      if (spanStr.length + TRACE_FORMAT_OVERHEAD > MAX_SIZE) {
        log.debug('Span too large to send to logs, dropping')
        continue
      }
      if (spanStr.length + size > MAX_SIZE) {
        this._printSpans(queue)
        queue = []
        size = TRACE_FORMAT_OVERHEAD
      }
      size += spanStr.length + 1 // includes length of ',' character
      queue.push(spanStr)
    }
    if (queue.length > 0) {
      this._mergeQueue(queue)
    }
  }

  _mergeQueue (queue) {
    let logLine = TRACE_PREFIX
    let firstTrace = true
    for (const spanStr of queue) {
      if (firstTrace) {
        firstTrace = false
        logLine += spanStr
      } else {
        logLine += ',' + spanStr
      }
    }
    logLine += TRACE_SUFFIX
    this._callBinary(logLine)
    //this._writetoTmp(logLine)
  }

  _callBinary (str) {
    try {
      console.log('before calling the binary time is = ' + Date.now());
      // /Users/maxime.david/dd/trace-flusher/target/release/trace_flusher
      const stdout = execSync(`${process.env.BINARY_PATH} '${str}'`);
      console.log('stdout: ' + stdout);
    } catch (err) {
      console.error('error while calling the binary -> ' + err.toString());
    }
  }

  _writetoTmp (str) {
    try {
      fs.writeFileSync(`/tmp/_datadog/traces/${(performance.now() + performance.timeOrigin)}`, str);
      log.debug(() => 'File writen to /tmp');
    } catch (err) {
      console.error(err);
    }
  }
}

module.exports = BinaryExporter