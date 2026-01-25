FROM python:3.12-slim

WORKDIR /app

# Install Node.js for frontend build
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency files
COPY pyproject.toml uv.lock README.md ./
COPY web/package.json web/package-lock.json ./web/

# Install Python dependencies
RUN uv sync --frozen --no-dev

# Install Node dependencies and build frontend
COPY web/ ./web/
RUN cd web && npm ci && npm run build

# Copy the rest of the application
COPY server/ ./server/
COPY mtb/ ./mtb/

# Create data directory for SQLite
RUN mkdir -p /data

ENV DATABASE_PATH=/data/mtb.db

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
