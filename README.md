# Ned

A calm baby app focusing on sleep and simplicity. An offline-first PWA (`client/`) syncs through a Benevia Core API (`server/`), which also serves the app. Every tap is local first; the server is only for sync and backup. See [AGENTS.md](AGENTS.md) for the product spec and the sync design.

Anyone can make an account. The first parent's account starts a family; the other parent enters the invite code shown in that parent's Settings when they create theirs, and the two share one log. A family has one baby.

## Run it locally

You need the .NET 10 SDK, Node 24+ and PostgreSQL on `localhost` (user `postgres`, password `postgres`).

```bash
cd server && dotnet run --project Ned.API --launch-profile http
```

Building the server builds the client into `server/Ned.API/wwwroot` first (and installs its packages if needed), skipping it when nothing in `client/` changed. Pass `-p:SkipClientBuild=true` to leave `wwwroot` alone.

Open http://localhost:5205 and sign in as `John` / `Dev-john-1` or `Jane` / `Dev-jane-1` (one family, from `Parents` in `appsettings.Development.json`), or choose **Create account**. For hot reload, also run `npm run dev` in `client/` and open http://localhost:5173.

## Tests

```bash
cd client && npm run check && npm test
```

```bash
cd server && dotnet test Ned.slnx
```

```bash
node --test tools/nara-import/nara.test.ts
```

Screen tests click through the app in a phone-sized Chromium, on a fixed clock, with three days of seeded history and no server (`client/e2e/`). The first time, run `npx playwright install chromium` in `client/`.

```bash
cd client && npm run e2e           # flows: sleep, feeds, solids, notes, Day, Insights
cd client && npm run e2e:screens   # a picture of every screen, day and night colors, in client/e2e/screens/
```

## Deploy

Every push to `main` that passes the tests deploys to Azure App Service through `./deploy.sh`. The database is on [Neon](https://neon.tech).

To set it up the first time, sign in with `az login` and `gh auth login`, then run `./setup.sh`. It creates the Azure resources, asks for the Neon connection string, and lets GitHub Actions deploy. Leave the encryption key it generates alone: changing it signs everyone out.

On each phone, open the site, choose **Add to Home Screen**, and sign in or create an account from the installed app. On iPhone, the installed app keeps its own storage, separate from Safari.

Sign-ups are limited to 10 an hour from one address (`SignUp__PerHour`), since an invite code is all that guards a family's log. There is no password reset yet.

## Connect Claude

Claude can read Ned's data and log entries over MCP. In the Claude app, open **Settings → Connectors → Add custom connector** and enter `https://ned-baby.azurewebsites.net/mcp`. Claude opens a Ned page: sign in with your Ned account and choose **Allow**. Claude sees only your family's log. Uncheck **Also let it log and edit entries** for read-only access.

This needs two app settings, which `./setup.sh` creates. To add them to an app set up before Ned had MCP:

```bash
az webapp config appsettings set --resource-group rg-ned --name ned-baby --output none --settings \
  "OAuth__Secret=$(openssl rand -hex 32)" OAuth__PublicOrigin=https://ned-baby.azurewebsites.net
```

Without `OAuth__Secret`, MCP is off and the rest of Ned works as before. Changing the secret disconnects Claude, which then asks to sign in again. Locally, OAuth only works over HTTPS, so try a connector through a tunnel (e.g. `ngrok http 5205`) with `OAuth__PublicOrigin` set to the tunnel's URL.

## Import from Nara

Export the CSV from Nara (Activity → tap the avatar → Export Data) and check it with a dry run:

```bash
node tools/nara-import/import.ts export.csv --dry-run
```

If a count or sample looks off, Nara may have renamed a column: check the `columns` map in `tools/nara-import/nara.ts`. Then import as one of the parents; it goes into that parent's family. Re-running is safe.

```bash
read -s NED_PASSWORD && export NED_PASSWORD
```

```bash
node tools/nara-import/import.ts export.csv --server https://ned-baby.azurewebsites.net --user John
```

Run the import in the baby's time zone (or set `TZ`), since that decides which sleeps count as night.
