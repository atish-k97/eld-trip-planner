# ELD Trip Planner

A full-stack web app that helps truck drivers plan trips in compliance with FMCSA Hours of Service (HOS) regulations. Enter your current location, pickup, dropoff, and cycle hours used — get a route map and auto-generated ELD daily log sheets back.

**Live Demo:** [your-app.vercel.app](https://your-app.vercel.app) <!-- Update after Vercel deploy -->

---

## Features

- Route planning via OpenRouteService API
- HOS-compliant schedule generation (70hr/8-day cycle)
- Auto-calculated rest breaks, fuel stops, pickup/dropoff service times
- Interactive Leaflet map with stop markers
- SVG ELD daily log sheets — one per day, filled in programmatically
- Multi-day trip support
- Input validation with clear error messages

## HOS Rules Enforced

- 11hr max driving per shift
- 14hr on-duty window per shift
- 30min break after 8hrs cumulative driving
- 10hr off-duty reset between shifts
- Fueling stop every 1,000 miles (30min on-duty not driving)
- 1hr on-duty not driving at pickup and dropoff
- 70hr/8-day cycle cap

---

## Tech Stack

**Frontend**

- React + Vite
- Material UI (MUI)
- React-Leaflet + OpenStreetMap
- Axios

**Backend**

- Django + Django REST Framework
- OpenRouteService API (geocoding + directions)
- python-dotenv

---

## Local Development

### Prerequisites

- Node.js v18+
- Python 3.10+
- OpenRouteService API key (free at [openrouteservice.org](https://openrouteservice.org/dev/#/signup))

### Backend Setup

```bash
cd backend
python -m venv .venv

# Windows
.\.venv\Scripts\Activate.ps1

# Mac/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:

```
ORS_API_KEY=your_api_key_here
```

Run the server:

```bash
python manage.py migrate
python manage.py runserver 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## API

### `POST /api/plan-trip/`

**Request**

```json
{
  "current_location": "Los Angeles, CA",
  "pickup_location": "Phoenix, AZ",
  "dropoff_location": "Dallas, TX",
  "cycle_used_hours": 0
}
```

**Response**

```json
{
  "total_distance_miles": 1470.31,
  "total_duration_hours": 56.33,
  "days": [
    {
      "day": 1,
      "segments": [
        { "status": "off_duty", "start": 0.0, "end": 10.0 },
        { "status": "driving", "start": 10.0, "end": 21.0 }
      ],
      "stops": [{ "type": "pickup", "location": "Phoenix, AZ", "time": 16.2 }]
    }
  ],
  "stops": [
    { "type": "pickup", "location": "Phoenix, AZ", "hour": 16.2 },
    { "type": "dropoff", "location": "Dallas, TX", "hour": 55.33 }
  ]
}
```

---

## Deployment

**Frontend** → Vercel  
**Backend** → Render

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step hosting instructions.

---

## Screenshots

> Add screenshots here after deploy

---

## License

MIT
