# Alpine Log

A shared map of climbing and mountain spots (crags, bouldering, multipitch,
alpinism, ice climbing, deep water solo, indoor climbing, ski mountaineering, hiking, trail
running) with a personal logbook. Anyone can browse the
map; signed-in users log their own visits, which stay private unless they're
marked public. What you write about a visit is always private; what others
should know goes in a tip on the spot. Admins moderate shared data but can't
read anyone's private visits, notes, wishes or tracks.

- **Area → Sector → Spot → Visit.** An *area* is a geographic bucket (Albard,
  Grignetta, Valsassina), the same for every sport. An optional *sector* groups
  spots inside an area: the wall a multipitch route is on (Parete di Pezol), the
  mountain an alpine route climbs (Breithorn), or a crag whose walls are its
  spots (Falesia di Civate). A *spot* is one thing you go to, with exactly one
  activity: a crag wall, a boulder field, a multipitch route, an icefall, a trail, a gym. A
  *visit* is one time someone went there; a day at a crag can log routes on
  several of its walls in one visit. (In the database, spots are the `places`
  table.)
- **Spots** have parking, a start point (attacco), grade, altitude, elevation
  gain and distance where they make sense for the activity.
- **Routes** at crags, boulders, deep water solo and gyms are logged as free text. A spot
  can also have a shared route list that anyone can add to: a logged route
  with a listed name is linked to it, so repeats are counted.
- **Attachments** on a place or area: pasted guide links, uploaded PDF guides
  and GPX tracks. A spot can have several tracks: the approach for climbing
  spots, the outing itself for ski touring, hiking, trail running, mountain
  biking and alpinism. Each track gets its own colour on the map; they can be switched on and off
  one by one and downloaded. Its numbers are worked out when it's saved, while
  the recording still has its times: distance, metres up and down, highest and
  lowest point, moving time and time spent going up. Each activity shows the
  ones that matter to it (climbing rate for ski touring and alpinism, pace for
  trail running, speed for mountain biking, the walk in at climbing spots), and the logbook adds up the
  km and metres climbed.
- **Spots from a track.** For ski touring, hiking, trail running, mountain
  biking and alpinism, the spot form loads a GPX, TCX or KML exported by Strava, Garmin
  Connect, OruxMaps, Komoot… and offers its summit (or start) as the pin, its
  start as the parking, the starting village, altitude, gain and distance; a
  visit logged with it takes the track's date and duration. The first or last
  metres can be cut off, and the track is saved on the spot as GPX without
  times or sensor data. On climbing spots the loaded track is the approach:
  its start is offered as the parking, its end as the pin and the attacco.
  Every value is filled in only when ticked, and stays editable. Logging a
  visit to an existing spot can load a track as well.
- **Tracks on visits.** A track loaded with a visit is saved on the spot and
  linked to the visit, which shows its numbers. A private visit's track is
  private too. Making the visit public shares the track on the spot for good:
  it stays public even if the visit goes private again, and the app asks
  first.
