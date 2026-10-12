#!/usr/bin/env bash
# Builds Ned and ships it to Azure App Service at https://ned-baby.azurewebsites.net.
#   ./deploy.sh           build and deploy
#   ./deploy.sh --setup   first time only: create the Azure resources and ask for the secrets, then deploy
set -euo pipefail
cd "$(dirname "$0")"

target=(--resource-group rg-ned)
app=ned-baby

if [[ ${1:-} == --setup ]]; then
  read -rp "Create Ned in the subscription \"$(az account show --query name --output tsv)\"? [y/N] " answer
  [[ $answer == y ]]

  az group create --name rg-ned --location eastus --output none
  az appservice plan create "${target[@]}" --name plan-ned --is-linux --sku F1 --output none
  az webapp create "${target[@]}" --plan plan-ned --name $app --runtime DOTNETCORE:10.0 --https-only true --output none
  az webapp config set "${target[@]}" --name $app --startup-file 'dotnet Ned.API.dll' --output none

  read -rsp 'Neon connection string: ' database && echo
  # Neon hands out a postgresql:// URL; Npgsql wants key=value pairs.
  if [[ $database =~ ^postgres(ql)?://([^:]+):([^@]+)@([^/?]+)/([^?]+) ]]; then
    database="Host=${BASH_REMATCH[4]};Database=${BASH_REMATCH[5]};Username=${BASH_REMATCH[2]};Password=${BASH_REMATCH[3]};SSL Mode=Require"
  fi
  settings=(
    "Tenants__Ned__ConnectionString=$database"
    "Tenants__Ned__EncryptionKey=$(openssl rand -hex 32)"
    "Tenants__Ned__AdminPassword=$(openssl rand -hex 16)Aa1!"
  )
  read -rp 'Parent names, separated by spaces: ' -a parents
  for parent in "${parents[@]}"; do
    read -rsp "Password for $parent: " password && echo
    settings+=("Parents__$parent=$password")
  done
  az webapp config appsettings set "${target[@]}" --name $app --output none --settings "${settings[@]}"
fi

(cd client && npm ci && npm run build)
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
dotnet publish server/Ned.API --configuration Release --output "$out/app"
(cd "$out/app" && zip -qr ../ned.zip .)
az webapp deploy "${target[@]}" --name $app --type zip --src-path "$out/ned.zip"
echo "Deployed to https://$app.azurewebsites.net"
