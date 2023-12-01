'use strict'

const log = require('../log')
const blockedTemplates = require('./blocked_templates')

const detectedSpecificEndpoints = {}

let templateHtml = blockedTemplates.html
let templateJson = blockedTemplates.json
let templateGraphqlJson = blockedTemplates.graphqlJson
let blockingConfiguration

const specificBlockingTypes = {
  GRAPHQL: 'graphql'
}

function getSpecificKey (method, url) {
  return `${method}+${url}`
}

function addSpecificEndpoint (method, url, type) {
  detectedSpecificEndpoints[getSpecificKey(method, url)] = type
}

function getBlockWithRedirectData (rootSpan) {
  let statusCode = blockingConfiguration.parameters.status_code
  if (!statusCode || statusCode < 300 || statusCode >= 400) {
    statusCode = 303
  }
  const headers = {
    'Location': blockingConfiguration.parameters.location
  }

  rootSpan.addTags({
    'appsec.blocked': 'true'
  })

  return { headers, statusCode }
}

function blockWithRedirect (res, rootSpan, abortController) {
  let statusCode = blockingConfiguration.parameters.status_code
  if (!statusCode || statusCode < 300 || statusCode >= 400) {
    statusCode = 303
  }

  res.writeHead(statusCode, {
    'Location': blockingConfiguration.parameters.location
  }).end()

  if (abortController) {
    abortController.abort()
  }
}

function getSpecificBlockingData (type) {
  switch (type) {
    case specificBlockingTypes.GRAPHQL:
      return {
        type: 'application/json',
        body: templateGraphqlJson
      }
  }
}

function getBlockWithContentData (req, specificType, rootSpan) {
  let type
  let body
  let statusCode

  const specificBlockingType = specificType || detectedSpecificEndpoints[getSpecificKey(req.method, req.url)]
  if (specificBlockingType) {
    const specificBlockingContent = getSpecificBlockingData(specificBlockingType)
    type = specificBlockingContent?.type
    body = specificBlockingContent?.body
  }

  if (!type) {
    // parse the Accept header, ex: Accept: text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8
    const accept = req.headers.accept && req.headers.accept.split(',').map((str) => str.split(';', 1)[0].trim())

    if (!blockingConfiguration || blockingConfiguration.parameters.type === 'auto') {
      if (accept && accept.includes('text/html') && !accept.includes('application/json')) {
        type = 'text/html; charset=utf-8'
        body = templateHtml
      } else {
        type = 'application/json'
        body = templateJson
      }
    } else {
      if (blockingConfiguration.parameters.type === 'html') {
        type = 'text/html; charset=utf-8'
        body = templateHtml
      } else {
        type = 'application/json'
        body = templateJson
      }
    }
  }

  if (blockingConfiguration && blockingConfiguration.type === 'block_request' &&
    blockingConfiguration.parameters.status_code) {
    statusCode = blockingConfiguration.parameters.status_code
  } else {
    statusCode = 403
  }

  const headers = {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body)
  }

  rootSpan.addTags({
    'appsec.blocked': 'true'
  })

  return { body, statusCode, headers }
}

function blockWithContent (req, res, rootSpan, abortController, type) {
  const { body, headers, statusCode } = getBlockWithContentData(req, type, rootSpan)

  res.statusCode = statusCode
  for (const [headerName, headerValue] of Object.entries(headers)) {
    res.setHeader(headerName, headerValue)
  }
  res.end(body)

  if (abortController) {
    abortController.abort()
  }
}

function block (req, res, rootSpan, abortController, type) {
  if (res.headersSent) {
    log.warn('Cannot send blocking response when headers have already been sent')
    return
  }

  if (blockingConfiguration && blockingConfiguration.type === 'redirect_request' &&
      blockingConfiguration.parameters.location) {
    blockWithRedirect(res, rootSpan, abortController)
  } else {
    blockWithContent(req, res, rootSpan, abortController, type)
  }
}

function getBlockingData (req, specificType, rootSpan) {
  if (blockingConfiguration && blockingConfiguration.type === 'redirect_request' &&
    blockingConfiguration.parameters.location) {
    return getBlockWithRedirectData(rootSpan)
  } else {
    return getBlockWithContentData(req, specificType, rootSpan)
  }
}

function setTemplates (config) {
  if (config.appsec.blockedTemplateHtml) {
    templateHtml = config.appsec.blockedTemplateHtml
  } else {
    templateHtml = blockedTemplates.html
  }

  if (config.appsec.blockedTemplateJson) {
    templateJson = config.appsec.blockedTemplateJson
  } else {
    templateGraphqlJson = blockedTemplates.json
  }

  if (config.appsec.blockedTemplateGraphql) {
    templateGraphqlJson = config.appsec.blockedTemplateGraphql
  } else {
    templateGraphqlJson = blockedTemplates.graphqlJson
  }
}

function updateBlockingConfiguration (newBlockingConfiguration) {
  blockingConfiguration = newBlockingConfiguration
}

module.exports = {
  addSpecificEndpoint,
  block,
  specificBlockingTypes,
  getBlockingData,
  setTemplates,
  updateBlockingConfiguration
}
