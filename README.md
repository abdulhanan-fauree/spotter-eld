# Spotter ELD

A trip planner for commercial motor vehicle (CMV) drivers that enforces FMCSA Hours-of-Service regulations. Enter your current location, pickup, and dropoff — the app computes a fully compliant route with all required stops and rests, then generates drawn ELD log sheets for every day of the trip.

**Live:** [spotter-eld-web.vercel.app](https://spotter-eld-web.vercel.app)

## Features

- **HOS compliance engine** — 11-hour driving limit, 14-hour window, 70/8-day cycle, 30-minute break, 10-hour reset, 34-hour restart, and sleeper-berth split (FMCSA 395.1(g)). Violations are detected and listed.
- **ELD log sheets** — SVG-rendered daily logs matching the FMCSA form: duty status grid, hour totals, remarks, recap boxes, and header fields.
- **Interactive route map** — Leaflet map with Esri basemaps (light/dark), numbered stops color-coded by duty status, mile-marker pills, and direction arrows.
- **Trip playback** — Animated truck marker moves along the route; the map, itinerary, and log sheet stay synchronized.
- **Geocode typeahead** — Proxied through the backend to Nominatim with response caching.
- **Trip history** — List, view, and delete past trips.

## Tech Stack

| Layer    | Stack |
|----------|-------|
| Backend  | Django 6, Django REST Framework, Python 3.14, PostgreSQL (prod) / SQLite (dev) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Leaflet, TanStack Query, Zod |
| Infra    | Two Vercel projects from one repo, GitHub Actions CI |

## Running Locally

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8077
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on port 5173 and proxies `/api` to `http://127.0.0.1:8077`. No `.env` file is needed for local development.

### Tests

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npx vitest
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/trips/` | Plan a new trip |
| GET    | `/api/trips/` | List saved trips |
| GET    | `/api/trips/<id>/` | Retrieve a trip |
| DELETE | `/api/trips/<id>/` | Delete a trip |
| GET    | `/api/geocode/?q=...` | Location typeahead |
| GET    | `/api/health/` | Health check |

## Deployment

See [DEPLOY.md](DEPLOY.md) for the full deployment runbook and gotchas.
