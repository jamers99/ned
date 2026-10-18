#!/usr/bin/env bash
# One-time setup: creates Ned's Azure resources, stores its secrets, lets GitHub Actions deploy main, then deploys.
set -euo pipefail
cd "$(dirname "$0")"
export AZURE_CORE_OUTPUT=none
group=(--resource-group rg-ned)
app=ned-baby

read -rp "Create Ned in $(az account show --query '[name, id]' --output tsv | paste -sd ' ')? [y/N] " answer
[[ $answer == y ]]

az group create --name rg-ned --location eastus
az appservice plan create "${group[@]}" --name plan-ned --is-linux --sku F1
az webapp create "${group[@]}" --plan plan-ned --name $app --runtime DOTNETCORE:10.0 --https-only true
az webapp config set "${group[@]}" --name $app --startup-file 'dotnet Ned.API.dll'

# The secrets live in the app's settings. A bad one makes the server crash at startup, so check them here.
database=
until [[ $database == Host=* ]]; do read -rsp "Neon connection string (the .NET one): " database && echo; done
settings=(
  "Tenants__Ned__ConnectionString=$database"
  "Tenants__Ned__EncryptionKey=$(openssl rand -hex 32)"
  "Tenants__Ned__AdminPassword=$(openssl rand -hex 16)Aa1!"
  # Lets an AI app such as Claude connect over MCP. Changing the secret disconnects connected apps.
  "OAuth__Secret=$(openssl rand -hex 32)"
  "OAuth__PublicOrigin=https://$app.azurewebsites.net"
)
read -rp 'Parent names, separated by spaces: ' -a parents
for parent in "${parents[@]}"; do
  password=
  until [[ ${#password} -ge 8 && $password =~ [A-Z] && $password =~ [a-z] && $password =~ [0-9] && $password =~ [^A-Za-z0-9] ]]; do
    read -rsp "Password for $parent (8+ characters with upper, lower, digit and symbol): " password && echo
  done
  settings+=("Parents__$parent=$password")
done
az webapp config appsettings set "${group[@]}" --name $app --settings "${settings[@]}"

# GitHub Actions deploys main as this identity, signing in with OIDC, so no Azure secret is stored in GitHub.
# GitHub's token names the owner and repo with their IDs, as in repo:owner@123/name@456:ref:refs/heads/main.
az identity create "${group[@]}" --name id-ned-github
az identity federated-credential create "${group[@]}" --identity-name id-ned-github --name main \
  --issuer https://token.actions.githubusercontent.com --audiences api://AzureADTokenExchange \
  --subject "$(gh api 'repos/{owner}/{repo}' --jq '"repo:\(.owner.login)@\(.owner.id)/\(.name)@\(.id):ref:refs/heads/main"')"
az role assignment create --role 'Website Contributor' --assignee-principal-type ServicePrincipal \
  --assignee-object-id "$(az identity show "${group[@]}" --name id-ned-github --query principalId --output tsv)" \
  --scope "$(az webapp show "${group[@]}" --name $app --query id --output tsv)"
gh variable set AZURE_CLIENT_ID --body "$(az identity show "${group[@]}" --name id-ned-github --query clientId --output tsv)"
gh variable set AZURE_TENANT_ID --body "$(az account show --query tenantId --output tsv)"
gh variable set AZURE_SUBSCRIPTION_ID --body "$(az account show --query id --output tsv)"

./deploy.sh
