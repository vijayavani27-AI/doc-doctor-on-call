# ---- build the React PWA ----
FROM node:20-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ---- API + static site ----
FROM python:3.12-slim
WORKDIR /app
# Tesseract OCR (English + Tamil) for our own report reader
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-tam libgomp1 \
 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY datasets/ datasets/
COPY --from=web /app/frontend/dist frontend/dist
ENV DOC_INSTANCE_DIR=/data PORT=8000 PYTHONUNBUFFERED=1
VOLUME /data
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
