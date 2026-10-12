#!/usr/bin/env bash
# Builds Ned and ships it to https://ned-baby.azurewebsites.net. GitHub Actions runs this for every push to main;
# ./setup.sh creates the app the first time.
set -euo pipefail
cd "$(dirname "$0")"

(cd client && npm ci && npm run build)
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
dotnet publish server/Ned.API --configuration Release --output "$out/app"
(cd "$out/app" && zip -qr ../ned.zip .)
az webapp deploy --resource-group rg-ned --name ned-baby --type zip --src-path "$out/ned.zip" --output none
echo 'Deployed to https://ned-baby.azurewebsites.net'
