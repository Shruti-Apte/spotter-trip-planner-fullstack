# Spotter Trip Planner

Full-stack trip planning app: React (Vite) frontend and Django backend with Mapbox for geocoding and directions.

## Project structure

- **`frontend/`** — Vite + React app (map, trip form, logs)
- **`backend/`** — Django API (plan trip, places search, Mapbox integration)

## Local development

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp env.example .env         # then edit .env and set MAPBOX_ACCESS_TOKEN
python manage.py runserver  # http://localhost:8000
```

### 2. Frontend

```bash
cd frontend
npm install
cp env.example .env        # optional: set VITE_API_URL, VITE_MAPBOX_ACCESS_TOKEN
npm run dev                # http://localhost:5173
```

- **API URL:** Frontend uses `VITE_API_URL` (default `http://localhost:8000`) to call the backend.
- **Mapbox:** Set `MAPBOX_ACCESS_TOKEN` in `backend/.env` and optionally `VITE_MAPBOX_ACCESS_TOKEN` in `frontend/.env` for the map.

See `backend/env.example` and `frontend/env.example` for all env vars.

## Deployment

### Backend (e.g. Railway, Render, Fly.io)

1. Set environment variables (from `backend/env.example`):
   - **Required:** `MAPBOX_ACCESS_TOKEN`
   - **Production:** `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ORIGINS`
2. Run: `pip install -r requirements.txt`, then your ASGI/WSGI server (e.g. `gunicorn config.wsgi:application`).
3. Point `DJANGO_CORS_ORIGINS` at your frontend URL (e.g. `https://your-app.vercel.app`).

### Frontend (e.g. Vercel, Netlify)

1. Build: `npm ci && npm run build` (output in `frontend/dist/`).
2. Set env at build time:
   - **`VITE_API_URL`** — your deployed backend URL (e.g. `https://your-api.railway.app`).
   - **`VITE_MAPBOX_ACCESS_TOKEN`** — Mapbox public token for the map.
3. Serve the `dist/` folder as a static site.

### Checklist

- [ ] Backend: `DJANGO_SECRET_KEY` set, `DEBUG=false`, `ALLOWED_HOSTS` and `DJANGO_CORS_ORIGINS` set for production.
- [ ] Frontend: `VITE_API_URL` points at the deployed API; `VITE_MAPBOX_ACCESS_TOKEN` set for maps.
- [ ] Never commit `.env` files; use platform env or secrets.
