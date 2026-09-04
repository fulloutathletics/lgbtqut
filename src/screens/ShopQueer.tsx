import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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

const CARTO = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>'

/** Centre of Utah, used until the markers supply real bounds. */
const UTAH: L.LatLngTuple = [39.32, -111.09]

const matches = (b: Business, q: string) =>
  `${b.name} ${b.county} ${b.tags.join(' ')}`.toLowerCase().includes(q)

/** Great-circle distance in miles. */
const milesBetween = (a: L.LatLngTuple, b: L.LatLngTuple) => {
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
  const { accent, canSee, signedIn, age, hideAdult } = useStore()
  const [q, setQ] = useState('')
  const [userLoc, setUserLoc] = useState<L.LatLngTuple | null>(null)
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
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const map = L.map(el, { zoomControl: false, scrollWheelZoom: false })
    L.tileLayer(CARTO, { maxZoom: 19, subdomains: 'abcd', attribution: ATTRIBUTION }).addTo(map)
    map.attributionControl.setPrefix(false)
    map.setView(UTAH, 6)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const t = window.setTimeout(() => map.invalidateSize(), 60)
    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // The map is laid out before its tiles exist, so it needs a nudge whenever the
  // container height changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const t = window.setTimeout(() => map.invalidateSize(), 60)
    return () => window.clearTimeout(t)
  }, [mapH])

  // Markers are redrawn — and the view refitted — whenever the visible list or the user's location changes.
  useEffect(() => {
    const map = mapRef.current
    const group = layerRef.current
    if (!map || !group) return
    group.clearLayers()
    const pts: L.LatLngTuple[] = []
    for (const b of items) {
      if (b.latitude === null || b.longitude === null) continue
      const at: L.LatLngTuple = [b.latitude, b.longitude]
      pts.push(at)
      L.circleMarker(at, { radius: 7, color: '#fff', weight: 2, fillColor: accent, fillOpacity: 1 })
        .bindTooltip(b.name, { direction: 'top', offset: [0, -6] })
        .on('click', () => nav(`/business/${b.id}`))
        .addTo(group)
    }
    if (userLoc) {
      pts.push(userLoc)
      L.circleMarker(userLoc, { radius: 7, color: '#fff', weight: 2, fillColor: '#2563EB', fillOpacity: 1 })
        .bindTooltip('You are here', { direction: 'top', offset: [0, -6] })
        .addTo(group)
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [26, 26], maxZoom: 9 })
    else map.setView(UTAH, 6)
  }, [items, accent, nav, userLoc])

  if (!data) return <div />

  return (
    <div>
      <ProfileHeader title="Shop Queer" tagline="Utah businesses that are queer-owned or actively affirming." />
      <SearchField value={q} onChange={setQ} placeholder="Search businesses" />

      <div style={{ padding: '8px 16px 0' }}>
        <div style={{ position: 'relative', height: mapH, borderRadius: 14, overflow: 'hidden',
                      background: '#E7E9E4', border: '1px solid #E0DDD7' }}>
          <div ref={holder} style={{ position: 'absolute', inset: 0 }} />
          <Tap onClick={locate} style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, display: 'flex',
                                          alignItems: 'center', gap: 6, background: '#fff', borderRadius: 999,
                                          padding: '7px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}>
            <Locate size={14} color={userLoc ? accent : '#8A8680'} />
            <span style={{ font: font(600, 12, 1.2), color: userLoc ? accent : '#5C584F' }}>
              {locating ? 'Locating…' : userLoc ? 'Near me' : 'Use my location'}
            </span>
          </Tap>
        </div>
        {locateError && (
          <div style={{ marginTop: 8, font: font(400, 11.5, 1.4), color: '#B4453A' }}>{locateError}</div>
        )}
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
function Row({ b, accent, userLoc, onClick }: { b: Business; accent: string; userLoc: L.LatLngTuple | null; onClick: () => void }) {
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
