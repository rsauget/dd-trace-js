'use strict'

const log = require('./log')

class AzureAppServices {
  constructor () {
    this.metadata = setAzureAppServiceMetadata()
  }
}

function setAzureAppServiceMetadata () {
  const SITE_NAME = process.env.WEBSITE_SITE_NAME
  const SUBSCRIPTION_ID = parseAzureSubscriptionID(process.env.WEBSITE_OWNER_NAME)
  const RESOURCE_GROUP = process.env.WEBSITE_RESOURCE_GROUP
  const RESOURCE_ID = compileAzureResourceID(SUBSCRIPTION_ID, RESOURCE_GROUP, SITE_NAME)

  return {
    siteKind: 'app',
    siteType: 'app',
    siteName: SITE_NAME,
    resourceGroup: RESOURCE_GROUP,
    subscriptionID: SUBSCRIPTION_ID,
    resourceID: RESOURCE_ID,
    instanceID: process.env.WEBSITE_INSTANCE_ID || 'unknown',
    instanceName: process.env.COMPUTERNAME || 'unknown',
    os: process.env.WEBSITE_OS || 'unknown',
    runtime: 'node.js'
  }
}

function parseAzureSubscriptionID (subID) {
  if (subID !== undefined) {
    return subID.split('+')[0]
  } else {
    log.info('Could not parse the Azure App Service Subscription ID')
  }
}

function compileAzureResourceID (subID, resourceGroup, siteName) {
  if (subID !== undefined && resourceGroup !== undefined && siteName !== undefined) {
    return `/subscriptions/${subID}/resourcegroups/${resourceGroup}/providers/microsoft.web/sites/${siteName}`
  } else {
    log.info('Could not generate the Azure App Service Resource ID')
  }
}

module.exports = AzureAppServices
