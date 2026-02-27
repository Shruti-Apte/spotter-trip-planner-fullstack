# Backend only: build from repo root so Railway uses Docker instead of Railpack
FROM python:3.11-slim

WORKDIR /app

# Optional: pass MAPBOX_ACCESS_TOKEN at build time if Railway doesn't inject it at runtime
ARG MAPBOX_ACCESS_TOKEN=
ENV MAPBOX_ACCESS_TOKEN=${MAPBOX_ACCESS_TOKEN}

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

CMD python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000}
