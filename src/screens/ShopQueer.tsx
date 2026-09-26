import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LngLatBounds, Map as MapLibre, Popup, setWorkerUrl } from 'maplibre-gl'
// MapLibre looks for its worker beside its own module, which is not where
// Vite puts either. Bundle the worker (with the code it shares) and say where.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import type { Feature, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAP_STYLE, applyMapTheme } from '../lib/mapTheme'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { useData } from '../lib/useData'
import { alphabetical } from '../lib/data'
import type { Business } from '../lib/types'
import { Chevron, Locate, Verified } from '../components/icons'
import { AgePill, Img, ProfileHeader, SearchField, Tap, font } from '../components/ui'

/** Split keeps the map at 244px; the other two trade map height for list. */
export type ShopLayout = 'split' | 'map-first' | 'list-first'

const MAP_HEIGHT: Record<ShopLayout, number> = { split: 244, 'map-first': 400, 'list-first': 104 }

/** [latitude, longitude]. MapLibre itself wants [longitude, latitude]; `lngLat` flips it. */
type LatLng = [number, number]
const lngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat]

/** Centre of Utah, used until the markers supply real bounds. */
const UTAH: LatLng = [39.32, -111.09]

const ME_COLOR = '#2563EB'

setWorkerUrl(mapWorkerUrl)

const matches = (b: Business, q: string) =>
  `${b.name} ${b.county} ${b.tags.join(' ')}`.toLowerCase().includes(q)

