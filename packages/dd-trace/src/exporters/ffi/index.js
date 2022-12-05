/* eslint-disable */
'use strict'

const ffi = require('ffi-napi')

class FFIExporter {
  constructor () {
    try {
      this.libTraceFlusher = ffi.Library('./node_modules/dd-trace/packages/dd-trace/src/exporters/ffi/libtrace_flusher.dylib', {
        'send_trace': ['void', ['string']]
      })
    } catch (e) {
      console.log(e)
    }
  }

  export (spans) {
    for (const span of spans) {
      span.trace_id = parseInt(span.trace_id, 16)
      span.parent_id = parseInt(span.parent_id, 16)
      span.span_id = parseInt(span.span_id, 16)
    }

    console.log(spans[0])
    console.log("SENDING PAYLOAD")
    const payload = JSON.stringify(spans)
    console.log(payload)

    this.libTraceFlusher.send_trace(payload)
  }
}

module.exports = FFIExporter
