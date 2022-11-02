'use strict'

const AzureAppServices = require('../src/azure_app_services')

describe('AzureAppServices', () => {
  let aas

  before(() => {
    process.env = {
      COMPUTERNAME: 'test-instance',
      WEBSITE_INSTANCE_ID: '1234abcd',
      WEBSITE_OS: 'linux',
      WEBSITE_OWNER_NAME: '8c500027-5f00-400e-8f00-60000000000f+apm-dotnet-EastUSwebspace',
      WEBSITE_RESOURCE_GROUP: 'test-resource-group',
      WEBSITE_SITE_NAME: 'site-name-test'
    }
  })

  it('sets the metadata properly', () => {
    aas = new AzureAppServices({})

    // resourceID is too long for the linter.
    const resourcePartA = `/subscriptions/8c500027-5f00-400e-8f00-60000000000f/resourcegroups/`
    const resourcePartB = `test-resource-group/providers/microsoft.web/sites/site-name-test`
    expect(aas.metadata.siteKind).to.equal('app')
    expect(aas.metadata.siteType).to.equal('app')
    expect(aas.metadata.siteName).to.equal('site-name-test')
    expect(aas.metadata.resourceGroup).to.equal('test-resource-group')
    expect(aas.metadata.subscriptionID).to.equal('8c500027-5f00-400e-8f00-60000000000f')
    expect(aas.metadata.resourceID).to.equal(resourcePartA + resourcePartB)
    expect(aas.metadata.instanceID).to.equal('1234abcd')
    expect(aas.metadata.instanceName).to.equal('test-instance')
    expect(aas.metadata.os).to.equal('linux')
    expect(aas.metadata.runtime).to.equal('node.js')
  })
})
