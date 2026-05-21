---
description: Reference for RUDY's Firebase Realtime Database schema, region, and auth-based rules pattern. Use when reading from or writing to Firebase, adding a new field to records/employees/announces, debugging "data not saving", inspecting Firebase rules, working with curUser.id, or modifying the saveRec/renderHistory paths. Documents the asia-southeast1 region, the auth-UID-as-key convention, all known nodes, and the exact records schema (empId / date / checkInTs / otMin etc) so new code matches the existing read paths and timezone handling.
---

# RUDY Firebase RTDB — schema and rules reference

## Project

- **Project ID**: `timetrack-63654`
- **Region**: `asia-southeast1` (Singapore — chosen for Israeli team latency)
- **Auth**: Firebase Auth, email/password. `curUser.id` is the Auth UID and is reused as the key in `employees/{uid}`.
- **Rules**: auth-based (not public). Every read/write goes through the user's authenticated UID. RUDY has never had open rules and shouldn't start.

## Nodes

| Node | Purpose | Key |
|---|---|---|
| `employees` | Profile per user | Auth UID |
| `records` | Daily check-in/out logs | push() ID |
| `announces` | Admin announcements | push() ID |
| `editlogs` | Audit trail for record edits | push() ID |
| `loginlogs` | Login event log | push() ID |
| `photos` | Profile photos (base64) | UID |
| `shared` | Shared/global app data | varies |
| `userdata` | Per-user app state | UID |
| `fcm_subs` | FCM push tokens | UID |
| `errorlogs` | Phase F health-check errors | push() ID |

## Records schema (exact field names)

This schema is referenced by `saveRec`, `renderHistory`, `renderSummary`, `renderStats`, `renderTeam`, the leaderboard, and the salary view. Writing a record without all required fields breaks at least one of those.

```ts
{
  empId:      string,    // Auth UID of the worker
  date:       string,    // "YYYY-MM-DD" in Israel time (NOT browser-local)
  checkIn:    string,    // "HH:MM" 24h, or "" if not yet checked in
  checkOut:   string,    // "HH:MM" or ""
  checkInTs:  number,    // epoch ms — used for OT calc and sorting
  checkOutTs: number,    // epoch ms
  isLate:     boolean,   // true if checkInTs > 06:00 Israel time cutoff
  otMin:      number,    // OT minutes (work past 16:30 Israel time)
  note:       string     // optional free text
}
```

## Timezone

Workers are in Israel — **IDT (UTC+3) in summer, IST (UTC+2) in winter**. The `date` field is the calendar date in *Israel* time, not the user's device. Late cutoff is 06:00 IDT; OT starts at 16:30 IDT. When deriving a date from a timestamp, convert through Israel time, not browser-local — early-morning check-ins land on the wrong day otherwise.

## Auth-based rule pattern

Reads/writes typically allow either:
- The owning user (`auth.uid` matches the `$uid` key in the path), or
- An admin (`employees/{auth.uid}/role == 'admin'`).

Some nodes (`announces`, `shared`) are readable by any authenticated user, writable only by admin. Don't add a node that requires public access.

## Common mistakes (each has caused a real bug)

- **Saving a record without `checkInTs`** — breaks OT calc and sort order.
- **Writing `date` from `new Date().toISOString().slice(0,10)`** without timezone conversion — wrong for early-morning check-ins where UTC date ≠ Israel date.
- **Pushing to `employees` instead of writing by UID** — creates duplicate ghost profiles.
- **Storing photos in `records`** instead of `photos` — bloats the records node and slows the realtime listener.

## When adding a new field

1. Update `saveRec` and any other write path.
2. Update every read path (search `record\.\w*`).
3. Bump version (rudy-deploy) — clients running the old code will read `undefined` for the new field and may crash a renderer.
4. Optionally backfill existing records via a one-off script.
