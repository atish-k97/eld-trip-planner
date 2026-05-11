import { useState } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'

import TripForm from './components/TripForm.jsx'
import RouteMap from './components/RouteMap.jsx'
import ELDLogSheet from './components/ELDLogSheet.jsx'

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0a0a0a',
      paper: '#141414',
    },
    primary: { main: '#5b8def' },
    secondary: { main: '#94a3b8' },
    text: {
      primary: 'rgba(255,255,255,0.92)',
      secondary: 'rgba(255,255,255,0.65)',
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Roboto", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h5: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 600 },
    subtitle2: { fontWeight: 500 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
})

function formatTripSummaryHours(h) {
  const total = Number(h)
  if (!Number.isFinite(total)) return '—'
  const hh = Math.floor(total)
  let mm = Math.round((total - hh) * 60)
  if (mm >= 60) mm = 59
  return `${hh}h ${mm}m`
}

export default function App() {
  const [trip, setTrip] = useState(null)
  const [addresses, setAddresses] = useState(null)
  const [apiError, setApiError] = useState(null)

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: '#0a0a0a', pb: 6 }}>
        <Container
          maxWidth={false}
          sx={{ maxWidth: '1100px', width: '100%', px: { xs: 2, sm: 3, md: 4 } }}
        >
          <Typography variant="h5" component="h1" sx={{ pt: 4, mb: 0.5 }}>
            ELD Trip Planner
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }} variant="body2">
            Enter locations and cycle hours. Results include distance, duration,
            map route, and one ELD grid per planned day.
          </Typography>

          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 4 },
              bgcolor: '#141414',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <TripForm
              onSubmitStart={() => {
                setTrip(null)
                setAddresses(null)
                setApiError(null)
              }}
              onResult={(data, loc) => {
                setTrip(data)
                setAddresses(loc)
              }}
              onError={setApiError}
            />

            {apiError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {apiError}
              </Alert>
            ) : null}

            {trip ? (
              <>
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 2.5, sm: 3 },
                    mb: 3,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    borderColor: 'rgba(255,255,255,0.1)',
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    Trip summary
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Total distance:{' '}
                    <Typography component="span" variant="body2" fontWeight={600}>
                      {Number(trip.total_distance_miles ?? 0).toFixed(2)} mi
                    </Typography>
                  </Typography>
                  <Typography variant="body2">
                    Total duration (plan clock):{' '}
                    <Typography component="span" variant="body2" fontWeight={600}>
                      {formatTripSummaryHours(trip.total_duration_hours)}{' '}
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                      >
                        ({Number(trip.total_duration_hours ?? 0).toFixed(2)} h decimal)
                      </Typography>
                    </Typography>
                  </Typography>
                </Paper>

                <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.08)' }} />
                <Typography variant="subtitle1" sx={{ mb: 2 }} fontWeight={600}>
                  Route map
                </Typography>
                <RouteMap
                  addresses={addresses}
                  planStops={trip.stops ?? []}
                  totalDurationHours={trip.total_duration_hours}
                />

                <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.08)' }} />
                <Typography variant="subtitle1" sx={{ mb: 3 }} fontWeight={600}>
                  ELD daily logs
                </Typography>
                {(trip.days ?? []).map((dayRec) => (
                  <ELDLogSheet
                    key={dayRec.day}
                    day={dayRec.day}
                    segments={dayRec.segments}
                    stops={dayRec.stops}
                  />
                ))}
              </>
            ) : null}
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  )
}
