# Ned

A calm baby app focusing on sleep and simplicity. An offline-first PWA (`client/`) syncs through a Benevia Core API (`server/`), which also serves the app. Every tap is local first; the server is only for sync and backup. See [AGENTS.md](AGENTS.md) for the product spec and the sync design.

Ned is built for one family and one baby, so there's no sign-up: the parents are set in configuration. We'll get to sign up and multi-child support eventually.

## Run it locally

You need the .NET 10 SDK, Node 24+ and PostgreSQL on `localhost` (user `postgres`, password `postgres`).

```bash
cd client && npm install && npm run build
```

```bash
cd server && dotnet run --project Ned.API --launch-profile http
```

Open http://localhost:5205 and sign in as `Alex` / `Dev-alex-1` or `Sam` / `Dev-sam-1`. For hot reload, also run `npm run dev` in `client/` and open http://localhost:5173.

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

## Deploy

Every push to `main` that passes the tests deploys to Azure App Service through `./deploy.sh`. The database is on [Neon](https://neon.tech).

To set it up the first time, sign in with `az login` and `gh auth login`, then run `./setup.sh`. It creates the Azure resources, asks for the Neon connection string and the parents' passwords, and lets GitHub Actions deploy. Leave the encryption key it generates alone: changing it signs everyone out.

On each phone, open the site, choose **Add to Home Screen**, and sign in from the installed app. On iPhone, the installed app keeps its own storage, separate from Safari.

## Import from Nara

Export the CSV from Nara (Activity → tap the avatar → Export Data) and check it with a dry run:

```bash
node tools/nara-import/import.ts export.csv --dry-run
```

If a count or sample looks off, Nara may have renamed a column: check the `columns` map in `tools/nara-import/nara.ts`. Then import as one of the parents. Re-running is safe.

```bash
read -s NED_PASSWORD && export NED_PASSWORD
```

```bash
node tools/nara-import/import.ts export.csv --server https://ned-baby.azurewebsites.net --user Alex
```

Run the import in the baby's time zone (or set `TZ`), since that decides which sleeps count as night.
