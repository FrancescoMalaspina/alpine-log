# Alpine Log

A shared map of climbing and mountain spots (crags, multipitch, alpinism, ice
climbing, deep water solo, indoor climbing, ski mountaineering, hiking, trail
running) with a personal logbook. Anyone can browse the
map; signed-in users log their own visits, which stay private unless they're
marked public. Admins can see everything.

- **Area → Spot → Visit.** An *area* is a geographic bucket (Albard,
  Grignetta, Valsassina). A *spot* is one thing you go to, with exactly one
  activity: a crag, a multipitch route, an icefall, a trail, a gym. A *visit*
  is one time someone went there; spots can be visited again and again. (In
  the database, spots are the `places` table.)
- **Spots** have parking, a start point (attacco), grade, altitude, elevation
  gain and distance where they make sense for the activity.
- **Routes** at crags, deep water solo and gyms are logged as free text. A spot
  can also have a shared route list that anyone can add to: a logged route
  with a listed name is linked to it, so repeats are counted.
- **Attachments** on a place or area: pasted guide links, uploaded PDF guides
  and GPX approach tracks. GPX tracks are drawn on the map, with distance and
  ascent worked out from the file.
- **Search** finds your places and also mountains, huts and villages
  (OpenStreetMap, via the free [Photon](https://photon.komoot.io) geocoder);
  a found location can become a new place in one click.
- **My logbook** shows each user's visits with totals per activity and year,
  and downloads them as CSV (one row per route), JSON (full backup) or GPX
  (visited places as waypoints).
- **Import** (My logbook → Import visits) reads Excel/ODS/CSV/JSON files in any
  layout: see [Importing logbooks](#importing-logbooks).
- **Photos** on places (public) and on visits (only visible to whoever can
  see the visit). The browser shrinks each photo to a ~2000 px display copy
  plus a thumbnail before uploading (a few hundred KB instead of several MB),
  which also strips EXIF data such as GPS position.
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
| areas, spots, sectors, route lists | everyone, signed in or not | any signed-in user adds; the creator or an admin edits |
| attachments (links, GPX, PDF) | everyone (files sit in the public `place-files` bucket) | any signed-in user adds; the uploader or an admin removes |
| visits, their routes and partners | the owner, everyone if public, admins | the owner (admins may delete) |
| climbing-partner list | the owner, plus names on visits you can read | the owner |
| wishlist (places you want to go to) | the owner, everyone if public, admins | the owner (admins may delete); a visit there ticks it off |
| profiles (username, role) | everyone (emails: admins only, via `list_users()`) | own username; admins rename, delete and change roles of others from *Account → Users*, never their own role |

Files live in Supabase Storage (S3-compatible, same project):

| Bucket | Public | Holds |
|---|---|---|
| `place-files` | yes | GPX tracks and PDF guides |
| `place-photos` | yes | photos of places |
| `visit-photos` | no, signed URLs valid for 1 h | photos of visits, readable exactly when the visit is |

The free plan has about 1 GB of file storage: roughly 2,500 photos at the
sizes above. Check usage under Dashboard → Storage.

A place holding someone else's visits can only be deleted by an admin, because
deleting it deletes every visit there. Uploads go to `<user id>/…` in the
bucket, and storage policies only allow `.gpx` and `.pdf` files, up to 20 MB,
in your own folder.

Deleting an account (yourself from *Account*, or an admin from *Account → Users*)
removes that user's visits, photos, attachments, imports, wishlist and their
storage files. Spots, areas and routes they added stay, without an owner, so
only admins can edit them afterwards. The last admin can't be deleted.

## Run it locally

Needs Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```sh
supabase start            # Postgres, Auth, Storage and Studio in Docker
supabase db reset         # apply migrations + seed (re-run any time to start fresh)
supabase test db          # RLS and function tests
(cd web && npm test)      # import parsing and mapping (vitest)

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

   That first admin is set with SQL; after that, admins promote others from
   *Account → Users* (click your username in the header, or the account sheet on phones).

   The import refuses to run if the `places` table isn't empty, and it imports
   every visit as private. Pass `--visibility public` to publish them all.

## Importing logbooks

Users can import their own spreadsheets, whatever the columns are called. All
parsing runs in the browser (`web/src/lib/import/`); the database only sees the
final, reviewed result.

1. **Parse** (`parse.ts`): every sheet of a workbook (SheetJS, loaded on demand),
   a CSV, or the largest list of records in a JSON file becomes a plain table.
   Our own JSON backup (`alpine-log/v2`) skips the mapping step.
2. **Map** (`automap.ts`, `fields.ts`): each column is matched to a field by its
   header (synonyms in Italian, English, French, German, Spanish) and by its
   values (dates, grades, URLs, numbers). Columns like `Date (2)` become a second
   visit per row. The activity comes from the sheet name (`Falesie`, `Vie
   Lunghe`…) or an activity column. The user reviews every column, and the
   confirmed mapping is remembered in the browser for files with the same headers.
3. **Read values** (`transforms.ts`, `rows.ts`): `06/06/02026`, `N/A`,
   `Fra. Japo, Vale`, `5c, 6a (ok), 6a+ (no)` and so on. Columns with no field of
   their own are kept in the visit notes as `Column: value`.
4. **Place spots** (`resolve.ts`): `match_places()` (pg_trgm) suggests existing
   spots with similar names. New spots get a pin from Photon, using the town,
   area or name, and searching near the spots already known. The user checks the
   pins on a map and can drag them.
5. **Save**: `import_logbook()` writes everything in one transaction through
   `save_place`/`save_visit`. It skips visits the user already has (same spot
   and day), and records the import so it can be undone from the logbook. Undo
   deletes the imported visits; spots stay, because they are shared.

### AI column mapping (optional)

The column step has a *Suggest with AI* button. It calls the Edge Function
`supabase/functions/import-assist`, which asks Google Gemini to map the columns.
The function sends only headers and five example rows per sheet, with partner
names hidden by default. On Gemini's free tier, Google may use prompts to
improve its models, and the wizard says so next to the button. Each signed-in
user gets 10 calls per hour per function instance. When Gemini's free quota
runs out, the button reports it and the manual mapping still works.

```sh
# key from https://aistudio.google.com/apikey
echo "GEMINI_API_KEY=..." > supabase/functions/.env.local      # gitignored
supabase functions serve import-assist --env-file supabase/functions/.env.local

# hosted, by hand (needs SUPABASE_ACCESS_TOKEN of the project owner)
supabase secrets set GEMINI_API_KEY=...         # optionally GEMINI_MODEL=...
supabase functions deploy import-assist
```

The key can also be added in the dashboard (Edge Functions → Secrets).
`.github/workflows/deploy-functions.yml` deploys every function under
`supabase/functions/` on each push to `main` that changes them (or by hand from
the Actions tab). It needs the repository secret `SUPABASE_ACCESS_TOKEN`
(Account → Access Tokens, from the account that owns the project) and reads the
project ref from the `VITE_SUPABASE_URL` variable. If the repository also has a
`GEMINI_API_KEY` secret, the workflow copies it to Supabase; without one, the
secret already set in Supabase stays as it is.

`GEMINI_MODEL` defaults to `gemini-2.5-flash`. All the Gemini code is in one
function, `proposeMapping()`, so another provider can replace it there.

## Grades

`public.grade_rank()` turns French (`6b+`) and UIAA (`VI-`) grades into one
sortable number. The visits filter "hardest route ≥" uses it. Its French half
is mirrored in `web/src/lib/grades.ts`; keep the two in sync
(`supabase/tests/grades.test.sql`).

## Publishing (GitHub Pages)

The site is published at **https://francescomalaspina.github.io/alpine-log/**
by `.github/workflows/deploy.yml` on every push to `main` that touches `web/`
(or by hand from the Actions tab).

One-time setup in the GitHub repository:

1. **Actions** tab: enable workflows (GitHub disables them on forks).
2. **Settings → Pages → Build and deployment → Source**: *GitHub Actions*.
3. **Settings → Secrets and variables → Actions → Variables**: add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, with the same
   values as `web/.env`. They're public, so variables rather than secrets.
4. In Supabase → Authentication → URL Configuration, set the *Site URL* to
   `https://francescomalaspina.github.io/alpine-log/` and add it to
   *Redirect URLs*, so confirmation and reset emails open the live site.

`.github/workflows/keep-supabase-awake.yml` reads one row twice a week, so the
free Supabase project doesn't pause after a week without visitors.
