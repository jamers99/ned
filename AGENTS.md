# Ned — sleep-first baby tracker

A private, two-parent baby tracker built around one goal: help the baby sleep well. Replaces the Nara Baby app. Two users: one parent on iPhone, who logs most entries, and one on Android.

**Non-negotiables**
- **Feels native and instant.** Every tap updates the UI in the same frame. Nothing in the UI ever waits on the network.
- **Offline-first.** The phone's local DB is the source of truth for the UI; the server is for sync and backup.
- **Name and pronouns are data.** UI text takes the baby's name and pronouns from `client/src/lib/baby.ts` (Kennedy, she/her for now) — never spelled out in a screen — so they can become Settings fields later.
- **Calm and simple.** Fewer features, done beautifully. When in doubt, leave it out.
- **One-handed at 3am.** Big targets (≥44px, primary actions ≥96px), minimal typing.

## Architecture

```
/client   PWA — Vite + Svelte 5 + TypeScript, Dexie (IndexedDB), vite-plugin-pwa (Workbox)
/server   Benevia Core API (.NET 10, PostgreSQL) — OData, entity events. Builds the client into Ned.API/wwwroot
/tools    nara-import (one-time import of the Nara CSV export; reuses client/src/lib modules)
```

- Client is a static PWA served by any static host (or from the server). Installed via Safari/Chrome "Add to Home Screen". `display: standalone`, portrait.
- No native wrappers, no app stores.

## Data model (server entities ⇄ Dexie tables, same shape)

