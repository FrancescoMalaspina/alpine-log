// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseGpx } from './gpx';
import { readTrackFile, summarize, toGpx, trackVisit, trimTrack, usefulTrackName } from './tracks';

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
    const back = parseGpx(out)!;
    expect(back.gainM).toBe(500);
    expect(back.lines[0]).toHaveLength(3);
  });

  it('ignores names apps give by default', () => {
    expect(usefulTrackName('Afternoon Hike')).toBeNull();
    expect(usefulTrackName('Escursione pomeridiana')).toBeNull();
    expect(usefulTrackName('2025-07-02 08:12')).toBeNull();
    expect(usefulTrackName(' Pizzo dei Tre Signori ')).toBe('Pizzo dei Tre Signori');
  });
});
