// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { trackLines } from './gpx';
import { readTrackFile, summarize, toGpx, trackStats, trackVisit, trimTrack, usefulTrackName, type TrackPoint3 } from './tracks';

// Three points ~1.1 km apart going north, climbing 1000 → 1500 → 1400 m, over 2 h 10 min.
const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="StravaGPX" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata><name>Pizzo dei Tre Signori</name></metadata>
 <trk><name>Afternoon Hike</name><trkseg>
  <trkpt lat="46.000" lon="9.500"><ele>1000</ele><time>2025-07-02T06:00:00Z</time></trkpt>
  <trkpt lat="46.010" lon="9.500"><ele>1500</ele><time>2025-07-02T07:00:00Z</time></trkpt>
  <trkpt lat="46.020" lon="9.500"><ele>1400</ele><time>2025-07-02T08:10:00Z</time></trkpt>
 </trkseg></trk>
</gpx>`;

const TCX = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
 <Activities><Activity Sport="Other"><Lap><Track>
  <Trackpoint><Time>2025-07-02T06:00:00Z</Time></Trackpoint>
  <Trackpoint><Time>2025-07-02T06:00:00Z</Time><Position><LatitudeDegrees>46.0</LatitudeDegrees><LongitudeDegrees>9.5</LongitudeDegrees></Position><AltitudeMeters>1000</AltitudeMeters></Trackpoint>
  <Trackpoint><Time>2025-07-02T07:00:00Z</Time><Position><LatitudeDegrees>46.01</LatitudeDegrees><LongitudeDegrees>9.5</LongitudeDegrees></Position><AltitudeMeters>1500</AltitudeMeters></Trackpoint>
 </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>`;

const KML = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
 <Document><name>Grignetta – cresta Cermenati</name>
  <Placemark><LineString><coordinates>
   9.5,46.0,1000 9.5,46.01,1500
   9.5,46.02,1400
  </coordinates></LineString></Placemark>
 </Document>
</kml>`;

const KML_TIMED = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
 <Document><Placemark><gx:Track>
  <when>2025-07-02T06:00:00Z</when><when>2025-07-02T09:00:00Z</when>
  <gx:coord>9.5 46.0 1000</gx:coord><gx:coord>9.5 46.01 1500</gx:coord>
 </gx:Track></Placemark></Document>
</kml>`;

