# Deploying — both halves on Vercel (Hobby / free)

> **Live:** frontend <https://spotter-eld-web.vercel.app> · API
> <https://spotter-eld-api-cyan.vercel.app> · Postgres by Neon.
> Verified end to end: a planned trip persists across separate GETs.

## Gotchas found while doing this for real

1. **`vercel.json` rejects a `"//"` comment key.** Schema validation fails the
   whole deploy. There is no comment syntax — keep notes out of the file.
2. **Projects created with `vercel project add` have `framework: null`.** Vercel
   then treats a Django app as a static site and fails with *No Output Directory
   named "public"*. Framework auto-detection only runs on dashboard Git import.
   Fix without the dashboard:
   ```bash
   curl -X PATCH -H "Authorization: Bearer $VERCEL_TOKEN" \
     -H "Content-Type: application/json" -d '{"framework":"django"}' \
     "https://api.vercel.com/v9/projects/<project>?teamId=<team>"
   ```
   The SPA project needs `{"framework":"vite"}` for the same reason.
3. **Environment variables do nothing until you redeploy.** `vercel env add`
   only stores the value; the running bundle keeps the old environment. This
   silently breaks CORS in a way that looks like a frontend bug — `curl`
   succeeds while the browser blocks the response, because
   `access-control-allow-origin` is simply absent.
4. **`.vercelignore` is not optional here.** Without it the 184 MB `.venv`
   uploads with every deploy. With it the payload is 123 KB.
5. **`maxDuration` in `functions` is unnecessary** — Hobby already defaults to
   300s, so setting 60 only lowers it. And the `functions` key cannot reference
   `config/wsgi.py` before the framework preset resolves the entrypoint.


Two Vercel projects from this one repo, distinguished only by **Root Directory**:

| Project | Root Directory | What it is |
| --- | --- | --- |
| `spotter-eld-api` | `backend` | Django, one Python Vercel Function |
| `spotter-eld-web` | `frontend` | Vite SPA on the CDN |

Vercel detects Django from `backend/manage.py` and resolves the entrypoint from
`WSGI_APPLICATION`, so there is no shim file and no `@vercel/python` config.

**Do the steps in order** — each project needs the other's URL.

---

## Step 0 — Postgres is mandatory, not optional

SQLite cannot be the production database here, and this is not a preference.

A Vercel function's filesystem is read-only apart from `/tmp`, and `/tmp` is
per-instance. The app's own flow breaks on that:

1. `POST /api/trips/` is planned and saved by instance **A**, which returns the
   full plan. The SPA caches it and routes to `/trips/5`.
2. React Query then background-refetches `GET /api/trips/5/`, which may land on
   instance **B**, whose database has never seen trip 5 → **404**.
3. [`Results.tsx`](frontend/src/pages/Results.tsx) branches on `error || !trip`,
   so the rendered plan is *replaced* by "Could not load this trip".

The result would be an app that intermittently discards a plan it just showed
you. Postgres removes the failure entirely.

**Provision it:** backend project → **Storage** → **Marketplace** → **Neon**
(free tier) → attach to the project. Vercel injects `DATABASE_URL` into the
project's environment automatically — you never copy the credential by hand.

`settings.py` reads `DATABASE_URL` if present and falls back to SQLite when it is
absent, so local development is unaffected and needs no database of its own.

> Prefer Neon's **pooled** connection string if it offers both. Serverless scales
> to many short-lived instances, and a direct endpoint exhausts Postgres
> connection slots faster than a pooler does.

---

## Step 1 — Backend project

Import the repo → set **Root Directory** to `backend`.

Everything else comes from [`backend/vercel.json`](backend/vercel.json):
`buildCommand` runs `migrate --noinput`, and the function gets
`maxDuration: 60` with tests and `db.sqlite3` excluded from the bundle.
Python is pinned to 3.14 by [`backend/.python-version`](backend/.python-version).

Environment variables:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | injected by Neon — do not set by hand |
| `DJANGO_SECRET_KEY` | a long random string (`python -c "import secrets;print(secrets.token_urlsafe(64))"`) |
| `DJANGO_DEBUG` | `0` |
| `DJANGO_ALLOWED_HOSTS` | `spotter-eld-api.vercel.app` (no scheme, no trailing slash) |
| `CORS_ALLOWED_ORIGINS` | leave blank until Step 3 |
| `ORS_API_KEY` | optional — see Notes |

Verify:

```bash
curl https://spotter-eld-api.vercel.app/api/health/
# {"status":"ok"}
```

If this 500s, check the build log for the `migrate` step — that is where a bad
`DATABASE_URL` surfaces.

---

## Step 2 — Frontend project

Import the **same repo again** → set **Root Directory** to `frontend`. Framework
preset is detected as Vite. [`frontend/vercel.json`](frontend/vercel.json)
already supplies the SPA rewrite that keeps deep links like `/trips/5` from
404ing.

| Key | Value |
| --- | --- |
| `VITE_API_BASE` | `https://spotter-eld-api.vercel.app/api` |

Three things that bite:

- **The `/api` suffix is required.** [`client.ts`](frontend/src/api/client.ts)
  uses this value verbatim, falling back to `/api` only in dev where Vite
  proxies. Omit it and every request 404s.
- **No trailing slash.**
- Vite inlines `VITE_*` at **build** time. Changing it requires a redeploy.

---

## Step 3 — CORS, back on the backend project

The two projects are separate origins, so the browser enforces CORS. With
`DJANGO_DEBUG=0`, `settings.py` sets `CORS_ALLOW_ALL_ORIGINS = DEBUG` → `False`.
Until this is set, `curl` succeeds while the browser blocks every call — which
reads as a frontend bug and isn't one.

```
CORS_ALLOWED_ORIGINS=https://spotter-eld-web.vercel.app
```

Scheme included, no trailing slash, no path. Redeploy the backend. Add preview
domains comma-separated if you want them working too.

---

## Notes and known limits

**Cold starts.** The function bundles numpy plus 65 MB of `timezonefinder`
timezone data, so a cold invocation is slow (seconds) while a warm one is fast.
Nothing is broken; the first request after idle just pays the import cost.

**Bundle size.** Runtime dependencies are ~160 MB against a 500 MB limit for
Python functions, so there is comfortable headroom.

**Car routing, not truck.** With `ORS_API_KEY` unset the app falls back to the
public OSRM demo server, which models a car. A free
[OpenRouteService](https://openrouteservice.org/dev/#/signup) key switches it to
the `driving-hgv` truck profile, correct for a CMV.

**Migration drift.** `migrate` warns about an unmade migration for `Stop.kind`.
It is a `choices=` change only, with no schema effect. Run `makemigrations` to
silence it.
