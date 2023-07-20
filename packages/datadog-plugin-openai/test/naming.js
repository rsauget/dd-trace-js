const { resolveNaming } = require('../../dd-trace/test/plugins/helpers')

const schema = {
  opName: 'openai.request',
  serviceName: 'test'
}

const rawExpectedSchema = {
  client: {
    v0: schema,
    v1: schema
  }
}

module.exports = {
  rawExpectedSchema,
  expectedSchema: resolveNaming(rawExpectedSchema)
}
