// app-insights-bicep-plumbed/infra/web.bicep
//
// POSITIVE fixture for `env-var-injection-vs-sdk-import` arch-scan rule.
// Mimics pokeedge-web: connection string plumbed via Key Vault reference,
// but no SDK import in source and no App Service autoinstrumentation
// extension. Rule MUST fire.
//
// Reference: https://learn.microsoft.com/azure/azure-monitor/app/azure-web-apps

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
