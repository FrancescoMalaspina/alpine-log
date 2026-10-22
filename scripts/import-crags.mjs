#!/usr/bin/env node
/*
 * Turns the legacy crags.js (CRAGS + PEOPLE) into SQL for the Supabase schema.
 *
 *   node scripts/import-crags.mjs --owner you@example.com [--visibility private|public] > import.sql
 *   node scripts/import-crags.mjs --local > supabase/seed.sql
 *
 * --owner   every visit and partner is assigned to this existing auth user
 * --local   also creates two local test accounts (admin + regular user) and
 *           imports as the admin; only meant for `supabase db reset`
 *
 * Legacy entries are mapped onto Area → Spot → Visit with the same rules as
 * private.convert_route_spots() in the 20261012120000 migration:
 *   - a spot has one activity (the most specific of the legacy types);
 *   - multipitch routes pinned inside a legacy place become spots in an area
 *     named after that place;
 *   - a route-type place (multipitch/alpine/ice/ski) with named routes logged
 *     becomes an area with one spot per route; each visit goes to the spot of
 *     the route it logged, and the place itself only remains if a visit logged
 *     no named route.
 *
 * The generated SQL refuses to run if the places table is not empty, so it
 * can't create duplicates by being run twice.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const local = args.includes('--local');
const visibility = arg('--visibility') ?? 'private';
const source = arg('--source') ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'crags.js');

const LOCAL_ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com', username: 'fra' };
const LOCAL_USER  = { id: '22222222-2222-4222-8222-222222222222', email: 'friend@example.com', username: 'vale' };
const LOCAL_PASSWORD = 'climbing123';

const owner = local ? LOCAL_ADMIN.email : arg('--owner');
if (!owner) {
  console.error('Usage: import-crags.mjs --owner <email> [--visibility private|public] | --local');
  process.exit(1);
}
if (!['private', 'public'].includes(visibility)) {
  console.error('--visibility must be private or public');
  process.exit(1);
}

// crags.js is a plain script declaring two consts; evaluate it in isolation.
const { CRAGS, PEOPLE } = new Function(`${readFileSync(source, 'utf8')}\n;return { CRAGS, PEOPLE };`)();

const q = v => (v === undefined || v === null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = v => (v === undefined || v === null || Number.isNaN(+v) ? 'null' : String(+v));
const textArray = arr => `array[${(arr ?? []).map(q).join(', ')}]::text[]`;
const asArray = v => (Array.isArray(v) ? v : v ? [v] : []);
const routeKey = r => (r.name ?? '').trim().toLowerCase();
const minStr = xs => xs.filter(x => x != null && x !== '').sort()[0];

// ---------------------------------------------------------------- build the model
const ROUTE_ACTS = ['alpine', 'ice', 'ski', 'multipitch'];
const PRIORITY = ['alpine', 'ice', 'ski', 'multipitch', 'crag'];
/** Legacy crags that are boulder fields, as in the 20261014110000 migration. */
const BOULDER_RE = /\b(blocchi|boulder|bouldering)\b/i;

const areas = new Map();   // lower(name) -> { name, description, lat, lng, links }
const spots = [];          // { area, name, activity, lat, lng, parking, start, rock, exposition, description, grade, sectors, links, visits }

function areaFor(name, src, withDescription) {
  const key = name.toLowerCase();
  if (!areas.has(key)) {
    areas.set(key, { name, description: withDescription ? src.description : undefined, lat: src.lat, lng: src.lng, links: [] });
  }
  return areas.get(key);
}

for (const c of [...CRAGS].sort((a, b) => a.name.localeCompare(b.name))) {
  const types = asArray(c.type).length ? asArray(c.type) : ['crag'];
  const routeAct = ROUTE_ACTS.find(t => types.includes(t));
  const links = /^https?:\/\//i.test(c.link ?? '') ? [c.link] : [];
  const parent = {
    area: null, name: c.name, activity: PRIORITY.find(t => types.includes(t)),
    lat: c.lat, lng: c.lng, parking: [c.parkingLat, c.parkingLng], start: [],
    rock: c.rock, exposition: asArray(c.exposition), description: c.description,
    sectors: c.sectors ?? [], links, visits: [],
  };
  if (parent.activity === 'crag' && BOULDER_RE.test(c.name)) parent.activity = 'boulder';
  const inArea = [];   // spots created in this entry's area

  if (c.multipitchRoutes?.length) {
    parent.area = areaFor(c.name, c, false);
    for (const r of c.multipitchRoutes) {
      inArea.push({
        area: parent.area, name: r.name || `${c.name} route`, activity: 'multipitch',
        lat: r.lat ?? c.lat, lng: r.lng ?? c.lng, parking: [], start: [r.lat, r.lng],
        rock: c.rock, exposition: asArray(c.exposition), sectors: [], links: [], visits: [],
      });
    }
  }

  const visits = [...(c.visits ?? [])]
    .map(v => ({ ...v, routes: v.routes ?? [] }))
    .sort((a, b) => (a.date ?? '￿').localeCompare(b.date ?? '￿'));

  if (!routeAct || !visits.some(v => v.routes.some(routeKey))) {
    parent.visits = visits;
  } else {
    parent.area ??= areaFor(c.name, c, true);
    for (const v of visits) {
      const keys = [...new Set(v.routes.map(routeKey).filter(Boolean))];
      if (!keys.length) { parent.visits.push(v); continue; }
      keys.forEach((k, i) => {
        const group = v.routes.filter(r => routeKey(r) === k);
        let spot = inArea.find(s => s.name.toLowerCase() === k);
        if (!spot) {
          spot = {
            area: parent.area, name: minStr(group.map(r => r.name.trim())), activity: routeAct,
            lat: c.lat, lng: c.lng, parking: parent.parking, start: [],
            rock: c.rock, exposition: asArray(c.exposition), grade: minStr(group.map(r => r.grade)),
            sectors: [], links: [], visits: [],
          };
          inArea.push(spot);
        }
        // The first route takes the visit, with any unnamed routes; each other route gets a copy.
        const routes = i === 0 ? v.routes.filter(r => !routeKey(r) || routeKey(r) === k) : group;
        spot.visits.push({ ...v, routes });
      });
    }
    if (!parent.visits.length) {
      parent.area.links.push(...links);
      parent.area.description ??= c.description;
      parent.removed = true;
    } else {
      parent.activity = types.includes('crag') ? 'crag' : routeAct;
    }
  }
  if (!parent.removed) spots.push(parent);
  spots.push(...inArea);
}

