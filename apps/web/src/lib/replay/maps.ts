/** Map overview transforms — must match apps/api/app/maps/metadata.py */

export type MapMeta = {
  mapName: string;
  displayName: string;
  posX: number;
  posY: number;
  scale: number;
  radarSize: number;
  /** Public URL path under apps/web/public (Valve overview texture). */
  radarImage: string | null;
};

/**
 * Valve overview convention (pos_x / pos_y / scale from resource/overviews/*.txt).
 * Images: apps/web/public/maps/ (see README there).
 * de_anubis: SteamDatabase / MurkyYT radar_info (pos_x=-2796, pos_y=3328, scale=5.22);
 *   verified vs match-d03751f42266 spawns.
 * de_mirage: Valve overview via MurkyYT radar_info (pos_x=-3230, pos_y=1713, scale=5.0).
 */
export const MAPS: Record<string, MapMeta> = {
  de_mirage: {
    mapName: "de_mirage",
    displayName: "Mirage",
    posX: -3230,
    posY: 1713,
    scale: 5,
    radarSize: 1024,
    radarImage: "/maps/de_mirage_radar.png",
  },
  de_anubis: {
    mapName: "de_anubis",
    displayName: "Anubis",
    posX: -2796,
    posY: 3328,
    scale: 5.22,
    radarSize: 1024,
    radarImage: "/maps/de_anubis_radar.png",
  },
};

export function getMapMeta(mapName: string): MapMeta | null {
  return MAPS[mapName.trim().toLowerCase()] ?? null;
}

export function worldToRadar(
  x: number,
  y: number,
  meta: MapMeta,
): { rx: number; ry: number } {
  return {
    rx: (x - meta.posX) / meta.scale,
    ry: (meta.posY - y) / meta.scale,
  };
}