- **Search** (the list on the left) finds spots by their name or their area's
  or sector's, lists matching areas, and also mountains, huts and villages
  (OpenStreetMap, via the free [Photon](https://photon.komoot.io) geocoder);
  a found location can become a new place in one click. Filters include
  "only spots with public visits" and "only what's on the map". The list
  folds to a rail or spreads across the screen; "/" jumps to it.
- **My logbook** is where the activity is: each user's visits with totals per
  activity and year, its own search and filters (area, partner, dates,
  grade, activity), and the map shows only the spots of the visits listed.
  "Find a climber" opens someone else's logbook. It downloads as CSV (one
  row per route), JSON (full backup) or GPX (visited places as waypoints).
- **Partners** (Account → Partners) can be renamed, linked to a registered
  user, or merged when you gave one person two names.
- **Import** (My logbook → Import visits) reads Excel/ODS/CSV/JSON files in any
  layout: see [Importing logbooks](#importing-logbooks).
- **Photos** on places (public) and on visits (only visible to whoever can
  see the visit). The browser shrinks each photo to a ~2000 px display copy
  plus a thumbnail before uploading (a few hundred KB instead of several MB),
  which also strips EXIF data such as GPS position. A photo on a spot you
  can't edit waits for an admin before everyone sees it. A visit photo can
  move to its spot (never back), on the same terms.
- **Phones** get their own layout: Map/List tabs, a bottom bar with "add here"
  (GPS), and full-screen panels and forms; a logbook's "Show on map" shows
  its spots.

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
| areas, sectors, spots, route lists | everyone, signed in or not | any signed-in user adds; the creator or an admin edits |
| attachments (links, GPX, PDF) | everyone (files sit in the public `place-files` bucket); tracks of private visits only the uploader | any signed-in user adds; a track goes on a visit only if it's your visit; the uploader or an admin removes |
| photos | spot photos: everyone once an admin has approved them (before that, the uploader and admins); visit photos: whoever can read the visit | any signed-in user adds to a spot, reviewed unless they may edit it; the owner adds to a visit and may move it to its spot; the uploader or an admin removes |
| visits, their routes and partners | the owner, everyone if public | the owner (admins may delete) |
| visit notes (how it went, conditions, approach, descent, route comments) | only the owner, even on a public visit | the owner |
| tips on spots and sectors | everyone | any signed-in user posts, also from the visit form; the author edits; the author or an admin removes |
| climbing-partner list | the owner, plus names on visits you can read | the owner |
| wishlist (places you want to go to) | the owner, everyone if public | the owner (admins may delete); a visit there ticks it off |
| profiles (username, role) | everyone (emails: admins only, via `list_users()`) | own username; admins rename, delete and change roles of others from *Account → Manage users*, never their own role |

Files live in Supabase Storage (S3-compatible, same project):

| Bucket | Public | Holds |
|---|---|---|
| `place-files` | yes | GPX tracks and PDF guides |
| `visit-tracks` | no, signed URLs valid for 1 h | GPX tracks of private visits, readable by their uploader |
| `place-photos` | yes | photos of places |
| `visit-photos` | no, signed URLs valid for 1 h | photos of visits, readable exactly when the visit is |

The free plan has about 1 GB of file storage: roughly 2,500 photos at the
sizes above. Check usage under Dashboard → Storage.

A place holding someone else's visits can only be deleted by an admin, because
deleting it deletes every visit there. Uploads go to `<user id>/…` in the
bucket, and storage policies only allow `.gpx` and `.pdf` files, up to 20 MB,
in your own folder.

Deleting an account (yourself from *Account*, or an admin from *Account → Manage users*)
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
   *Account → Manage users* (click your username in the header, or the account sheet on phones).

   The import refuses to run if the `places` table isn't empty, and it imports
   every visit as private. Pass `--visibility public` to publish them all.

## Importing logbooks

Users can import their own spreadsheets, whatever the columns are called. All
parsing runs in the browser (`web/src/lib/import/`); the database only sees the
final, reviewed result.

1. **Parse** (`parse.ts`): every sheet of a workbook (SheetJS, loaded on demand),
   a CSV, or the largest list of records in a JSON file becomes a plain table.
   Our own JSON backup (`alpine-log/v2`, `v3`) skips the mapping step.
2. **Map** (`automap.ts`, `fields.ts`): each column is matched to a field by its
   header (synonyms in Italian, English, French, German, Spanish) and by its
   values (dates, grades, URLs, numbers). Columns like `Date (2)` become a second
   visit per row. The activity comes from the sheet name (`Falesie`, `Vie
   Lunghe`…) or an activity column. The user reviews every column, and the
   confirmed mapping is remembered in the browser for files with the same headers.
3. **Read values** (`transforms.ts`, `rows.ts`): `06/06/02026`, `N/A`,
   `Fra. Japo, Vale`, `5c, 6a (ok), 6a+ (no)` (each route's outcome: sent, not
   sent, onsight…), `6a+>5c` or `VI/V, A0` (hardest grade, mandatory grade, aid),
   `Sportiva`/`Trad`, a 1–5 rating, and so on. Columns with no field of their own
   are kept in the visit notes as `Column: value`. Notes stay private; a
   *Consigli* / *Tips* column becomes a public tip on the spot, dated to the visit.
   - **Sectors**: a *Settore* column is the spot's sector (the wall of a
     multipitch route). On a crag sheet whose name column is the crag
     (*Nome falesia*), the crag becomes the sector and *Settore* the spot.
     Alpine names like `Breithorn - via normale` are split into the mountain
     (sector) and the route (spot); the review step can undo that per spot.
   - Country and province come from the file (`TN` alone means Italy), or else
     from each new spot's pin.
4. **Place spots** (`resolve.ts`): existing spots with similar names are
   suggested, and preselected when almost certainly the same (see
   [Duplicates](#duplicates)). Areas of the file that look like existing ones
   are asked about. New spots get a pin from Photon, using the town,
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

## Duplicates

Names are compared the same way everywhere: accents, case and punctuation
don't count (`fold_name()` in SQL, `foldName()` in `web/src/lib/names.ts`).

- Saving a spot reuses an area or sector whose folded name is the same.
- `similar_places()` and `similar_areas()` (pg_trgm, plus distance for spots)
  find what may already exist. `web/src/lib/duplicates.ts` is the one place
  that calls them and decides when a match is almost certainly the same; the
  spot form, the import and the admins' list all go through it.
- The spot form suggests areas as you type, shows "did you mean…" for a new
  area, and lists similar spots under the name. It never blocks saving.
- Admins merge a spot or area into another (*Merge…* in the spot form and the
  area panel, or *Possible duplicates* on the users page): `merge_places()`
  and `merge_areas()` move everyone's visits, routes, photos, files, tips and
  wishlists, then delete the duplicate.

## Languages

The interface is in English and Italian. It starts in the browser's language
and the EN | IT switch in the header changes it; signed-in users keep their
choice on their profile (`profiles.language`), so it follows them to other
devices. Dates and numbers follow the same language.

All text lives in `web/src/i18n/`: `en/` is the source and `it/` must have the
same keys (TypeScript fails the build otherwise). Components read it with
`const { t } = useI18n()`; code outside components uses `tr()`. To add a
language, add a folder next to `en/` and `it/` and list it in `i18n/types.ts`.

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

## License

[GNU AGPL-3.0](LICENSE). You may use, change and host this code, but if you
run a modified version as a service, you must publish your source under the
same license.
