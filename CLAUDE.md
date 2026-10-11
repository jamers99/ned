# Kennedy — sleep-first baby tracker

A private, two-parent baby tracker built around one goal: help Kennedy (born 2026-03-17) sleep well. Replaces the Nara Baby app. Two users: Natalie (iPhone, logs ~90% of entries) and James (Android).

**Non-negotiables**
- **Feels native and instant.** Every tap updates the UI in the same frame. Nothing in the UI ever waits on the network.
- **Offline-first.** The phone's local DB is the source of truth for the UI; the server is for sync and backup.
- **Calm and simple.** Fewer features, done beautifully. When in doubt, leave it out.
- **One-handed at 3am.** Big targets (≥44px, primary actions ≥96px), minimal typing.

## Architecture

```
/client   PWA — Vite + Svelte 5 + TypeScript, Dexie (IndexedDB), vite-plugin-pwa (Workbox)
/server   Benevia Core API (.NET 10, PostgreSQL) — OData, entity events
/tools    nara-import (one-time import of the Nara CSV export)
```

- Client is a static PWA served by any static host (or from the server). Installed via Safari/Chrome "Add to Home Screen". `display: standalone`, portrait.
- No native wrappers, no app stores.

## Data model (server entities ⇄ Dexie tables, same shape)

All records: `Id` (Guid, **generated on the phone**), `ModifiedAt` (DateTimeOffset, **stamped by the server** in an entity event on every create/update), `IsDeleted` (bool), `LoggedBy` (string: "Natalie" | "James"). Store times as UTC instants; display in the device's local time zone.

**Event** — one table for everything time-based
| Field | Notes |
|---|---|
| `Type` | `Sleep` \| `NightWaking` \| `Feed` \| `Solids` \| `Note` |
| `Start` | required |
| `End` | null while running (sleep/feed timer in progress) |
| `IsNight` | Sleep only. Default: true if Start is between 17:30 and 04:00; user can toggle |
| `SleepLocation` | `Crib` \| `Contact` \| `OnTheGo` (nullable) |
| `SleepOnset` | how she fell asleep: `Own` \| `Fed` \| `Rocked` \| `Held` (nullable) |
| `WakeMood` | `Happy` \| `Fussy` \| `Crying` (nullable) |
| `SettledBy` | NightWaking only: `Feeding` \| `Soothing` \| `Own` |
| `FeedKind` | `Nursing` \| `Bottle` |
| `LeftSeconds`, `RightSeconds` | Nursing durations (ints) |
| `StartSide` | `Left` \| `Right` — which side the feed started on |
| `ActiveSide`, `ActiveSince` | Nursing timer state while running (so the timer survives app close and syncs) |
| `BottleOz` | decimal |
| `Foods` | Solids: string[] (JSON column) of food names |
| `SolidAmount` | `Taste` \| `Some` \| `All` (nullable) |
| `Text` | Note text, or free-form note on any event |

Night sleep is ONE `Sleep` event from bedtime to morning wake. Night wakings are separate `NightWaking` events that overlap it. Night sleep total = duration − sum(overlapping wakings).

**Growth** — `MeasuredAt`, `WeightKg`, `LengthCm`, `HeadCm` (each nullable). Display lb/oz and inches.

**Food** — `Name` (unique, case-insensitive), `Category` (`Fruit` \| `Veggies` \| `Protein` \| `Grains` \| `Other`), `LastUsedAt`, `UseCount`. Upserted on the client whenever a Solids event is saved. Recents = top 6 by `LastUsedAt`.

**Settings** (local + synced single row) — wake-window targets per nap index (default for ~7 months: nap1 2h30m, nap2 2h45m, before bed 3h30m), bedtime target window.

## Sync

The client owns an outbox. Server is a dumb, reliable store.

1. **Write path:** UI writes to Dexie and marks the row `dirty`. UI re-renders from Dexie (liveQuery). Done — the user never waits.
2. **Push:** debounced 1s after any write, plus on app open / `visibilitychange` to visible / every 60s while open. Send all dirty rows as upserts in an OData `$batch` (client-supplied `Id`). Clear `dirty` on success; keep it on failure and retry with backoff.
3. **Pull:** `GET /odata/Events?$filter=ModifiedAt ge {cursor}` (same for Growth, Food, Settings). Store `cursor` = max `ModifiedAt` received; use `ge` and de-dupe by `Id`+`ModifiedAt`.
4. **Deletes are soft:** set `IsDeleted = true` and push. ⚠️ The app's global query filter hides `IsDeleted` rows — **the sync pull queries must bypass that filter**, or deletions will never reach the other phone.
5. **Conflicts:** last write (server `ModifiedAt`) wins. Two users, rarely editing the same row — keep it simple.
6. A running timer is just a row with `End = null`, so the other phone sees it after the next sync.

