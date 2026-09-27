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
};

function centroid(poly: Pt[]): Pt {
  const x = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const y = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return [x, y];
}

export const MAPS: Record<MapId, MapMeta> = {
  de_mirage: { id: 'de_mirage', name: 'Mirage', radar: mirageRadar, zones: mirageZones.zones as Zone[] },
  de_anubis: { id: 'de_anubis', name: 'Anubis', radar: anubisRadar, zones: anubisZones.zones as Zone[] },
};

/** "de_mirage", "Mirage" or "mirage" to a map this app has a radar for; null for any other map. */
export function mapIdOf(name: string | null | undefined): MapId | null {
  const n = (name ?? '').trim().toLowerCase();
  if (n === 'de_mirage' || n === 'mirage') return 'de_mirage';
  if (n === 'de_anubis' || n === 'anubis') return 'de_anubis';
  return null;
}

export function mapName(map: string | null | undefined): string {
  const id = mapIdOf(map);
  return id ? MAPS[id].name : (map ?? 'Unknown map');
}

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
