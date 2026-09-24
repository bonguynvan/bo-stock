# Python 3.12 on Debian bookworm — asyncpg/SQLAlchemy wheels are reliably
# available, and Playwright's `--with-deps` package list matches bookworm
# (trixie renamed the font packages, breaking `playwright install --with-deps`).
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium for the Vietstock BCTC crawler (headless render of the JS-built doc list).
RUN playwright install --with-deps chromium

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
