FROM python:3.12-alpine

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server ./server
COPY studio ./studio
# The tablet renderer, a committed copy of the repo's web/ folder, synced by package-addon.ps1.
COPY renderer ./renderer

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "server"]
