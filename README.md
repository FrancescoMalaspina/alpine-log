# Alpine Log

A shared map of crags and routes (sport climbing, multipitch, alpinism, ice
climbing, ski mountaineering) with a personal logbook. Anyone can browse the
map; signed-in users log their own visits, which stay private unless they're
marked public. Admins can see everything.

- **Macroareas** group places: e.g. the route *Raggio di sole* lies in the area
  *Albard*. Each crag or route is its own place with parking, a start point
  (attacco), grade, altitude and elevation gain.
- **Attachments** on a place or area: pasted guide links, uploaded PDF guides
  and GPX approach tracks. GPX tracks are drawn on the map, with distance and
  ascent worked out from the file.
- **Phones** get their own layout: Map/List tabs, a bottom bar with "add here"
  (GPS), and full-screen panels and forms.

```
web/        React + TypeScript + Vite frontend (Leaflet map, supabase-js)
supabase/   Postgres schema, row level security, tests, local config
scripts/    one-off import of the legacy crags.js into the database
crags.js    legacy data file (source for the import); the root index.html,
            map.js, crag-form.js, visit-form.js and styles.css are the old
            static app, kept for reference
```

## How permissions work

There is no custom backend: the browser talks to Supabase directly with the
public *publishable* key, and Postgres row level security decides what each
request may read or write (`supabase/migrations/`).

| Data | Who can read | Who can write |
|---|---|---|
| areas, places, sectors | everyone, signed in or not | any signed-in user adds; the creator or an admin edits |
| attachments (links, GPX, PDF) | everyone (files sit in the public `place-files` bucket) | any signed-in user adds; the uploader or an admin removes |
| visits, their routes and partners | the owner, everyone if public, admins | the owner (admins may delete) |
| climbing-partner list | the owner, plus names on visits you can read | the owner |
| profiles (username, role) | everyone | own username only; the role changes only via SQL |

A place holding someone else's visits can only be deleted by an admin, because
deleting it deletes every visit there. Uploads go to `<user id>/…` in the
bucket, and storage policies only allow `.gpx` and `.pdf` files, up to 20 MB,
in your own folder.

## Run it locally

Needs Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```sh
supabase start            # Postgres, Auth, Storage and Studio in Docker
supabase db reset         # apply migrations + seed (re-run any time to start fresh)
supabase test db          # RLS and function tests

cd web
npm install
npm run dev:local         # http://localhost:5173 against the local stack
```

The ports in `supabase/config.toml` are shifted by +100 (API on 54421, Studio
on http://127.0.0.1:54423, emails in Mailpit on http://127.0.0.1:54424) so this
stack can run next to another Supabase project.

The local seed imports `crags.js` and creates two accounts (password
`climbing123`):

- `admin@example.com` → username `fra`, admin, owns all imported visits (private)
- `friend@example.com` → username `vale`, regular user with no data

Places in `crags.js` that had multipitch routes pinned inside them become an
area holding the original place plus one place per route (Albard → Ozzy,
Rocca di Baiedo → Solitudine).

To try the phone layout on your phone, run `npm run dev:local -- --host`, then
open the printed network URL. Note that phones only allow GPS on `localhost` or
HTTPS, so "add at my location" works on the deployed site but not over the LAN.

After changing the schema, regenerate the TypeScript types with
`npm run gen:types` (from `web/`).

## Hosted Supabase

`web/.env` points `npm run dev` / `npm run build` at the hosted project.

1. **Link the project.** Use an access token for the account that owns the
   project, so your other CLI login stays untouched
   (Dashboard → Account → Access Tokens):

   ```sh
   export SUPABASE_ACCESS_TOKEN=sbp_...   # personal account
   supabase link --project-ref xrzfickyfupvhlnpniyr
   ```

2. **Push the schema.** Don't use `--include-seed`, because `seed.sql` creates
   the local test accounts. The migrations also create the public storage
   bucket `place-files` and its upload policies.

   ```sh
   supabase db push --dry-run   # review
   supabase db push
   ```

3. **Auth settings.** Dashboard → Authentication → URL Configuration: set
   *Site URL* to where the app runs (`http://localhost:5173` for now) and add it
   to *Redirect URLs*. Confirmation and password-reset emails link there.

4. **Create your account.** Run `cd web && npm run dev`, sign up, and click
   the confirmation email.

5. **Import your logbook and make yourself admin:**

   ```sh
   node scripts/import-crags.mjs --owner you@example.com > /tmp/import.sql
   supabase db query --linked -f /tmp/import.sql
   supabase db query --linked "update public.profiles set role = 'admin' where username = 'your-username'"
   ```

   The import refuses to run if the `places` table isn't empty, and it imports
   every visit as private. Pass `--visibility public` to publish them all.

## Grades

`public.grade_rank()` turns French (`6b+`) and UIAA (`VI-`) grades into one
sortable number. The visits filter "hardest route ≥" uses it. Its French half
is mirrored in `web/src/lib/grades.ts`; keep the two in sync
(`supabase/tests/grades.test.sql`).
