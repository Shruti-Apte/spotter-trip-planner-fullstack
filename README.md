# Spotter Trip Planner (React + Django)

Live app: https://spotter-trip-planner-fullstack.netlify.app  
API: https://spotter-trip-planner-fullstack-production.up.railway.app  

Full-stack trip planning system that generates FMCSA Hours-of-Service compliant routes, fuel/rest stops, and DOT-style daily log sheets.

---

## Overview and Features

- **Trip input form:** current location | pickup | dropoff | cycle hours used
- **Route and stops visualisation:** Mapbox route with markers (current | pickup | dropoff | fuel | rest)
- **HOS Compliance Logic:** 11-hr drive | 14-hr window | 30-min break | 10-hr reset | 34-hr restart | split sleeper
- **Operational Rules:** +1 hr service time (pickup/dropoff) | fuel ≤ 1000 miles
- **Daily log sheets:** DOT-style grid with continuous SVG duty line
- **Responsive user interface:** desktop split layout | mobile map-first with swipe sheet | dark/light support
---

## Tech Stack

- **Frontend:** React (Vite), Tailwind CSS, Mapbox GL JS, lucide‑react icons  
- **Backend:** Django  
- **Mapping:** Mapbox Geocoding and Directions APIs  
- **Deployment:** Netlify (frontend), Railway with Docker + Gunicorn (backend)  
- **Languages:** JavaScript for the client, Python for the server

---

## Architecture

### Frontend
- TripForm → validation + typeahead
- MapView → route + interactive markers
- LogsPanel → SVG duty line rendering
- BottomSheet → Swipe up mobile UX - stops and logs.

### Backend
- /api/places/ → typeahead suggestions
- /api/plan/ → route + compliance logic + log generation
- timeline_engine.py → compliance calculations
- log_sheet_generator.py → groups segments into daily logs

Data flow (high level):

1. Client submits trip details to `/api/plan/`.  
2. Backend geocodes locations and calls Mapbox Directions to obtain legs and geometry.  
3. `timeline_engine` builds an HOS‑compliant list of duty segments with inserted breaks, fuel stops, and resets.  
4. `log_sheet_generator` groups these segments into daily logs.  
5. Response is returned as JSON and rendered by the React application.

---

## Project Structure

- `frontend/` – React + Vite application (trip form, map, logs, mobile bottom sheet).  
- `backend/` – Django project and `trips` app implementing API and HOS logic.

---

## Running Locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp env.example .env         # configure MAPBOX_ACCESS_TOKEN and other variables
python manage.py runserver  # http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
cp env.example .env         # configure VITE_API_URL and VITE_MAPBOX_ACCESS_TOKEN if required
npm run dev                 # http://localhost:5173
```

Notes:

- If `VITE_API_URL` is not set, the frontend defaults to `http://localhost:8000`.  
- Maps require:
  - `MAPBOX_ACCESS_TOKEN` in `backend/.env`, and
  - optionally `VITE_MAPBOX_ACCESS_TOKEN` in `frontend/.env` for client‑side Mapbox.

Environment variables are documented in `backend/env.example` and `frontend/env.example`.

---

## Decisions and Challenges: 

- Chose Mapbox APIs for geocoding + routing due to documentation quality and frontend compatibility.
- Kept compliance logic on the backend to separate computation from UI.
- Modeling multi-day time segments without overlap.
- Rendering a continuous 24-hour duty line in SVG.
- Coordinating frontend ↔ backend JSON contracts cleanly.
- Handling edge cases around resets and cycle limits.

---

## Deployment

- Frontend: Netlify  
- Backend: Railway (Docker + Gunicorn)
- Environment-based configuration via .env

---

## Screenshots

### Desktop layout
![Desktop layout](frontend/public/assets/desktop-view.png)

### Mobile view
<img src="frontend/public/assets/mobile-view.png" width="300" />