## Auth

Use Benevia Core's built-in login (access token + refresh token). This is NOT the framework's OAuth 2.1 feature, which is for AI clients and third-party apps; don't use OAuth here. Read the framework's auth code for the exact endpoints and how it returns tokens.

- **Users:** one Benevia user per parent (Natalie, James). Give both one role with full access to Event, Growth, Food and Settings. No other RBAC.
- **Sign in once per phone:** a first-run screen with username + password. After that, the user should never see a login again unless they sign out or the refresh token is revoked.
- **Access token:** keep it in memory only, never in localStorage or IndexedDB. It is fine to lose it when the app closes.
- **Refresh token:**
  - Preferred: if the framework can return it as an HttpOnly, Secure, SameSite=Strict cookie, use that. It requires the app and the API on the same origin, e.g. `baby.example.com` with the API under `/api` and the static PWA served by the same server.
  - Otherwise: store it in IndexedDB, and keep a strict Content-Security-Policy with no third-party scripts.
  - Ask the server for a long refresh lifetime (about 90 days, extended on each use) so phones stay signed in.
- **Sync flow:** before each push/pull, if there is no valid access token, refresh silently. If a request returns 401, refresh once and retry once.
- **When refresh fails:** the app keeps working fully offline. The outbox keeps queuing, and a small banner says "Sign in to sync". Signing in never touches local data, so nothing is lost.
- **iPhone note:** a home-screen app has its own storage, separate from Safari. Users must sign in from inside the installed app.
- **Sign out:** clear tokens only. Ask before also clearing local data.

## Performance rules (client)

- Precache the entire app shell, fonts, and icons. Launch must not touch the network.
- Self-host the fonts (Fraunces, Nunito Sans) as woff2 subsets; `font-display: swap`.
- Timers render from `Start`/`ActiveSince`: `now − start`, ticking with one `requestAnimationFrame`/1s interval. Never accumulate in memory.
- Optimistic everything. No spinners for local actions.
- `touch-action: manipulation` globally; no 300ms tap delay. Prefer CSS transforms for transitions; keep them ≤180ms.
- Keep the JS bundle small (target < 80 KB gzipped). No component libraries.
- Use `viewport-fit=cover` and `env(safe-area-inset-*)` padding.

## Design

Mockups: https://claude.ai/artifact/JxGTeQYmZo3M7Pds4MbMMz (James's canvas — 8 phone screens). Match them.

Cottage feel: warm linen, sage for sleep, terracotta for awake time and feeds, soft serif for headings and times.

| Token | Value | Use |
|---|---|---|
| ground | `#F4EEE3` | app background |
| surface | `#FCF9F3` | cards, buttons |
| line | `#E3D8C6` | borders |
| ink | `#3A2F25` | text, primary dark button |
| muted | `#6E6152` | secondary text |
| moss | `#56654A` | sleep, primary action |
| moss-deep | `#3E4A35` | asleep screen background |
| moss-soft | `#E4E7D7` | sleep callouts |
| terra | `#B0583A` | awake, active feed side |
| terra-text | `#93452B` | terracotta text on light |
| peach | `#F6D9C3` | "Woke up" button on asleep screen |
| night-bg | `#0B0807` | night mode background |
| night-text | `#E9A48C` / `#B9785F` | night mode text (dim, warm, no blue light) |

Type: **Fraunces** (headings, big numbers, primary buttons), **Nunito Sans** (everything else, 600–800 weight). Radii: cards 24–26px, big buttons 30px, chips fully round. Icons: thin stroke inline SVG (1.7px), no emoji.

## Screens

