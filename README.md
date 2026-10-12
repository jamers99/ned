# Ned

A private, sleep-first baby tracker for two parents. An offline-first PWA (`client/`) syncs through a
Benevia Core API (`server/`), which also serves the app. See [CLAUDE.md](CLAUDE.md) for the product spec
and the sync design.

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
`appsettings.Development.json`: `Natalie` / `Dev-natalie-1` and `James` / `Dev-james-1`.

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

Ned runs on Azure App Service's free Linux plan (`ned-baby` in resource group `rg-ned`, on James's personal
subscription) with a free [Neon](https://neon.tech) Postgres database. To ship a new version, sign in with
`az login` and run:

```bash
./deploy.sh
```

The first time, `./deploy.sh --setup` creates the Azure resources and asks for three things:
- the Neon connection string (the direct one, with pooling off);
- each parent's password (8+ characters with upper, lower, digit and symbol).

It also generates the token key and the admin password. The parents are created on the first start against the
empty database. The secrets live in the app's settings as `Tenants__Ned__ConnectionString`,
`Tenants__Ned__EncryptionKey`, `Tenants__Ned__AdminPassword` and `Parents__<Name>`. Keep the token key
stable: changing it signs both phones out.

The free plan sleeps when idle, so the first sync after a quiet spell takes a few seconds. The app never waits on
it. To keep it awake, for about $13 a month:

```bash
az appservice plan update --resource-group rg-ned --name plan-ned --sku B1
```

On each phone, open the site in Safari or Chrome, choose **Add to Home Screen**, and sign in from the
installed app. On iPhone, the home-screen app has its own storage, separate from Safari.

## Import the Nara history

Export the CSV from Nara (Activity → tap the avatar → Export Data), then check the mapping first:

```bash
node tools/nara-import/import.ts export_narababy_kennedy_20261010.csv --dry-run
```

The dry run prints the row counts next to the expected ones (about 2,019 breastfeeds, 36 bottles, 165
solids, 25 sleeps and 11 growth rows), the average breastfeed length, and a sample row of each kind. The
real export was not available while writing the importer, so the duration, unit, food and growth columns
are matched by pattern in `tools/nara-import/nara.ts`. If a count or sample looks wrong, adjust the
`columns` map there.

Then import. Re-running is safe: each row's `Guid` comes from its Nara key.

```bash
read -s NED_PASSWORD && export NED_PASSWORD
```

```bash
node tools/nara-import/import.ts export_narababy_kennedy_20261010.csv --server https://ned-baby.azurewebsites.net --user James
```

The "night" flag on imported sleeps uses the importing computer's time zone, so run it in the family's
time zone (or set `TZ`).
