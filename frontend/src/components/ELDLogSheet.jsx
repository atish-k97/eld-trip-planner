import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'

const ROW_LABELS = [
  'Off Duty',
  'Sleeper Berth',
  'Driving',
  'On Duty (not driving)',
]

function statusRowIndex(status) {
  switch (status) {
    case 'off_duty':
      return 0
    case 'sleeper_berth':
    case 'sleeper':
      return 1
    case 'driving':
      return 2
    case 'on_duty_not_driving':
      return 3
    default:
      return 0
  }
}

/** Day-local decimal hours → display like 12:13 */
function formatClock(decimalHour) {
  const h24 = ((Number(decimalHour) % 24) + 24) % 24
  const h = Math.floor(h24 + 1e-9)
  const m = Math.min(59, Math.round((h24 - h) * 60))
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

function segmentHours(segments, rowIdx) {
  let sum = 0
  for (const seg of segments) {
    if (statusRowIndex(seg.status) !== rowIdx) continue
    sum += Number(seg.end) - Number(seg.start)
  }
  return Math.max(0, sum)
}

const LABEL_W = 150
const GRID_W = 720
const TOTALS_W = 72
const SVG_W = LABEL_W + GRID_W + TOTALS_W + 24
const HEADER_H = 36
const ROW_H = 44
const BAR_STROKE = 7

const ROW_COLORS = ['#64748b', '#3b82f6', '#22c55e', '#eab308']

const LEGEND_ITEMS = [
  { color: ROW_COLORS[0], label: 'Off Duty' },
  { color: ROW_COLORS[1], label: 'Sleeper Berth' },
  { color: ROW_COLORS[2], label: 'Driving' },
  { color: ROW_COLORS[3], label: 'On Duty (not driving)' },
]

export default function ELDLogSheet({ day, segments, stops }) {
  const sorted =
    segments != null ? [...segments].sort((a, b) => a.start - b.start) : []

  const rowTotals = ROW_LABELS.map((_, idx) =>
    segmentHours(sorted, idx).toFixed(2),
  )

  const connectors = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    const ra = statusRowIndex(a.status)
    const rb = statusRowIndex(b.status)
    if (ra === rb) continue

    const boundaryHour = Number(a.end)
    const xAlign = LABEL_W + (boundaryHour / 24) * GRID_W
    const ya = HEADER_H + ra * ROW_H + ROW_H / 2
    const yb = HEADER_H + rb * ROW_H + ROW_H / 2
    const yTop = Math.min(ya, yb) - BAR_STROKE / 2
    const yBottom = Math.max(ya, yb) + BAR_STROKE / 2

    connectors.push(
      <line
        key={`c-${i}-${a.start}-${b.start}`}
        x1={xAlign}
        y1={yTop}
        x2={xAlign}
        y2={yBottom}
        stroke="rgba(255,255,255,0.72)"
        strokeWidth={2}
      />,
    )
  }

  const rowCenters = ROW_LABELS.map(
    (_, r) => HEADER_H + r * ROW_H + ROW_H / 2,
  )

  const segmentsEls = sorted.map((seg, idx) => {
    const row = statusRowIndex(seg.status)
    const x1 = LABEL_W + (seg.start / 24) * GRID_W
    const x2 = LABEL_W + (seg.end / 24) * GRID_W
    const y = rowCenters[row]
    const stroke = ROW_COLORS[row]
    const timeLabel = `${formatClock(seg.start)}–${formatClock(seg.end)}`
    return (
      <g key={`seg-${idx}-${seg.status}-${seg.start}`}>
        <line
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          stroke={stroke}
          strokeWidth={BAR_STROKE}
          strokeLinecap="square"
        />
        <title>{`${seg.status}: ${timeLabel}`}</title>
      </g>
    )
  })

  const hourTicks = []
  for (let h = 0; h <= 24; h += 3) {
    const gx = LABEL_W + (h / 24) * GRID_W
    hourTicks.push(
      <g key={`h-${h}`}>
        <line
          x1={gx}
          y1={HEADER_H - 4}
          x2={gx}
          y2={HEADER_H + ROW_H * ROW_LABELS.length}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
        />
        <text
          x={gx}
          y={HEADER_H - 12}
          textAnchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}
          fill="rgba(255,255,255,0.55)"
          fontSize={11}
        >
          {h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`}
        </text>
      </g>,
    )
  }

  const stopTimes = stops ?? []

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 3 },
        mb: 3,
        backgroundColor: '#121212',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Typography variant="subtitle1" sx={{ mb: 1 }} fontWeight={600}>
        ELD grid — Day {day}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_W} ${HEADER_H + ROW_H * ROW_LABELS.length + 8}`}
          style={{ display: 'block', minHeight: HEADER_H + ROW_H * 4 }}
        >
          {/* Row labels */}
          {ROW_LABELS.map((lbl, r) => (
            <text
              key={lbl}
              x={12}
              y={rowCenters[r] + 4}
              fill="rgba(255,255,255,0.85)"
              fontSize={11}
              fontFamily="Roboto, Helvetica, Arial, sans-serif"
            >
              {lbl}
            </text>
          ))}

          {/* Grid frame */}
          <rect
            x={LABEL_W}
            y={HEADER_H}
            width={GRID_W}
            height={ROW_H * ROW_LABELS.length}
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={1}
          />

          {hourTicks}
          {segmentsEls}
          {connectors}

          {/* Row dividers */}
          {ROW_LABELS.map((_, r) =>
            r === 0 ? null : (
              <line
                key={`rd-${r}`}
                x1={LABEL_W}
                y1={HEADER_H + r * ROW_H}
                x2={LABEL_W + GRID_W}
                y2={HEADER_H + r * ROW_H}
                stroke="rgba(255,255,255,0.1)"
              />
            ),
          )}

          {/* Totals column */}
          {ROW_LABELS.map((lbl, r) => (
            <g key={`tot-${lbl}`}>
              <rect
                x={LABEL_W + GRID_W + 12}
                y={HEADER_H + r * ROW_H + ROW_H / 2 - 12}
                width={TOTALS_W}
                height={26}
                rx={4}
                fill="rgba(255,255,255,0.06)"
                stroke="rgba(255,255,255,0.12)"
              />
              <text
                x={LABEL_W + GRID_W + 12 + TOTALS_W / 2}
                y={HEADER_H + r * ROW_H + ROW_H / 2 + 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.9)"
                fontSize={12}
                fontWeight={600}
              >
                {rowTotals[r]}h
              </text>
            </g>
          ))}
        </svg>
      </Box>
      <Box
        component="div"
        role="group"
        aria-label="Duty status legend"
        sx={{
          mt: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: { xs: 1.5, sm: 2 },
          alignItems: 'center',
          rowGap: 1,
        }}
      >
        {LEGEND_ITEMS.map((item) => (
          <Box
            key={item.label}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              sx={{
                width: 20,
                height: 10,
                borderRadius: '2px',
                bgcolor: item.color,
                flexShrink: 0,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
      {stopTimes.length ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Day stops:
          {' '}
          {stopTimes
            .map(
              (s) =>
                `${s.type}: ${s.location ?? ''} @ ${formatClock(s.time)}`,
            )
            .join(' · ')}
        </Typography>
      ) : null}
    </Paper>
  )
}
