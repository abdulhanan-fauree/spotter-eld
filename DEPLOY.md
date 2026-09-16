# Deploying

Backend (Django API) → Render. Frontend (Vite SPA) → Vercel.

**Do these in order.** Each side needs the other's URL, so the sequence below
resolves that: deploy the API first, point the frontend at it, then come back and
allow the frontend's origin through CORS.

---

## Step 1 — Backend on Render

Dashboard → **New** → **Blueprint** → select `abdulhanan-fauree/spotter-eld`.
Render reads [`render.yaml`](render.yaml) and pre-fills everything except the
values marked `sync: false`, which it prompts for.

| Setting | Value | Source |
| --- | --- | --- |
| Root Directory | `backend` | render.yaml |
| Build Command | `pip install -r requirements.txt && python manage.py migrate` | render.yaml |
| Start Command | `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2` | render.yaml |
| Health Check | `/api/health/` | render.yaml |
| `PYTHON_VERSION` | `3.14.6` | render.yaml |
| `DJANGO_SECRET_KEY` | auto-generated | render.yaml |
| `DJANGO_DEBUG` | `0` | render.yaml |
| `DJANGO_ALLOWED_HOSTS` | **you enter this** — see below | prompted |
| `CORS_ALLOWED_ORIGINS` | **leave blank for now** — Step 3 | prompted |
| `ORS_API_KEY` | optional — see Notes | prompted |

`DJANGO_ALLOWED_HOSTS` is the service's own hostname, no scheme and no trailing
slash. If you name the service `spotter-eld-api`, that is:

```
spotter-eld-api.onrender.com
```

Verify before moving on:

```bash
curl https://spotter-eld-api.onrender.com/api/health/
# {"status":"ok"}
```

---

## Step 2 — Frontend on Vercel

Dashboard → **Add New** → **Project** → import the same repo.

| Setting | Value |
| --- | --- |
| Framework Preset | Vite (auto-detected) |
| **Root Directory** | **`frontend`** — must be set, it is not the repo root |
| Build Command | `npm run build` (default) |
| Output Directory | `dist` (default) |
| Install Command | `npm install` (default) |

Add one environment variable:

| Key | Value |
| --- | --- |
| `VITE_API_BASE` | `https://spotter-eld-api.onrender.com/api` |

Three things that bite here:

- **The `/api` suffix is required.** [`src/api/client.ts`](frontend/src/api/client.ts)
  uses `VITE_API_BASE` verbatim as its base, falling back to `/api` only in dev
  where Vite proxies. Omit the suffix and every request 404s.
- **No trailing slash** after `/api`.
- Vite inlines `VITE_*` vars at **build** time, not runtime. Changing this value
  requires a redeploy to take effect.

---

## Step 3 — Back to Render, open up CORS

With `DJANGO_DEBUG=0`, `settings.py` sets `CORS_ALLOW_ALL_ORIGINS = DEBUG` →
`False`. Until you do this step the browser blocks every API call, even though
`curl` works fine.

Render → your service → **Environment** → set:

```
CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
```

Scheme included, no trailing slash, no path. Save — Render redeploys.

To also allow Vercel preview deployments, add them comma-separated (the setting
is split on `,`):

```
CORS_ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-app-git-main-you.vercel.app
```

Then load the Vercel URL and plan a trip end to end.

---

## Notes and known limits

**Free-tier cold starts.** Render free web services sleep after ~15 minutes
idle. The next request takes ~50 seconds while the container wakes. The health
check does not prevent this. First load after idle looks broken but isn't.

**SQLite resets.** The free plan has no persistent disk — the filesystem is
rebuilt from the build artifact on every deploy and restart, so `migrate` at
build ships an empty database and saved trips disappear. The geocode cache
rebuilds itself from Nominatim on demand. To make trips persist, add a Render
Postgres instance and:

```
pip install 'psycopg[binary]' dj-database-url   # add both to requirements.txt
```

then replace `DATABASES` in `backend/config/settings.py` with
`dj_database_url.config(default=..., conn_max_age=600)`. Render's free Postgres
is deleted after 30 days.

**Car routing, not truck.** With `ORS_API_KEY` unset the app falls back to the
public OSRM demo server, which models a car. A free
[OpenRouteService](https://openrouteservice.org/dev/#/signup) key switches it to
the `driving-hgv` truck profile, which is the correct model for a CMV.

**Migration drift.** `manage.py migrate` warns about an unmade migration for
`Stop.kind`. It is a `choices=` change only; SQLite does not enforce choices, so
it has no schema effect. Run `makemigrations` if you want the warning gone.
