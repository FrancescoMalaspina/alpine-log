// Suggests how the columns of an imported spreadsheet map onto the app's
// fields, using Gemini (free tier from Google AI Studio). The browser sends
// only headers and a few sample rows; it reviews whatever comes back.
//
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional).
// Local:   supabase functions serve import-assist --env-file supabase/functions/.env.local
// Deploy:  supabase secrets set GEMINI_API_KEY=... && supabase functions deploy import-assist
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
const ACTIVITIES = ['crag', 'multipitch', 'alpine', 'ice', 'ski', 'trail', 'hike', 'dws', 'indoor'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Field = { id: string; label: string };
type Sheet = { name: string; headers: string[]; samples: string[][] };
type Input = { fields: Field[]; sheets: Sheet[] };
export type Proposal = {
  sheets: {
    name: string;
    activity: string;
    date_order: 'dmy' | 'mdy';
    columns: { index: number; field: string; group: number }[];
  }[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------- throttle
// Per user, per function instance: enough to keep one person from using up
// the free quota for everyone.
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
const calls = new Map<string, number[]>();

function allowed(userId: string): boolean {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  calls.set(userId, [...recent, now]);
  return true;
}

// ---------------------------------------------------------------- input limits
const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n);

function clean(body: unknown): Input | null {
  const b = body as Partial<Input> | null;
  if (!b || !Array.isArray(b.fields) || !Array.isArray(b.sheets)) return null;
  return {
    fields: b.fields.slice(0, 50).map(f => ({ id: cut(f.id, 40), label: cut(f.label, 80) })),
    sheets: b.sheets.slice(0, 10).map(s => ({
      name: cut(s.name, 60),
      headers: (s.headers ?? []).slice(0, 60).map(h => cut(h, 80)),
      samples: (s.samples ?? []).slice(0, 5).map(r => (r ?? []).slice(0, 60).map(c => cut(c, 120))),
    })),
  };
}

// ---------------------------------------------------------------- the model
const PROMPT = `You map the columns of a user's climbing/mountaineering logbook spreadsheet onto an app's fields.
Data model: an AREA (geographic group) contains SPOTS (one crag, one multipitch route, one alpine climb, one icefall, a trail...);
a VISIT is one day someone went to a spot, with partners and the routes climbed (ascents).
For each sheet:
- activity: what kind of spots the sheet lists (${ACTIVITIES.join(', ')}), or "unknown" if a column gives it per row or you can't tell.
  multipitch = long rock routes (vie lunghe), alpine = mountaineering/snow/mixed, crag = single-pitch sport crags (falesie).
- date_order: "dmy" unless dates are clearly month-first.
- columns: one entry per header, by 0-based index. field must be one of the given field ids.
  Use "note" for anything useful without a matching field (it is kept as text), "ignore" for row numbers and empty columns.
  group is 0, except for repeated visit columns such as "Date (2)", "Partners (2)": group 1 (then 2, ...), same field as the original.
  Spot-level fields describe the place; visit-level fields describe one day there. At most one column per field per group,
  except note, ignore and link.
Headers may be in any language (often Italian, French, German).`;

function schema(fieldIds: string[]) {
  return {
    type: 'OBJECT',
    properties: {
      sheets: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            activity: { type: 'STRING', enum: [...ACTIVITIES, 'unknown'] },
            date_order: { type: 'STRING', enum: ['dmy', 'mdy'] },
            columns: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  index: { type: 'INTEGER' },
                  field: { type: 'STRING', enum: fieldIds },
                  group: { type: 'INTEGER' },
                },
                required: ['index', 'field', 'group'],
              },
            },
          },
          required: ['name', 'activity', 'date_order', 'columns'],
        },
      },
    },
    required: ['sheets'],
  };
}

class QuotaError extends Error {}

/** The one provider-specific function: swap it to use another model. */
async function proposeMapping(input: Input, apiKey: string): Promise<Proposal> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{
        role: 'user',
        parts: [{ text: JSON.stringify({
          fields: input.fields,
          sheets: input.sheets.map(s => ({ name: s.name, headers: s.headers.map((h, i) => `${i}: ${h}`), sample_rows: s.samples })),
        }) }],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: schema(input.fields.map(f => f.id)),
      },
    }),
  });
  if (res.status === 429) throw new QuotaError('quota');
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned no answer');
  return JSON.parse(text) as Proposal;
}

/** Drops anything that doesn't fit the input: unknown fields, out-of-range columns, odd groups. */
function validate(p: Proposal, input: Input): Proposal {
  const ids = new Set(input.fields.map(f => f.id));
  return {
    sheets: input.sheets.map((s, si) => {
      const got = p.sheets?.find(x => x.name === s.name) ?? p.sheets?.[si];
      const columns = s.headers.map((_, i) => {
        const c = got?.columns?.find(x => x.index === i);
        return c && ids.has(c.field)
          ? { index: i, field: c.field, group: Math.max(0, Math.min(9, Math.trunc(c.group ?? 0))) }
          : { index: i, field: 'note', group: 0 };
      });
      return {
        name: s.name,
        activity: ACTIVITIES.includes(got?.activity ?? '') ? got!.activity : 'unknown',
        date_order: got?.date_order === 'mdy' ? 'mdy' : 'dmy',
        columns,
      };
    }),
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'The AI helper is not set up (GEMINI_API_KEY missing).' }, 503);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Sign in first' }, 401);
  if (!allowed(user.id)) return json({ error: 'Too many requests, try again later.' }, 429);

  const input = clean(await req.json().catch(() => null));
  if (!input || !input.sheets.length || !input.fields.length) return json({ error: 'Nothing to map' }, 400);

  try {
    return json(validate(await proposeMapping(input, apiKey), input));
  } catch (e) {
    if (e instanceof QuotaError) return json({ error: 'The free AI quota is used up for now.' }, 429);
    console.error(e);
    return json({ error: 'The AI helper failed.' }, 502);
  }
});
