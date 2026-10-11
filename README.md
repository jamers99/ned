# Kennedy

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
cd server && dotnet run --project Kennedy.API --launch-profile http
```

Open http://localhost:5205. The first start creates the `kennedy` database and two parents from
`appsettings.Development.json`: `Natalie` / `Dev-natalie-1` and `James` / `Dev-james-1`.

For client work with hot reload, run `npm run dev` in `client/` and open http://localhost:5173. It proxies
`/api` to the server.

## Tests

```bash
cd server && dotnet test Kennedy.slnx
```

```bash
cd client && npm run check && npm test
```

```bash
node --test tools/nara-import/nara.test.ts
```

The server tests recreate a `kennedy_tests` database on each run.

## Deploy

Serve the server over HTTPS on one origin (the service worker and `crypto.subtle` need a secure context).
Run `npm run build` in `client/` first: it writes the app into `server/Kennedy.API/wwwroot`.
Configure secrets with environment variables:

| Variable | Value |
|---|---|
| `Tenants__Kennedy__ConnectionString` | PostgreSQL connection string |
| `Tenants__Kennedy__EncryptionKey` | 64 hex characters (`openssl rand -hex 32`). Signs tokens; keep it stable |
| `Tenants__Kennedy__AdminPassword` | Required. Core creates an `admin` account on first start |
| `Parents__Natalie`, `Parents__James` | Each parent's password (8+ characters, upper, lower, digit, symbol) |

The parents are created once, on the first start against an empty database.

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
read -s KENNEDY_PASSWORD && export KENNEDY_PASSWORD
```

```bash
node tools/nara-import/import.ts export_narababy_kennedy_20261010.csv --server https://baby.example.com --user James
```

The "night" flag on imported sleeps uses the importing computer's time zone, so run it in the family's
time zone (or set `TZ`).