1. **Now (awake)** — awake-since + big duration, wake-window progress bar with the target nap/bedtime window, big **Start sleep** button (says **Start night** when `IsNight` default is true), Feed / Solids / Note tiles, today strip (24h bar of sleeps and feeds). Tabs: Now, Day, Insights.
2. **Now (asleep)** — moss-deep background, running timer, "typical nap length" hint, one-tap chips for Where and Fell asleep (editable while sleeping), big **Woke up** button, "Adjust start time". Moon icon → Night mode.
3. **Woke-up sheet** — saved duration, editable start/end time buttons, wake mood chips, next sleep window callout, Done.
4. **Night mode** — near-black, dim warm text. When asleep: big "She's awake" button (starts a NightWaking). During a waking: awake-for timer and three huge buttons for SettledBy (Feeding / Soothing / On her own) which close the waking. "Up for the day" ends the night sleep. Auto-suggest night mode between 19:00–06:00.
5. **Feed** — Nursing/Bottle toggle. Nursing: two big round Left/Right buttons; tap starts that side, tap again pauses, tap the other side switches; live per-side and total time; "last feed started on X · Nh ago"; −1/+1 min and start-time adjust; Done saves. Bottle: oz stepper.
6. **Solids** — search/add field (typing a new name offers "+ Add 'Mango'"), Recents chips, category tabs with preset chips (multi-select), optional amount (A taste / Some / All of it), Save with count.
7. **Day** — date switcher, totals (sleep, naps, feeds), chronological list: sleep blocks (moss), awake gaps shown as wake windows (terracotta line + "Awake 2h 30m"), feed/solids rows with details. Tap any row to edit or delete.
8. **Insights** — longest night stretch by month (from imported feed history + new sleep data), avg bedtime and spread (7 days), night wakings per night and how settled, the "best last wake window" pattern card (needs ~14 days of data; show "unlocks after…" until then). Link to **Growth**.
9. **Growth** — weight, length, head charts over time (optional WHO girls percentile bands), list of measurements, "Add measurement".

Wake-window logic: awake time = now − end of the last sleep. Target comes from Settings by nap index for the day; show the window as target ± 10 min. Keep it all client-side.

## Nara import (`/tools/nara-import`)

Input: `export_narababy_kennedy_YYYYMMDD.csv`. Use the `Start Date/time (Epoch)` column (ms, UTC) for times — the local-time column has mixed time zones from travel. Generate a deterministic Guid per row from `_activityKey` so re-running is idempotent. Push via OData `$batch` in chunks of ~200.

| Nara `Type` | → | Mapping |
|---|---|---|
| Breastfeed | Event Feed/Nursing | `LeftSeconds`/`RightSeconds` from the duration columns (blank = 0); `StartSide` from Begin Side; strip `.nonTimer` suffixes; `End = Start + Left + Right` |
| Bottle Feed | Event Feed/Bottle | `BottleOz` from Breast Milk Volume, else Volume (unit FLOZ) |
| Solid Feed | Event Solids | Foods: split on newline; each entry may look like `Cereal: amountKey=ALL; reactionKey=LOVE` — name before `:`; `amountKey` LITTLE→Taste, ALL→All. Upsert each name into Food (Category from a small map; unknown → Other) |
| Sleep | Event Sleep | End from Sleep End (Epoch); `IsNight` by the default rule |
| Growth | Growth | IN→cm (×2.54), LB→kg (×0.45359237) |
| Note column | `Text` | if present |
| Diaper, Pump, Milestone, Profile | skip | |

Expect roughly 2,019 breastfeeds, 36 bottles, 165 solids, 25 sleeps, 11 growth rows.

## Build order

1. Server: entities, ModifiedAt stamping event, sync-safe query (bypass IsDeleted filter), two users + built-in login (access/refresh), serve the PWA from the same origin.
2. Client shell: PWA manifest + precache, fonts, tokens, tab layout, Dexie schema.
3. Sync engine (outbox, push, pull) with a tiny debug panel in settings.
4. Sleep flow: Now (awake/asleep), Woke sheet, Night mode.
5. Feed timer, Solids, Notes.
6. Day view with edit/delete.
7. Nara import; verify counts.
8. Growth screen.
9. Insights (after ~2 weeks of sleep data).

**Later / maybe:** iPhone home-screen widget via Scriptable reading the running Sleep/Feed from the API (timer-style date text); start-time notifications.

## Out of scope

Diapers, pumping, milestones, multiple babies, handoff notifications, native apps, app-store distribution.
