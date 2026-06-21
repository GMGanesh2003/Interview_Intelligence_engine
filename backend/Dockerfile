FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (ffmpeg is required for librosa audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip to latest
RUN pip install --upgrade pip

# Install Python dependencies (cache bust v2)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 8000

# Start FastAPI server
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
