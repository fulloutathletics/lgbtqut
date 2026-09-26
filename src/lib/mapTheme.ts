import type { Map as MapLibre } from 'maplibre-gl'

// The Shop Queer map, drawn from OpenStreetMap data served by OpenFreeMap:
// no key, no account, no usage cap, commercial use allowed. Its Positron
// style is the open original of the light CARTO basemap this replaced.
//
// The tiles are vectors the browser paints, so the map wears the reader's
// theme: water, parks, major roads and borders take the accent, the land takes
// the tint. It stays quiet on purpose — labels and streets are left neutral,
// and the business pins, in the full accent, are the loudest thing on it.

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

/** Mixes `hex` into `base` by `amount` (0 = base, 1 = hex). Both are #rrggbb. */
function mix(hex: string, base: string, amount: number): string {
  const p = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16)
  const ch = (i: number) => Math.round(p(base, i) + (p(hex, i) - p(base, i)) * amount)
  return `#${[0, 1, 2].map((i) => ch(i).toString(16).padStart(2, '0')).join('')}`
}

const LAND = '#f2f3f0'
const WHITE = '#ffffff'

/** layer id → paint property → colour, for one theme. Layers missing from the style are skipped. */
function palette(accent: string, tint: string): Array<[string, string, string]> {
  const land = mix(tint, LAND, 0.55)
  // Water carries the theme; land cover only hints at it, so a forest never
  // reads as a lake when the accent is blue.
  const water = mix(accent, WHITE, 0.3)
  const green = mix(accent, land, 0.05)
  const casing = mix(accent, WHITE, 0.4)
  return [
    ['background', 'background-color', land],
    ['landuse_residential', 'fill-color', mix('#000000', land, 0.03)],
    ['building', 'fill-color', mix('#000000', land, 0.035)],
    ['park', 'fill-color', green],
    ['landcover_wood', 'fill-color', mix(accent, mix('#000000', land, 0.04), 0.04)],
    ['water', 'fill-color', water],
    ['waterway', 'line-color', mix(accent, WHITE, 0.34)],
    ['water_name_point_label', 'text-color', mix(accent, '#000000', 0.55)],
    ['water_name_line_label', 'text-color', mix(accent, '#000000', 0.55)],
    ['highway_motorway_casing', 'line-color', casing],
    ['highway_motorway_bridge_casing', 'line-color', casing],
    ['highway_major_casing', 'line-color', mix(accent, WHITE, 0.24)],
    ['boundary_2', 'line-color', mix(accent, '#8a8a8a', 0.35)],
    ['boundary_3', 'line-color', mix(accent, '#b0b0b0', 0.25)],
  ]
}

/** Recolours a loaded Positron map for the given theme. Safe to call again on a theme change. */
export function applyMapTheme(map: MapLibre, accent: string, tint: string) {
  for (const [layer, prop, color] of palette(accent, tint)) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop as Parameters<MapLibre['setPaintProperty']>[1], color)
  }
}