All records (the `ISynced` interface): `Guid` (Core's primary key, **generated on the phone**), `ModifiedAt` (DateTimeOffset, **stamped by the server** in a PreSave event on every create/update), `Deleted` (bool — not `IsDeleted`, which collides with Core's generated entity state), `LoggedBy` (string: the parent's user name; "Nara" for imported rows). Store times as UTC instants; display in the device's local time zone. On the phone, times are epoch ms and rows carry a `dirty` edit stamp.

**Event** — one table for everything time-based
| Field | Notes |
|---|---|
| `Type` | `Sleep` \| `NightWaking` \| `Feed` \| `Solids` \| `Note` |
| `Start` | required |
| `End` | null while running (sleep/feed timer in progress) |
| `IsNight` | Sleep only. Set when the sleep starts: true if Start is between Settings' bedtime and morning. Changed only from the Day view's edit sheet |
| `SleepLocation` | `Crib` \| `Contact` \| `OnTheGo` (nullable) |
| `SleepOnset` | how she fell asleep: `Own` \| `Fed` \| `Rocked` \| `Held` (nullable) |
| `WakeMood` | `Happy` \| `Fussy` \| `Crying` (nullable) |
| `SettledBy` | NightWaking only: `Feeding` \| `Soothing` \| `Own` |
| `FeedKind` | `Nursing` \| `Bottle` |
| `LeftSeconds`, `RightSeconds` | Nursing durations (ints) |
| `StartSide` | `Left` \| `Right` — which side the feed started on |
| `ActiveSide`, `ActiveSince` | Nursing timer state while running (so the timer survives app close and syncs) |
| `BottleOz` | decimal |
| `Foods` | Solids: string[] of food names on the phone; one name per line in a text column on the server |
| `SolidAmount` | `Taste` \| `Some` \| `All` (nullable) |
| `Text` | Note text, or free-form note on any event |

Night sleep is ONE `Sleep` event from bedtime to morning wake. Night wakings are separate `NightWaking` events that overlap it. Night sleep total = duration − sum(overlapping wakings).

**Growth** — `MeasuredAt`, `WeightKg`, `LengthCm`, `HeadCm` (each nullable). Display lb/oz and inches.

**Food** — `Name` (unique, case-insensitive), `Category` (`Fruit` \| `Veggies` \| `Protein` \| `Grains` \| `Other`), `LastUsedAt`, `UseCount`. Upserted on the client whenever a Solids event is saved. Recents = top 6 by `LastUsedAt`. The `Guid` is a UUIDv5 of the lower-cased name, so both phones adding "Mango" offline upsert the same row.

**Settings** (local + synced single row with a fixed `Guid`) — naps per day (2), wake window before a nap (2h30m), wake window before bed (3h30m), night range (`NightStartMinutes`/`NightEndMinutes`, 8 PM – 6 AM). The suggested bedtime is exactly the bedtime setting. The Settings screen gives each one a short plain description. Fields that change get a Core `PropertyAdded` data upgrade that also stamps `ModifiedAt`, so phones pull the row.

**Export** — Settings' **Export data** writes everything on the phone (deleted rows left out) to one CSV for a spreadsheet or another app: one row per event, growth measurement and food, oldest first, each time in local ISO with its offset and in UTC (`client/src/lib/export.ts`). It goes to the share sheet where the phone has one, otherwise downloads.

## Sync

The client owns an outbox. Server is a dumb, reliable store.

1. **Write path:** UI writes to Dexie and marks the row `dirty`. UI re-renders from Dexie (liveQuery). Done — the user never waits.
2. **Push:** debounced 1s after any write, plus on app open / `visibilitychange` to visible / every 60s while open. Send all dirty rows as upserts in one OData `$batch` (`POST /api/$batch`, JSON format): PATCH every row, then POST (with the phone's `Guid`) the ones that returned 404 — Core has no upsert. Clear `dirty` on success unless the row was edited again mid-push; keep it on failure and retry with backoff.
3. **Pull:** `GET /api/Event?$select=<all fields>&$filter=ModifiedAt ge {cursor − 60s}` (same for Growth, Food, Settings; Core returns only `Guid` without `$select`). Store `cursor` = max `ModifiedAt` received; skip rows whose `ModifiedAt` matches the local copy. The 60s overlap catches saves that commit after a later-stamped one.
4. **Deletes are soft:** set `Deleted = true` and push. ⚠️ There is deliberately **no** global query filter on `Deleted`, so the standard OData pull returns deleted rows and deletions reach the other phone. Don't add one; filter on the phone instead.
5. **Conflicts:** last write (server `ModifiedAt`) wins. Two users, rarely editing the same row — keep it simple.
6. A running timer is just a row with `End = null`, so the other phone sees it after the next sync.
7. **Sync indicator:** a quiet cloud at the right end of the tab bar (not shown without an account); tapping it opens Settings. It turns terracotta with a dot once a sync has failed and either a change has waited over an hour to push or the last good sync (kept in `meta`) is over an hour old, and whenever the phone needs a sign-in.

## Auth

The phones use Benevia Core's built-in login (access token + refresh token). This is NOT the framework's OAuth 2.1 feature, which is only for AI apps connecting over MCP (below); don't use OAuth in the phones. Read the framework's auth code for the exact endpoints and how it returns tokens.

- **Users:** one Benevia user per parent. Give both one role with full access to Event, Growth, Food and Settings. No other RBAC.
- **Sign in once per phone:** a first-run screen with username + password, plus **Try it without an account** (a `guest` meta flag: nothing syncs, everything stays on the phone; signing in later from Settings syncs it all). After that, the user should never see a login again unless they sign out or the refresh token is revoked.
- **Access token:** keep it in memory only, never in localStorage or IndexedDB. It is fine to lose it when the app closes.
- **Refresh token:**
  - Core's login (`POST /api/auth/signin`, `POST /api/auth/refresh`) returns the refresh token in the JSON body and has no cookie option, so it is stored in IndexedDB, and the server sends a strict Content-Security-Policy with no third-party scripts. The app and API share one origin (the server serves the PWA).
  - Ask the server for a long refresh lifetime (about 90 days, extended on each use) so phones stay signed in.
- **Sync flow:** before each push/pull, if there is no valid access token, refresh silently. If a request returns 401, refresh once and retry once.
- **Never spend a refresh token without hearing back:** each refresh token works once, so a refresh the phone gives up on after the server answered signs the phone out. The server sleeps when idle (free App Service plan) and can take longer to wake than a phone waits, so each refresh first wakes it with `HEAD /api/$metadata`, which changes nothing; the refresh itself is never aborted by a sync. Only a 401 from the refresh means signing in again (first re-read the stored token, in case another copy of the app refreshed); anything else is retried like any sync error.
- **When refresh fails:** the app keeps working fully offline. The outbox keeps queuing, and a small banner says "Sign in to sync". Signing in never touches local data, so nothing is lost.
- **iPhone note:** a home-screen app has its own storage, separate from Safari. Users must sign in from inside the installed app.
- **Sign out:** clear tokens only. Ask before also clearing local data.

## MCP (AI apps)

An AI app such as Claude connects to `https://<host>/mcp` as a custom connector, mainly to answer questions about the data and sometimes to log entries. `server/Ned.API/Mcp/NedMcp.cs` wires up Core's MCP server (`Benevia.Core.MCP`: generic OData tools that stage writes in a Core workflow and apply them when the user approves) and Core's OAuth.

- **On only with a secret:** MCP and OAuth are added when `OAuth:Secret` is set; outside Development `OAuth:PublicOrigin` is required with it, since Azure's proxy hides the https address.
- **Sign-in:** OAuth sends the browser to `/oauth/consent` (`Mcp/consent.html` + `consent.js`, served by the server, not the PWA): sign in as a parent, then Allow. It grants read, and write if left checked, never Core's delete scope: Ned deletes softly so the other phone hears about it. The PWA's service worker must not answer `/connect/` or `/oauth/` navigations.
- **Keep the phone's logic on the phone.** The UI stays offline-first; the server only fills in what an app can't: `LoggedBy` defaults to the signed-in parent when empty (also for rows logged before signing in), and a Solids event logged by a connected app counts its foods in Food (same UUIDv5 as the phones). Phones count their own foods, so the server leaves their solids alone.
- **Agent instructions:** `NedMcp.AppInstructions`, appended to Core's rules. Clients cut the whole block at 2,048 bytes, so keep it under ~800 bytes; derived rules an agent must follow (IsNight from the night range, soft deletes) go there.

## Performance rules (client)

- Precache the entire app shell, fonts, and icons. Launch must not touch the network.
- Self-host the fonts (Fraunces, Nunito Sans) as woff2 subsets; `font-display: swap`.
- Timers render from `Start`/`ActiveSince`: `now − start`, ticking with one `requestAnimationFrame`/1s interval. Never accumulate in memory.
- Optimistic everything. No spinners for local actions.
- `touch-action: manipulation` globally; no 300ms tap delay. Prefer CSS transforms for transitions; keep them ≤180ms.
- Keep the JS bundle small (target < 80 KB gzipped). No component libraries.
- Use `viewport-fit=cover` and `env(safe-area-inset-*)` padding.

## Design

Mockups: https://claude.ai/artifact/JxGTeQYmZo3M7Pds4MbMMz (8 phone screens). Match them.

Cottage feel: warm linen, sage for sleep, terracotta for awake time and feeds, soft serif for headings and times.

| Token | Value | Use |
|---|---|---|
| ground | `#F4EEE3` | app background |
| surface | `#FCF9F3` | cards, buttons |
| line | `#E3D8C6` | borders |
| ink | `#3A2F25` | text, primary dark button |
| muted | `#6E6152` | secondary text |
| moss | `#56654A` | sleep, primary action |
| moss-deep | `#3E4A35` | sleep text on light |
| moss-soft | `#E4E7D7` | sleep callouts |
| terra | `#B0583A` | awake, active feed side |
| terra-text | `#93452B` | terracotta text on light |
| peach | `#F6D9C3` | "Woke up" / "She's awake" buttons in the sleep drawer |
| night-bg | `#0B0807` | night colors background |
| night-text | `#E9A48C` / `#B9785F` | night colors text (dim, warm, no blue light) |

`client/src/app.css` is the style sheet: every color is a token there, with its night value under `:root.night-theme`. Screens use tokens only — no hex values in components — so the night colors reach every screen. Night has no green, no shadows, and text pairs keep WCAG AA contrast in both themes.

Type: **Fraunces** (headings, big numbers, primary buttons), **Nunito Sans** (everything else, 600–800 weight). Radii: cards 24–26px, big buttons 30px, chips fully round. Icons: thin stroke inline SVG (1.7px), no emoji.

## Screens

1. **Now** — sleep and feeds weigh the same; sleep is not a separate mode. A status card on top: while awake, awake-since + big duration and the wake-window progress bar with the target nap/bedtime window (tapping it opens a short plain explanation of the bar, the target zone and the times); while asleep, the running sleep (or the running night waking) with the typical-nap hint, and tapping it opens the sleep drawer. Below it, two equal big buttons, **Sleep** (moss) and **Feed** (terracotta). One tap on Sleep starts the sleep at now (it says **Start nap** / **Start night** from the `IsNight` default) and opens its drawer; Feed opens its drawer. While one is running, its button shows a live dot (the Feed button also the feed's timer; the sleep's timer is on the card) and opens its drawer; when idle, Feed says how long ago she last fed. A wide **Solids** card says when she last ate and what, with a small square Note button beside it (notes are rare). Today strip (24h bar of sleeps and feeds). Tabs: Now, Day, Insights.
2. **Sleep drawer** — a full-height drawer like Feed, for the running sleep (the Sleep button already started it; no nap/night toggle). It shows: running timer, "typical nap length" hint, one-tap chips for Where and Fell asleep, "Started …" to adjust the start. A nap is plain stop/start: big **Woke up** ends it; a feed afterwards is its own event, and falling back asleep is another nap. When a nap runs well past her usual longest (upper quartile + max(30 min, half of it); 3h before there's history), the Now card and the drawer gently ask **Still asleep?** — "Still asleep" quiets it for an hour, **Woke at…** ends the nap at a picked time and opens the Woke-up sheet. A night has big **She's awake** (starts a NightWaking), **Add a waking** (start/end times and how she settled, for one missed at the time) and **Up for the day**. During a waking the drawer shows the awake-for timer (its start adjustable), big **Feed** plus Solids / Note (the normal screens, which return to the drawer when closed), then **Back asleep**: one button settling "by feeding" if she fed during the waking, otherwise Soothing / On her own. A **Delete** pill next to "Started …" deletes a sleep started by mistake and any wakings in it (feeds stay), asking first once it's over 5 minutes old. Missed logging never reaches back more than a day.
3. **Woke-up sheet** — saved duration, editable start/end time buttons, wake mood chips, next sleep window callout, Done.
4. **Night colors** — no separate night mode. From bedtime to morning, and while a night sleep runs, the whole app switches to near-black with dim warm text (the `night-theme` class on `<html>` remaps the color tokens).
5. **Feed** — Nursing/Bottle toggle. Nursing: two big round Left/Right buttons; tap starts that side, tap again pauses, tap the other side switches; live per-side and total time; "last feed started on X · Nh ago"; −1/+1 min and start-time adjust; Done saves. While a side is running, the screen stays on (Screen Wake Lock, taken again when the app returns to the front). Bottle: oz stepper.
6. **Solids** — search/add field (typing a new name offers "+ Add 'Mango'"), Recents chips, category tabs with preset chips (multi-select), optional amount (A taste / Some / All of it), Save with count.
7. **Day** — date switcher, totals (sleep, naps, feeds), chronological list: sleep blocks (moss), awake gaps shown as wake windows (terracotta line + "Awake 2h 30m"), feed/solids rows with details. Anything logged during a sleep (night wakings, night feeds, solids, notes) hangs off that sleep's block on a moss line at the left (normal rows, indented, in time order), so a night reads as one group; it still counts in the totals. A night shows on the day it ends. Tap any row (or grouped row) to edit or delete.
8. **Insights** — longest night stretch by month (from imported feed history + new sleep data), avg bedtime and spread (7 days), night wakings per night and how settled, the "best last wake window" pattern card (needs ~14 days of data; show "unlocks after…" until then). Link to **Growth**.
9. **Growth** — weight, length, head charts over time (optional WHO girls percentile bands), list of measurements, "Add measurement".

Wake-window logic: awake time = now − end of the last sleep. Target comes from Settings (before a nap, or before bed once the day's naps are done or no nap fits before the latest bedtime); show a nap's window as target ± 10 min; bedtime is the bedtime setting. Keep it all client-side.

## Nara import (`/tools/nara-import`)

Input: `export_narababy_<name>_YYYYMMDD.csv`. Use the `Start Date/time (Epoch)` column (ms, UTC) for times — the local-time column can mix time zones. Generate a deterministic Guid per row from `_activityKey` so re-running is idempotent. Push via OData `$batch` in chunks of ~200.

| Nara `Type` | → | Mapping |
|---|---|---|
| Breastfeed | Event Feed/Nursing | `LeftSeconds`/`RightSeconds` from the duration columns (blank = 0); `StartSide` from Begin Side; strip `.nonTimer` suffixes; `End = Start + Left + Right` |
| Bottle Feed | Event Feed/Bottle | `BottleOz` from Breast Milk Volume, else Volume (unit FLOZ) |
| Solid Feed | Event Solids | Foods: split on newline; each entry may look like `Cereal: amountKey=ALL; reactionKey=LOVE` — name before `:`; `amountKey` LITTLE→Taste, ALL→All. Upsert each name into Food (Category from a small map; unknown → Other) |
| Sleep | Event Sleep | End from Sleep End (Epoch); `IsNight` by the default rule (with the default settings) |
| Growth | Growth | IN→cm (×2.54), LB→kg (×0.45359237) |
| Note column | `Text` | if present |
| Diaper, Pump, Milestone, Profile | skip | |

Nara's columns carry a type prefix (`[Sleep] End Date/time (Epoch)`, `[Growth] Weight`, …); `tools/nara-import/nara.ts` names them exactly. Run `--dry-run` first and check the counts and samples.

## Build order

1. Server: entities, ModifiedAt stamping event, sync-safe query (bypass IsDeleted filter), two users + built-in login (access/refresh), serve the PWA from the same origin.
2. Client shell: PWA manifest + precache, fonts, tokens, tab layout, Dexie schema.
3. Sync engine (outbox, push, pull) with a tiny debug panel in settings.
4. Sleep flow: Now, sleep drawer, Woke sheet, night colors.
5. Feed timer, Solids, Notes.
6. Day view with edit/delete.
7. Nara import; verify counts.
8. Growth screen.
9. Insights (after ~2 weeks of sleep data).

**Later / maybe:** iPhone home-screen widget via Scriptable reading the running Sleep/Feed from the API (timer-style date text); start-time notifications.

## Out of scope

Diapers, pumping, milestones, multiple babies, handoff notifications, native apps, app-store distribution.
