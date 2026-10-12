# Ned

A calm baby app focusing on sleep and simplicity. An offline-first PWA (`client/`) syncs through a Benevia Core API (`server/`), which also serves the app. Every tap is local first; the server is only for sync and backup. See [CLAUDE.md](CLAUDE.md) for the product spec and the sync design.

Ned is built for one family and one baby, so there's no sign-up: the parents are set in configuration. We'll get to sign up and multi-child support eventually.

## Run it locally

You need the .NET 10 SDK, Node 24+ and PostgreSQL on `localhost` (user `postgres`, password `postgres`).
Benevia Core comes from the private GitHub package feed; see Core's quick start for adding the source.

```bash
cd client && npm install && npm run build
```

```bash
cd server && dotnet run --project Ned.API --launch-profile http
```

Open http://localhost:5205. The first start creates the `ned` database and two parents from
`appsettings.Development.json`: `Alex` / `Dev-alex-1` and `Sam` / `Dev-sam-1`.

For client work with hot reload, run `npm run dev` in `client/` and open http://localhost:5173. It proxies
`/api` to the server.

## Tests

```bash
cd server && dotnet test Ned.slnx
```

```bash
cd client && npm run check && npm test
```

```bash
node --test tools/nara-import/nara.test.ts
```

The server tests recreate a `ned_tests` database on each run.

## Deploy

Ned runs on Azure App Service's free Linux plan (`ned-baby` in resource group `rg-ned`) with a free
[Neon](https://neon.tech) Postgres database. Every push to `main` deploys (see below). To ship from your own
machine instead, sign in with `az login` and run:

```bash
./deploy.sh
```

The first time, `./deploy.sh --setup` confirms the subscription, creates the Azure resources, and asks for:
- the Neon connection string (the direct one, with pooling off);
- the parents' names, and a password for each (8+ characters with upper, lower, digit and symbol).

It also generates the token key and the admin password, and lets GitHub Actions deploy (see below). The parents are created on the first start against the
empty database. The secrets live in the app's settings as `Tenants__Ned__ConnectionString`,
`Tenants__Ned__EncryptionKey`, `Tenants__Ned__AdminPassword` and `Parents__<Name>`. Keep the token key
stable: changing it signs both phones out.

The free plan sleeps when idle, so the first sync after a quiet spell takes a few seconds. The app never waits on
it. To keep it awake, for about $13 a month:

```bash
az appservice plan update --resource-group rg-ned --name plan-ned --sku B1
```

### GitHub Actions

`.github/workflows/ci.yml` runs the client, import and server tests on every pull request and push. On a push to
`main`, it then runs `./deploy.sh`. Two things set it up:
- A `NUGET_TOKEN` secret, so it can download Benevia Core: a classic GitHub token with only the `read:packages`
  scope (`gh secret set NUGET_TOKEN`).
- `--setup`, which creates a managed identity that only `main` can sign in as (through OIDC, so no Azure secret
  is stored in GitHub). It saves the identity's IDs as repository variables. Until then, the deploy job is skipped.

### Phones

On each phone, open the site in Safari or Chrome, choose **Add to Home Screen**, and sign in from the
installed app. On iPhone, the home-screen app has its own storage, separate from Safari.

## Import the Nara history

Export the CSV from Nara (Activity → tap the avatar → Export Data), then check the mapping first:

```bash
node tools/nara-import/import.ts export_narababy_baby_20261010.csv --dry-run
```

The dry run prints the row counts, the average breastfeed length, and a sample row of each kind. The
duration, unit, food and growth column names vary between exports, so they are matched by pattern in
`tools/nara-import/nara.ts`. If a count or sample looks off, adjust the `columns` map there.

Then import. Re-running is safe: each row's `Guid` comes from its Nara key.

```bash
read -s NED_PASSWORD && export NED_PASSWORD
```

```bash
node tools/nara-import/import.ts export_narababy_baby_20261010.csv --server https://ned-baby.azurewebsites.net --user Alex
```

The "night" flag on imported sleeps uses the importing computer's time zone, so run it in the family's
time zone (or set `TZ`).