// ---------------------------------------------------------------- emit SQL
const out = ['-- Generated by scripts/import-crags.mjs — do not edit by hand.'];

if (local) {
  out.push(`
-- Local test accounts (password: ${LOCAL_PASSWORD})
${[LOCAL_ADMIN, LOCAL_USER].map(u => `
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', '${u.email}',
        extensions.crypt('${LOCAL_PASSWORD}', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{"username":"${u.username}"}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '${u.id}', '${u.id}',
        jsonb_build_object('sub', '${u.id}', 'email', '${u.email}', 'email_verified', true),
        'email', now(), now(), now());`).join('\n')}

update public.profiles set role = 'admin' where id = '${LOCAL_ADMIN.id}';
`);
}

out.push(`do $import$
declare
  v_owner uuid := (select id from auth.users where email = ${q(owner)});
  pid bigint;
  vid bigint;
  aid bigint;
begin
  if v_owner is null then
    raise exception 'No auth user with email %. Sign up in the app first.', ${q(owner)};
  end if;
  if exists (select 1 from public.places) then
    raise exception 'places is not empty — import aborted to avoid duplicates';
  end if;

  insert into public.partners (owner_id, name)
  select v_owner, unnest(${textArray(PEOPLE)})
  on conflict do nothing;
`);

const areaId = a => `(select id from public.areas where name = ${q(a.name)})`;
for (const a of areas.values()) {
  out.push(`  insert into public.areas (created_by, name, description, lat, lng)
  values (v_owner, ${q(a.name)}, ${q(a.description)}, ${num(a.lat)}, ${num(a.lng)});`);
  for (const link of a.links) {
    out.push(`  insert into public.attachments (area_id, created_by, kind, title, url) values (${areaId(a)}, v_owner, 'link', 'Guide', ${q(link)});`);
  }
}
out.push('');

for (const s of spots) {
  // A crag is one spot with its sectors inside; each route climbed in one of
  // them names it. Same layout as the 20261025100000 migration gives existing data.
  const area = s.area ? areaId(s.area) : 'null';
  out.push(`  -- ${s.area ? `${s.area.name} / ` : ''}${s.name}
  insert into public.places (created_by, area_id, name, activity, lat, lng, parking_lat, parking_lng, start_lat, start_lng,
                             rock, exposition, description, grade)
  values (v_owner, ${area}, ${q(s.name)}, ${q(s.activity)},
          ${num(s.lat)}, ${num(s.lng)}, ${num(s.parking[0])}, ${num(s.parking[1])}, ${num(s.start[0])}, ${num(s.start[1])},
          ${q(s.rock)}, ${textArray(s.exposition)}, ${q(s.description)}, ${q(s.grade)})
  returning id into pid;`);
  for (const name of s.sectors) {
    out.push(`  insert into public.crag_sectors (place_id, name, created_by) values (pid, ${q(name)}, v_owner);`);
  }
  for (const link of s.links) {
    out.push(`  insert into public.attachments (place_id, created_by, kind, title, url) values (pid, v_owner, 'link', 'Guide', ${q(link)});`);
  }
  for (const v of s.visits) {
    out.push(`  insert into public.visits (user_id, place_id, date, visibility)
  values (v_owner, pid, ${v.date ? `${q(v.date)}::date` : 'null'}, ${q(visibility)})
  returning id into vid;`);
    // What was written about the visit is private: only its author reads it.
    if (v.summary || v.avvicinamento || v.discesa) {
      out.push(`  insert into public.visit_notes (visit_id, summary, approach, descent)
  values (vid, ${q(v.summary)}, ${q(v.avvicinamento)}, ${q(v.discesa)});`);
    }
    v.routes.forEach((r, i) => {
      // A route names its sector of the crag; one whose sector the crag hasn't
      // got keeps the sector's name in its comment.
      const ownSector = r.sector && s.sectors.includes(r.sector);
      const comment = r.sector && !ownSector ? [r.comment, `(sector: ${r.sector})`].filter(Boolean).join(' ') : r.comment;
      const sector = ownSector ? `(select id from public.crag_sectors where place_id = pid and name = ${q(r.sector)})` : 'null';
      out.push(`  insert into public.ascents (visit_id, crag_sector_id, name, grade, position)
  values (vid, ${sector}, ${q(r.name)}, ${q(r.grade)}, ${i})${comment ? `
  returning id into aid;
  insert into public.ascent_notes (ascent_id, comment) values (aid, ${q(comment)})` : ''};`);
    });
    if (v.with?.length) {
      out.push(`  insert into public.visit_partners (visit_id, partner_id)
  select vid, p.id from public.partners p where p.owner_id = v_owner and p.name = any(${textArray(v.with)});`);
    }
  }
  out.push('');
}

out.push(`  raise notice 'Imported % spots in % areas and % visits',
    (select count(*) from public.places), (select count(*) from public.areas), (select count(*) from public.visits);
end
$import$;`);

console.log(out.join('\n'));