/** Great-circle distance in miles. */
const milesBetween = (a: LatLng, b: LatLng) => {
  const R = 3958.8
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function ShopQueer({ layout = 'split' }: { layout?: ShopLayout }) {
  const data = useData()
  const nav = useNavigate()
  const { accent, tint, canSee, signedIn, age, hideAdult } = useStore()
  const [q, setQ] = useState('')
  const [userLoc, setUserLoc] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')

  const mapH = MAP_HEIGHT[layout]

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocateError("This browser can't share your location.")
      return
    }
    setLocating(true)
    setLocateError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc([pos.coords.latitude, pos.coords.longitude])
        setLocating(false)
      },
      () => {
        setLocateError("Couldn't get your location — check your browser's location permission.")
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  const all = data?.businesses
  const { items, hiddenCount } = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const found = (all ?? []).filter((b) => !needle || matches(b, needle))
    const visible = found.filter((b) => canSee(b.age_rating))
    const sorted = userLoc
      ? [...visible].sort((a, b) => {
          const da = a.latitude !== null && a.longitude !== null ? milesBetween(userLoc, [a.latitude, a.longitude]) : Infinity
          const db = b.latitude !== null && b.longitude !== null ? milesBetween(userLoc, [b.latitude, b.longitude]) : Infinity
          return da - db
        })
      : alphabetical(visible)
    return { items: sorted, hiddenCount: found.length - visible.length }
    // `canSee` is recreated with the store value on every change that matters to it.
  }, [all, q, canSee, userLoc])

  // Only an adult who deliberately opted out is told anything was filtered.
  const optedOut = signedIn && age !== null && age >= 18 && hideAdult
  const hiddenNote =
    optedOut && hiddenCount
      ? `${hiddenCount} age-restricted listing${hiddenCount === 1 ? '' : 's'} hidden by your settings`
      : ''

  const holder = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const [ready, setReady] = useState(false)

  // The screen renders a placeholder until the directory loads, so the map's
  // container only exists once there is data. Keying the setup on that means
  // a cold open straight to /shop still gets a map.
  const hasData = !!data
  useEffect(() => {
    const el = holder.current
    if (!el) return
    const map = new MapLibre({
      container: el,
      style: MAP_STYLE,
      center: lngLat(UTAH),
      zoom: 5.2,
      // A flat, north-up map, like the tile map it replaced: page scrolling
      // passes over it, and two fingers pan and zoom without tilting.
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // Credit is drawn by the screen as one quiet line (below); MapLibre's
      // own box re-expands over the pins every time new data arrives.
      attributionControl: false,
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map

    // 'style.load', not 'load': the style is enough to draw pins and colours,
    // and 'load' also waits on every first tile — on a patchy connection that
    // left the map without pins until the last straggler arrived.
    map.once('style.load', () => {
      map.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'pins',
        type: 'circle',
        source: 'pins',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })

      // A name on hover where there is a pointer; a tap goes straight to the page.
      const tip = new Popup({ closeButton: false, closeOnClick: false, offset: 10 })
      map.on('mouseenter', 'pins', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f || f.geometry.type !== 'Point') return
        map.getCanvas().style.cursor = f.properties.id ? 'pointer' : ''
        tip.setLngLat(f.geometry.coordinates as [number, number]).setText(String(f.properties.name)).addTo(map)
      })
      map.on('mouseleave', 'pins', () => {
        map.getCanvas().style.cursor = ''
        tip.remove()
      })
      map.on('click', 'pins', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties.id
        if (id) navRef.current(`/business/${id}`)
      })
      setReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [hasData])

  // The click handler is bound once; it reads navigation through a ref.
  const navRef = useRef(nav)
  useEffect(() => { navRef.current = nav }, [nav])

  // The theme can change while the map is open.
  useEffect(() => {
    if (ready && mapRef.current) applyMapTheme(mapRef.current, accent, tint)
  }, [ready, accent, tint])

  // The map is laid out before the sheet settles, so it needs a nudge whenever
  // the container height changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const t = window.setTimeout(() => map.resize(), 60)
    return () => window.clearTimeout(t)
  }, [mapH, ready])

  // Pins are redrawn — and the view refitted — whenever the visible list or the user's location changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const pts: LatLng[] = []
    const features: Feature<Point>[] = []
    for (const b of items) {
      if (b.latitude === null || b.longitude === null) continue
      const at: LatLng = [b.latitude, b.longitude]
      pts.push(at)
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: lngLat(at) },
                      properties: { id: b.id, name: b.name, color: accent } })
    }
    if (userLoc) {
      pts.push(userLoc)
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: lngLat(userLoc) },
                      properties: { id: '', name: 'You are here', color: ME_COLOR } })
    }
    ;(map.getSource('pins') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features })

    if (pts.length) {
      const bounds = new LngLatBounds(lngLat(pts[0]), lngLat(pts[0]))
      for (const p of pts) bounds.extend(lngLat(p))
      map.fitBounds(bounds, { padding: 26, maxZoom: 9, duration: 0 })
    } else {
      map.jumpTo({ center: lngLat(UTAH), zoom: 5.2 })
    }
  }, [items, accent, userLoc, ready])

  if (!data) return <div />

  return (
    <div>
      <ProfileHeader title="Shop Queer" tagline="Utah businesses that are queer-owned or actively affirming." />
      <SearchField value={q} onChange={setQ} placeholder="Search businesses" />

      <div style={{ padding: '8px 16px 0' }}>
        <div style={{ position: 'relative', height: mapH, borderRadius: 14, overflow: 'hidden',
                      background: '#E7E9E4', border: '1px solid #E0DDD7' }}>
          <div ref={holder} style={{ position: 'absolute', inset: 0 }} />
          {/* On the map, under the button that caused it: below the map, the list
              sheet's overlap would cover it. */}
          {locateError && (
            <div role="alert"
                 style={{ position: 'absolute', top: 50, left: 10, right: 10, zIndex: 6, display: 'flex',
                          alignItems: 'flex-start', gap: 8, borderRadius: 10, background: '#fff',
                          boxShadow: '0 2px 10px rgba(0,0,0,.16)', padding: '9px 10px 9px 12px' }}>
              <div style={{ flex: 1, font: font(500, 12, 1.4), color: '#B4453A', textWrap: 'pretty' }}>{locateError}</div>
              <Tap onClick={() => setLocateError('')} label="Dismiss"
                   style={{ flex: 'none', font: font(700, 14, 1), color: '#8A8680', padding: '0 2px' }}>×</Tap>
            </div>
          )}
          {/* Required by the OpenStreetMap licence; kept clear of the list sheet's overlap. */}
          <div style={{ position: 'absolute', left: 8, bottom: 14, zIndex: 5, borderRadius: 6, padding: '2px 6px',
                        background: 'rgba(255,255,255,.78)', font: font(500, 9.5, 1.3), color: '#6E6A64' }}>
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener"
               style={{ color: 'inherit', textDecoration: 'none' }}>© OpenStreetMap</a>
            {' · '}
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer noopener"
               style={{ color: 'inherit', textDecoration: 'none' }}>OpenFreeMap</a>
          </div>
          <Tap onClick={locate} style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, display: 'flex',
                                          alignItems: 'center', gap: 6, background: '#fff', borderRadius: 999,
                                          padding: '7px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}>
            <Locate size={14} color={userLoc ? accent : '#8A8680'} />
            <span style={{ font: font(600, 12, 1.2), color: userLoc ? accent : '#5C584F' }}>
              {locating ? 'Locating…' : userLoc ? 'Near me' : 'Use my location'}
            </span>
          </Tap>
        </div>
      </div>

      <div style={{ marginTop: -10, position: 'relative', zIndex: 4, background: '#fff',
                    borderRadius: '18px 18px 0 0', paddingTop: 6 }}>
        <div style={{ font: font(500, 11.5, 1.2), color: '#96928B', padding: '10px 16px 4px' }}>
          {items.length} {items.length === 1 ? 'business' : 'businesses'}
        </div>
        {hiddenNote && (
          <div style={{ margin: '2px 16px 8px', borderRadius: 9, background: '#F7F5F1', padding: '9px 12px',
                        font: font(400, 11.5, 1.4), color: '#8C887F' }}>{hiddenNote}</div>
        )}
        {items.map((b) => (
          <Row key={b.id} b={b} accent={accent} userLoc={userLoc} onClick={() => nav(`/business/${b.id}`)} />
        ))}
        {!items.length && (
          <div style={{ padding: '34px 24px', textAlign: 'center', font: font(400, 14, 1.5), color: C.muted }}>
            No businesses match that search.
          </div>
        )}
        <div style={{ height: 22 }} />
      </div>
    </div>
  )
}

/** Like ResultRow, but with the 56px brand-colored thumbnail this screen calls for. */
function Row({ b, accent, userLoc, onClick }: { b: Business; accent: string; userLoc: LatLng | null; onClick: () => void }) {
  const distance = userLoc && b.latitude !== null && b.longitude !== null
    ? `${milesBetween(userLoc, [b.latitude, b.longitude]).toFixed(1)} mi`
    : ''
  const meta = [distance || b.county || 'Online only', b.tags[0]].filter(Boolean).join(' · ')
  return (
    <Tap onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 16px',
                                    borderBottom: `1px solid ${C.hairline}`, background: '#fff' }}>
      <div style={{ width: 56, height: 56, borderRadius: 11, overflow: 'hidden', flex: 'none',
                    background: b.color || '#E9E5DF' }}>
        <Img src={b.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ font: font(600, 14.5, 1.25), color: C.ink }}>{b.name}</span>
          {b.verified && <Verified color={accent} />}
          {b.age_rating && <AgePill label={b.age_rating} />}
        </div>
        {meta && <div style={{ font: font(400, 11.5, 1.35), color: C.muted, marginTop: 3 }}>{meta}</div>}
      </div>
      <Chevron size={15} color="#C3BFB8" />
    </Tap>
  )
}

export default ShopQueer
