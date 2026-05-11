import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import L from 'leaflet'
import { MapContainer, TileLayer, Polyline, Popup, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

function formatTripElapsedHours(h) {
  const total = Number(h)
  if (!Number.isFinite(total)) return '—'
  const hh = Math.floor(total + 1e-6)
  const mm = Math.round(((total % 1) + 1) % 1 * 60)
  return `${hh}h ${mm}m from trip start`
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

/** points: LatLng[], fraction 0..1 along cumulative path length */
function interpolateAlong(points, fraction) {
  const f = Math.min(1, Math.max(0, fraction))
  if (!points.length) return null
  if (points.length === 1) return points[0]

  const legLengths = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [latA, lngA] = points[i]
    const [latB, lngB] = points[i + 1]
    const d = haversineMeters(latA, lngA, latB, lngB)
    legLengths.push(d)
    total += d
  }

  let target = total * f

  if (total < 1) return points[points.length - 1]

  for (let i = 0; i < points.length - 1; i++) {
    const leg = legLengths[i]
    if (target <= leg + 1e-6) {
      const t = leg === 0 ? 0 : target / leg
      const [aLat, aLng] = points[i]
      const [bLat, bLng] = points[i + 1]
      return [aLat + t * (bLat - aLat), aLng + t * (bLng - aLng)]
    }
    target -= leg
  }

  return points[points.length - 1]
}

async function geocode(query) {
  const { data } = await axios.get(NOMINATIM, {
    params: {
      q: query,
      format: 'json',
      limit: 1,
    },
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ELDTripPlanner/1.0 (local dev; contact: dev@localhost)',
    },
    timeout: 25000,
  })
  if (!Array.isArray(data) || !data.length) {
    throw new Error(`No geocode result for: ${query}`)
  }
  const lat = parseFloat(data[0].lat)
  const lon = parseFloat(data[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Invalid geocode coordinates for: ${query}`)
  }
  return [lat, lon]
}

async function fetchOsrmLine(pointsLatLng) {
  if (pointsLatLng.length < 2) return []
  const coordStr = pointsLatLng.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson`
  const { data } = await axios.get(url, { timeout: 30000 })
  const geom = data?.routes?.[0]?.geometry
  const coords =
    geom?.type === 'LineString' && Array.isArray(geom.coordinates)
      ? geom.coordinates
      : Array.isArray(geom?.coordinates)
        ? geom.coordinates
        : []
  if (!coords.length) {
    throw new Error('Routing service returned no geometry')
  }
  return coords.map(([lng, lat]) => [lat, lng])
}

function FitBoundsPolyline({ positions }) {
  const map = useMap()
  useEffect(() => {
    let bounds = null
    positions?.forEach((latlng) => {
      if (
        Array.isArray(latlng) &&
        latlng.length >= 2 &&
        latlng.every(Number.isFinite)
      ) {
        if (!bounds) bounds = L.latLngBounds(latlng, latlng)
        else bounds.extend(latlng)
      }
    })
    if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
  }, [map, positions])
  return null
}

const markerTheme = {
  current: { color: '#ffffff', fill: '#3b82f6' },
  pickup: { color: '#bbf7d0', fill: '#16a34a' },
  dropoff: { color: '#fecaca', fill: '#dc2626' },
  fuel: { color: '#fef08a', fill: '#ca8a04' },
}

export default function RouteMap({ addresses, planStops, totalDurationHours }) {
  const [state, setState] = useState({
    loading: false,
    error: null,
    line: [],
    mains: [],
    fuelPositions: [],
  })

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (
        !addresses?.current_location ||
        !addresses?.pickup_location ||
        !addresses?.dropoff_location
      ) {
        setState((s) => ({
          ...s,
          line: [],
          mains: [],
          fuelPositions: [],
          error: null,
          loading: false,
        }))
        return
      }

      setState((s) => ({ ...s, loading: true, error: null }))

      try {
        const [cur, pick, drop] = await Promise.all([
          geocode(addresses.current_location),
          geocode(addresses.pickup_location),
          geocode(addresses.dropoff_location),
        ])

        if (cancelled) return

        const linePositions = await fetchOsrmLine([cur, pick, drop])
        const safeLine =
          linePositions.length > 0 ? linePositions : [cur, pick, drop]

        const fuelStops = (planStops ?? []).filter((s) => s.type === 'fuel')
        const dur = Number(totalDurationHours)
        const fuelPositions = fuelStops
          .map((fs) => {
            const hour = Number(fs.hour)
            if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(hour)) {
              return null
            }
            const frac = Math.min(0.999, Math.max(0.02, hour / dur))
            const pos = interpolateAlong(safeLine, frac)
            return pos ? { pos, stop: fs } : null
          })
          .filter(Boolean)

        if (cancelled) return

        const pickupStop = (planStops ?? []).find((x) => x.type === 'pickup')
        const dropoffStop = (planStops ?? []).find((x) => x.type === 'dropoff')

        setState({
          loading: false,
          error: null,
          line: safeLine,
          mains: [
            {
              pos: cur,
              key: 'current',
              title: 'Current location',
              timeText: '0h 0m from trip start',
            },
            {
              pos: pick,
              key: 'pickup',
              title: 'Pickup',
              type: 'pickup',
              timeText:
                pickupStop?.hour != null
                  ? formatTripElapsedHours(pickupStop.hour)
                  : 'Pickup',
            },
            {
              pos: drop,
              key: 'dropoff',
              title: 'Dropoff',
              type: 'dropoff',
              timeText:
                dropoffStop?.hour != null
                  ? formatTripElapsedHours(dropoffStop.hour)
                  : 'Dropoff',
            },
          ],
          fuelPositions,
        })
      } catch (e) {
        if (cancelled) return
        setState({
          loading: false,
          error: e?.message ?? 'Map failed',
          line: [],
          mains: [],
          fuelPositions: [],
        })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [addresses, planStops, totalDurationHours])

  const center = useMemo(() => {
    const p = state.line[0]
    return p ?? [39.8283, -98.5795]
  }, [state.line])

  if (!addresses) {
    return (
      <Box
        sx={{
          height: 400,
          bgcolor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography color="text.secondary">
          Plan a trip to plot the route.
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        position: 'relative',
        height: 400,
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {state.loading ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(10,10,10,0.65)',
          }}
        >
          <CircularProgress size={40} />
        </Box>
      ) : null}
      <MapContainer
        center={center}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {state.line.length > 1 ? (
          <Polyline
            positions={state.line}
            pathOptions={{
              color: '#5b8def',
              weight: 5,
              opacity: 0.9,
            }}
          />
        ) : null}
        {state.line.length ? <FitBoundsPolyline positions={state.line} /> : null}

        {state.mains.map((m) => {
          const mt =
            markerTheme[m.key === 'dropoff' ? 'dropoff' : m.key === 'pickup' ? 'pickup' : 'current']
          const label =
            m.key === 'current'
              ? 'Current location'
              : m.key === 'pickup'
                ? 'Pickup'
                : 'Dropoff'
          return (
            <CircleMarker
              key={m.key}
              center={m.pos}
              radius={m.key === 'current' ? 9 : 10}
              pathOptions={{
                color: mt.color,
                fillColor: mt.fill,
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>
                <Typography variant="body2" fontWeight={600}>
                  {label}
                </Typography>
                <Typography variant="caption" display="block">
                  Trip time: {m.timeText}
                </Typography>
              </Popup>
            </CircleMarker>
          )
        })}

        {state.fuelPositions.map((fp, idx) => (
          <CircleMarker
            key={`fuel-${idx}-${fp.stop.hour}`}
            center={fp.pos}
            radius={8}
            pathOptions={{
              color: markerTheme.fuel.color,
              fillColor: markerTheme.fuel.fill,
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <Typography variant="body2" fontWeight={600}>
                Fuel stop
              </Typography>
              <Typography variant="caption" display="block">
                {fp.stop.location}
              </Typography>
              <Typography variant="caption" display="block" color="text.secondary">
                {formatTripElapsedHours(fp.stop.hour)}
              </Typography>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {state.error ? (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 8,
            zIndex: 500,
            pointerEvents: 'auto',
          }}
        >
          <Alert severity="warning" variant="filled" sx={{ py: 0 }}>
            {state.error}
          </Alert>
        </Box>
      ) : null}
    </Box>
  )
}
