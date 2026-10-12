#!/usr/bin/env bash
# Builds Ned and ships it to Azure App Service at https://ned-baby.azurewebsites.net.
#   ./deploy.sh           build and deploy
#   ./deploy.sh --setup   first time only: create the Azure resources and ask for the secrets, then deploy
set -euo pipefail
cd "$(dirname "$0")"

subscription=SUBSCRIPTION_ID # James's personal subscription, so a deploy never lands at work by accident
target=(--subscription "$subscription" --resource-group rg-ned)
app=ned-baby

if [[ ${1:-} == --setup ]]; then
  az group create --subscription "$subscription" --name rg-ned --location eastus --output none
  az appservice plan create "${target[@]}" --name plan-ned --is-linux --sku F1 --output none
  az webapp create "${target[@]}" --plan plan-ned --name $app --runtime DOTNETCORE:10.0 --https-only true --output none
  az webapp config set "${target[@]}" --name $app --startup-file 'dotnet Ned.API.dll' --output none

  read -rsp 'Neon connection string: ' database && echo
  read -rsp 'Password for Natalie: ' natalie && echo
  read -rsp 'Password for James: ' james && echo
  # Neon hands out a postgresql:// URL; Npgsql wants key=value pairs.
  if [[ $database =~ ^postgres(ql)?://([^:]+):([^@]+)@([^/?]+)/([^?]+) ]]; then
    database="Host=${BASH_REMATCH[4]};Database=${BASH_REMATCH[5]};Username=${BASH_REMATCH[2]};Password=${BASH_REMATCH[3]};SSL Mode=Require"
  fi
  az webapp config appsettings set "${target[@]}" --name $app --output none --settings \
    "Tenants__Ned__ConnectionString=$database" \
    "Tenants__Ned__EncryptionKey=$(openssl rand -hex 32)" \
    "Tenants__Ned__AdminPassword=$(openssl rand -hex 16)Aa1!" \
    "Parents__Natalie=$natalie" \
    "Parents__James=$james"
fi

(cd client && npm ci && npm run build)
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
dotnet publish server/Ned.API --configuration Release --output "$out/app"
(cd "$out/app" && zip -qr ../ned.zip .)
az webapp deploy "${target[@]}" --name $app --type zip --src-path "$out/ned.zip"
echo "Deployed to https://$app.azurewebsites.net"
