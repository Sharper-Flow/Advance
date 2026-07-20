// app-insights-autoinstrumented/infra/web.bicep
//
// NEGATIVE fixture for `env-var-injection-vs-sdk-import` arch-scan rule.
// Same env-var injection as app-insights-bicep-plumbed PLUS a Microsoft
// Azure Monitor autoinstrumentation resource that attaches the agent at
// runtime without an SDK import. Rule MUST NOT fire.
//
// Reference: https://learn.microsoft.com/azure/azure-monitor/app/codeless-overview

param location string = 'eastus'

@description('Plumbed from Key Vault at deploy time.')
param appInsightsConnectionString string = '@Microsoft.KeyVault(SecretUri=https://kv.example.vault.azure.net/secrets/AppInsightsConnectionString)'

resource webApp 'Microsoft.Web/sites@2022-03-01' = {
  name: 'pokeedge-web'
  location: location
  properties: {
    siteConfig: {
      appSettings: [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
      ]
    }
  }
}

// Azure Monitor autoinstrumentation — attaches the Application Insights
// agent to the App Service without an SDK import. Satisfies the rule's
// acceptable-counterpart scope (autoinstrumentation alternative per Rev #8).
resource autoInstrumentation 'Microsoft.AzureMonitor/autoInstrumentation@2021-04-01' = {
  name: 'pokeedge-web-ai'
  location: location
  properties: {
    provisioningState: 'Succeeded'
  }
}
