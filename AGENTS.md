# Ned — notes for agents

What Ned is, how to run it and how it deploys are in [README.md](README.md). This file holds the rules that keep it simple, fast and correct. The code and the e2e flows are the spec for each screen's behavior; read them rather than restating them here.

## Rules

- **Simple and small.** The fewest moving parts that work. Prefer deleting code to adding it, one helper to two, and a plain condition to a clever one. When in doubt, leave it out.
- **Instant and offline-first.** Every tap writes to Dexie and updates the UI in the same frame. Nothing in the UI waits on the network. No spinners for local actions.
- **Name and pronouns are data.** UI text takes them from `client/src/lib/baby.svelte.ts` (she, he or they; "Baby" and they until set). A verb after a pronoun goes through `verb('goes', 'go')`. Never spell them out in a screen.
- **One-handed at 3am.** Targets ≥44px, primary actions ≥96px, minimal typing.
- **Tokens only.** Every color is a token in `client/src/app.css`, with its night value under `:root.night-theme`; no hex in components. Night has no green and no shadows; text keeps WCAG AA in both themes. Fraunces for headings, big numbers and primary buttons, Nunito Sans (600–800) for the rest. Thin-stroke inline SVG icons (1.7px), no emoji. Match the mockups: https://claude.ai/artifact/JxGTeQYmZo3M7Pds4MbMMz
- **Fast.** Launch comes entirely from the cache and never waits on the network, online or off: the shell, self-hosted woff2 fonts and icons are precached. No component libraries. Timers render `now − Start`/`ActiveSince` on one 1s tick, never accumulated. Transitions use transforms, ≤180ms. `touch-action: manipulation`; `env(safe-area-inset-*)` padding.

## Layout

```
/client   PWA: Vite + Svelte 5 + TypeScript, Dexie (IndexedDB), vite-plugin-pwa
/server   Benevia Core API (.NET 10, PostgreSQL, OData). Builds the client into Ned.API/wwwroot and serves it
/tools    nara-import: one-time import of a Nara CSV export (columns and mapping in nara.ts), reusing client/src/lib
```

## Data

Server entities and Dexie tables have the same shape (fields in `client/src/lib/db.ts`). Every row: `Guid` (**made on the phone**), `ModifiedAt` (**stamped by the server** on every save), `Deleted` (not `IsDeleted`, which collides with Core), `LoggedBy` (parent's user name; "Nara" for imports), `Family` (**stamped by the server** on create; phones never send or read it). Times are UTC instants, shown in the device's zone; on the phone they are epoch ms and rows carry a `dirty` edit stamp.

- **Event** is one table for Sleep, NightWaking, Feed, Solids and Note. `End = null` means a timer is running.
- **A night is one Sleep** (`IsNight`) from bedtime to morning; NightWakings overlap it and must stay inside it (`updateSleep` and `deleteEvent` keep them there). Night sleep = its length − wakings. `IsNight` is set when the sleep starts, from Settings' night range, and changes only in the Day view's edit sheet.
- **Food** is upserted on the phone when a Solids event is saved. Its `Guid` is a UUIDv5 of the lower-cased name in the family's Guid, so both phones adding "Mango" offline write the same row. `Foods` on an event is a string[] on the phone, one name per line on the server.
- **Settings** is one row per family, `Guid` = the family's. A new field needs a Core `PropertyAdded` upgrade that also stamps `ModifiedAt`, so phones pull it.
- **Family/Member** aren't synced: a phone reads its family once (`GET /api/Family`) after signing in. The first family's Guid is `firstFamily` in `client/src/lib/ids.ts` (its foods kept their Guids).

## Sync

The client owns an outbox; the server is a dumb, reliable store (`client/src/lib/sync.ts`).

1. **Push:** 1s after a write, on open, on becoming visible, every 60s. All dirty rows go in one OData `$batch`: PATCH each, then POST the ones that 404 (Core has no upsert). Clear `dirty` unless the row changed mid-push; on failure keep it and back off.
2. **Pull:** `GET /api/<Entity>?$select=<all fields>&$filter=ModifiedAt ge {cursor − 60s}` (Core returns only `Guid` without `$select`). The overlap catches saves that commit late.
3. **Deletes are soft.** ⚠️ There is deliberately **no** server filter on `Deleted`, so deletions reach the other phone. Filter on the phone.
4. **Last write wins** by server `ModifiedAt`.
5. **Family first:** the first sync after signing in reads the family before pushing; a guest's foods move to the family's Guids, and its settings if the family has none. Until then rows key to `firstFamily`.
6. **Isolation is the server's job:** `ParentsBL` row filters limit reads to the parent's family, `FamiliesBL` rejects saves into another family, parents can't hard-delete, and every account sets `HasFullAccess = false`.

## Auth

Core's built-in login (`POST /api/auth/signin`, `/api/auth/refresh`), not its OAuth (that's only for MCP). Read the framework's auth code for exact shapes.

- Access token in memory only. The refresh token comes in the JSON body, so it lives in IndexedDB; the server sends a strict CSP with no third-party scripts, and app and API share one origin. Ask for a ~90-day refresh lifetime, extended on use.
- Before a sync with no valid access token, refresh silently; on a 401, refresh once and retry once.
- **Never spend a refresh token without hearing back.** Each works once. The server sleeps when idle, so wake it first with `HEAD /api/$metadata`; never abort a refresh, and an app update waits for one before reloading. Only a 401 from the refresh means signing in again (re-read the stored token first, in case another copy refreshed); anything else retries like a sync error.
- Sign-up is `POST /api/signup` (`Families/SignUpController.cs`): a new family, or a membership with an invite code. Then the phone signs in as usual.
- When refresh fails the app keeps working offline and shows "Sign in to sync". Signing in never touches local data. Signing out clears tokens only (keeping the family the rows are keyed to) and asks before clearing local data.
- Guest mode (`guest` meta flag) syncs nothing until the parent signs in from Settings.

## MCP

`server/Ned.API/Mcp/NedMcp.cs` wires Core's MCP server and OAuth, on only when `OAuth:Secret` is set (outside Development `OAuth:PublicOrigin` too).

- The tools call `/api` over loopback; a wildcard listen address becomes `0.0.0.0`, because Azure's container has no IPv6 loopback.
- Consent is `/oauth/consent` (`Mcp/consent.html` + `consent.js`): read, and write if left checked, never delete. The service worker must not answer `/connect/` or `/oauth/` navigations.
- **Phone logic stays on the phone.** The server only fills what an app can't: `LoggedBy` when empty, `Family` on create, and Food counts for Solids logged by a connected app.
- `NedMcp.AppInstructions` is cut with Core's rules at 2,048 bytes, so keep it under ~800.

## Sleep logic

All client-side, in `client/src/lib/sleep.ts`. Awake time = now − end of the last sleep. The target is Settings' wake window before a nap, or before bed once the day's naps are done or another nap can't fit before bedtime; a nap's window is ± 10 min, and bedtime is the bedtime setting. A night shows in Day on the morning it ends (on today while it runs, without counting toward today). Missed logging reaches back at most a day.

## Tests

- `client/src/**/*.test.ts` (Vitest) for `lib/`.
- `client/e2e/` (Playwright, in CI): real screens in a phone-sized Chromium, starting Sunday Oct 18 2026, 1 PM (America/Chicago) on a fake clock with three days of history seeded as a guest; `app.wait(minutes)` moves the clock. When a screen changes on purpose, change its flow; when a bug is fixed, add one.
- `npm run e2e:screens` saves every screen in day and night colors to `client/e2e/screens/`. Look them over after a UI change.