describe('track files', () => {
  it('reads GPX with names, elevations and times', () => {
    const f = readTrackFile(GPX)!;
    expect(f.name).toBe('Pizzo dei Tre Signori');
    expect(f.segments[0]).toHaveLength(3);
    const s = summarize(f.segments)!;
    expect(s.distanceKm).toBeCloseTo(2.22, 1);
    expect(s.gainM).toBe(500);
    expect(s.maxEleM).toBe(1500);
    expect(s.highest).toMatchObject({ lat: 46.01 });
    expect(trackVisit(s)).toEqual({ date: '2025-07-02', hours: 2 });
  });

  it('reads TCX, skipping points without a position', () => {
    const f = readTrackFile(TCX)!;
    expect(f.segments[0]).toHaveLength(2);
    expect(summarize(f.segments)!.gainM).toBe(500);
  });

  it('reads KML lines and timed gx:Track', () => {
    const f = readTrackFile(KML)!;
    expect(f.name).toBe('Grignetta – cresta Cermenati');
    expect(f.segments[0].map(p => p.ele)).toEqual([1000, 1500, 1400]);
    const timed = readTrackFile(KML_TIMED)!;
    expect(trackVisit(summarize(timed.segments)!)).toEqual({ date: '2025-07-02', hours: 3 });
  });

  it('a track without elevations still has a distance', () => {
    const f = readTrackFile(GPX.replace(/<ele>\d+<\/ele>/g, ''))!;
    const s = summarize(f.segments)!;
    expect(s.gainM).toBeNull();
    expect(s.highest).toBeNull();
    expect(s.distanceKm).toBeGreaterThan(2);
  });

  it('rejects files that are not tracks', () => {
    expect(readTrackFile('<html><body>no</body></html>')).toBeNull();
    expect(readTrackFile('not xml at all <')).toBeNull();
    expect(readTrackFile('<gpx><wpt lat="1" lon="1"/></gpx>')).toBeNull();
  });

  it('trims metres from the start and the end', () => {
    const f = readTrackFile(GPX)!;
    expect(trimTrack(f.segments, 0, 0)).toBe(f.segments);
    expect(trimTrack(f.segments, 500, 0)[0].map(p => p.lat)).toEqual([46.01, 46.02]);
    expect(trimTrack(f.segments, 500, 500)).toEqual([]);
  });

  it('writes GPX without times, readable again', () => {
    const f = readTrackFile(GPX)!;
    const out = toGpx('A & B', f.segments);
    expect(out).not.toContain('<time>');
    expect(out).toContain('<name>A &#38; B</name>');
    expect(summarize(readTrackFile(out)!.segments)!.gainM).toBe(500);
    expect(trackLines(readTrackFile(out)!).lines[0]).toHaveLength(3);
  });

  it('ignores names apps give by default', () => {
    expect(usefulTrackName('Afternoon Hike')).toBeNull();
    expect(usefulTrackName('Escursione pomeridiana')).toBeNull();
    expect(usefulTrackName('2025-07-02 08:12')).toBeNull();
    expect(usefulTrackName(' Pizzo dei Tre Signori ')).toBe('Pizzo dei Tre Signori');
  });
});

// A point every minute, `metres` north of the last, at the given elevation.
const walk = (eles: number[], metres = 50, startMin = 0): TrackPoint3[] =>
  eles.map((ele, i) => ({ lat: 46 + (i * metres) / 111_195, lng: 9.5, ele, time: (startMin + i) * 60_000 }));

describe('track statistics', () => {
  it('adds up descent and the lowest point like the ascent', () => {
    const s = summarize(readTrackFile(GPX)!.segments)!;
    expect(s.lossM).toBe(100);
    expect(s.minEleM).toBe(1000);
  });

  it('counts moving and uphill minutes, not pauses', () => {
    // 10 min up, a 20 min stop at the top (one point, then the next a long gap later), 5 min down.
    const up = walk([1000, 1010, 1020, 1030, 1040, 1050, 1060, 1070, 1080, 1090, 1100]);
    const down = walk([1100, 1080, 1060, 1040, 1020, 1000], 50, 30).map(p => ({ ...p, lat: p.lat + 0.01 }));
    const s = summarize([[...up, ...down]])!;
    expect(s.movingMs).toBe(15 * 60_000);
    expect(s.uphillMs).toBe(10 * 60_000);
    expect(s.endTime! - s.startTime!).toBe(35 * 60_000);
  });

  it('standing still is not moving, a slow bootpack is', () => {
    expect(summarize([walk([1000, 1000, 1001, 1000], 2)])!.movingMs).toBe(0);
    expect(summarize([walk([1000, 1005, 1010, 1015], 2)])!.uphillMs).toBe(3 * 60_000);
  });

  it('stores whole metres and seconds, and no times for an untimed track', () => {
    const timed = trackStats(readTrackFile(GPX)!.segments)!;
    expect(timed).toMatchObject({ gain_m: 500, loss_m: 100, max_ele_m: 1500, min_ele_m: 1000, elapsed_s: 7800 });
    expect(timed.distance_km).toBeCloseTo(2.22, 2);
    expect(timed.moving_s).toBeNull(); // points an hour apart: can't tell
    const untimed = trackStats(readTrackFile(KML)!.segments)!;
    expect(untimed).toMatchObject({ gain_m: 500, elapsed_s: null, moving_s: null, uphill_s: null });
  });
});
