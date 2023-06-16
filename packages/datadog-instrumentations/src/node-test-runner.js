const { addHook } = require('./helpers/instrument')

addHook({
  name: 'node:test'
}, (pack) => {
  debugger
  return pack
})
