import mirageRadar from '../../../../apps/web/public/maps/de_mirage_radar.png';
import anubisRadar from '../../../../apps/web/public/maps/de_anubis_radar.png';
import mirageZones from '../../../../apps/api/app/maps/zones/de_mirage.json';
import anubisZones from '../../../../apps/api/app/maps/zones/de_anubis.json';

export type MapId = 'de_mirage' | 'de_anubis';
export type Pt = [number, number];
export type Zone = { name: string; polygons: Pt[][] };

type MapMeta = {
  id: MapId;
  name: string;
  radar: string;
  zones: Zone[];
  tSpawn: string;
  ctSpawn: string;
  /** Callout paths each side walks, spawn first. */
  tRoutes: string[][];
  ctRoutes: string[][];
};

function centroid(poly: Pt[]): Pt {
  const x = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const y = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return [x, y];
}

export const MAPS: Record<MapId, MapMeta> = {
  de_mirage: {
    id: 'de_mirage',
    name: 'Mirage',
    radar: mirageRadar,
    zones: mirageZones.zones as Zone[],
    tSpawn: 'T spawn',
    ctSpawn: 'CT spawn',
    tRoutes: [
      ['T spawn', 'T ramp', 'A ramp', 'Tetris', 'A site'],
      ['T spawn', 'T ramp', 'Palace', 'A site'],
      ['T spawn', 'Top mid', 'Mid', 'Connector', 'Jungle'],
      ['T spawn', 'Top mid', 'Mid', 'Short', 'Market'],
      ['T spawn', 'Mid loop', 'T apartments', 'B apartments', 'B site'],
    ],
    ctRoutes: [
      ['CT spawn', 'A CT', 'A site'],
      ['CT spawn', 'Jungle', 'Connector'],
      ['CT spawn', 'Arches', 'Window'],
      ['CT spawn', 'Market', 'B site'],
      ['CT spawn', 'Arches', 'Short'],
    ],
  },
  de_anubis: {
    id: 'de_anubis',
    name: 'Anubis',
    radar: anubisRadar,
    zones: anubisZones.zones as Zone[],
    tSpawn: 'T spawn',
    ctSpawn: 'CT spawn',
    tRoutes: [
      ['T spawn', 'Mid', 'Canal', 'A water', 'A main', 'A site'],
      ['T spawn', 'Mid', 'Bridge', 'Top mid', 'A connector'],
      ['T spawn', 'B long', 'B main', 'B site'],
      ['T spawn', 'Mid', 'Canal', 'Bridge'],
      ['T spawn', 'B long', 'B main', 'B connector'],
    ],
    ctRoutes: [
      ['CT spawn', 'CT to A', 'A site'],
      ['CT spawn', 'B CT', 'B site'],
      ['CT spawn', 'Top mid', 'Bridge'],
      ['CT spawn', 'CT to A', 'A connector'],
      ['CT spawn', 'B CT', 'B connector'],
    ],
  },
};

const centres = new Map<string, Pt>();

export function zoneCentre(map: MapId, zone: string): Pt {
  const key = `${map}:${zone}`;
  const hit = centres.get(key);
  if (hit) return hit;
  const z = MAPS[map].zones.find((x) => x.name === zone);
  const c = z ? centroid(z.polygons[0]) : ([512, 512] as Pt);
  centres.set(key, c);
  return c;
}
