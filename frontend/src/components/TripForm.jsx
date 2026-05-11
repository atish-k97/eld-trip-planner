import { useState } from 'react'
import axios from 'axios'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'

const API_URL = import.meta.env.VITE_API_URL
? `${import.meta.env.VITE_API_URL}/api/plan-trip/`
: 'http://localhost:8000/api/plan-trip/'

export default function TripForm({ onResult, onError, onSubmitStart }) {
  const [currentLocation, setCurrentLocation] = useState('')
  const [pickupLocation, setPickupLocation] = useState('')
  const [dropoffLocation, setDropoffLocation] = useState('')
  const [cycleUsed, setCycleUsed] = useState('0')
  const [loading, setLoading] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitAttempted(true)

    const cur = currentLocation.trim()
    const pick = pickupLocation.trim()
    const drop = dropoffLocation.trim()
    const cycleStr = String(cycleUsed).trim()
    const cycleNum = Number(cycleUsed)

    const currentEmpty = !cur
    const pickupEmpty = !pick
    const dropoffEmpty = !drop
    const cycleEmpty = !cycleStr
    const cycleOutOfRange =
      !cycleEmpty &&
      (!Number.isFinite(cycleNum) || cycleNum < 0 || cycleNum > 69)

    const locationTooShort = cur.length < 3 || pick.length < 3 || drop.length < 3

    if (
      currentEmpty ||
      pickupEmpty ||
      dropoffEmpty ||
      cycleEmpty ||
      cycleOutOfRange ||
      locationTooShort
    ) {
      return
    }

    const hrs = cycleNum

    onSubmitStart?.()
    setLoading(true)
    onError?.(null)

    const payload = {
      current_location: cur,
      pickup_location: pick,
      dropoff_location: drop,
      cycle_used_hours: hrs,
    }

    try {
      const { data } = await axios.post(API_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
      })
      onResult?.(data, {
        current_location: payload.current_location,
        pickup_location: payload.pickup_location,
        dropoff_location: payload.dropoff_location,
      })
    } catch (err) {
      const msg =
        err.response?.data?.detail ??
        err.response?.data?.message ??
        err.message ??
        'Request failed'
      const text = typeof msg === 'string' ? msg : JSON.stringify(msg)
      onError?.(text)
    } finally {
      setLoading(false)
    }
  }

  const cur = currentLocation.trim()
  const pick = pickupLocation.trim()
  const drop = dropoffLocation.trim()
  const cycleStr = String(cycleUsed).trim()
  const cycleNum = Number(cycleUsed)

  const showCurrentErr = submitAttempted && !cur
  const showPickupErr = submitAttempted && !pick
  const showDropoffErr = submitAttempted && !drop
  const showCycleEmptyErr = submitAttempted && !cycleStr
  const showCycleRangeErr =
    submitAttempted &&
    !!cycleStr &&
    (!Number.isFinite(cycleNum) || cycleNum < 0 || cycleNum > 69)

  const showShortLocationAlert =
    submitAttempted && (cur.length < 3 || pick.length < 3 || drop.length < 3)

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
        Trip parameters
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          mb: 2,
        }}
      >
        <TextField
          required
          fullWidth
          label="Current Location"
          value={currentLocation}
          onChange={(e) => setCurrentLocation(e.target.value)}
          disabled={loading}
          autoComplete="off"
          error={showCurrentErr}
          helperText={showCurrentErr ? 'This field is required' : undefined}
        />
        <TextField
          required
          fullWidth
          label="Pickup Location"
          value={pickupLocation}
          onChange={(e) => setPickupLocation(e.target.value)}
          disabled={loading}
          autoComplete="off"
          error={showPickupErr}
          helperText={showPickupErr ? 'This field is required' : undefined}
        />
        <TextField
          required
          fullWidth
          label="Dropoff Location"
          value={dropoffLocation}
          onChange={(e) => setDropoffLocation(e.target.value)}
          disabled={loading}
          autoComplete="off"
          error={showDropoffErr}
          helperText={showDropoffErr ? 'This field is required' : undefined}
        />
        <TextField
          required
          fullWidth
          type="number"
          label="Current Cycle Used (hours)"
          value={cycleUsed}
          onChange={(e) => setCycleUsed(e.target.value)}
          disabled={loading}
          inputProps={{ min: 0, max: 69, step: 0.1 }}
          error={showCycleEmptyErr || showCycleRangeErr}
          helperText={
            showCycleEmptyErr
              ? 'This field is required'
              : showCycleRangeErr
                ? 'Enter a value from 0 to 69 hours'
                : '0–69 hrs used in your 70 hr / 8-day cycle'
          }
        />
      </Box>
      {showShortLocationAlert ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Please enter a valid city name or address
        </Alert>
      ) : null}
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={loading}
        sx={{ minWidth: 140, position: 'relative' }}
      >
        {loading ? (
          <CircularProgress size={22} sx={{ color: 'primary.contrastText' }} />
        ) : (
          'Plan trip'
        )}
      </Button>
    </Box>
  )
}
