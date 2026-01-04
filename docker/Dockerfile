# Многоступенчатый Dockerfile для LLM Council
# Stage 1: Сборка фронтенда
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./
RUN npm install

# Копируем исходный код фронтенда
COPY . .

# Собираем фронтенд
RUN npm run build

# Stage 2: Установка бэкенда
FROM python:3.11-slim AS backend

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Установка зависимостей Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Копируем исходный код бэкенда
COPY . .

# Копируем собранный фронтенд из предыдущего этапа
COPY --from=frontend-builder /app/dist /app/dist

# Stage 3: Установка и настройка Nginx
FROM nginx:alpine AS production

# Копируем конфигурацию Nginx
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/nginx.conf

# Копируем собранный фронтенд
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Копируем бэкенд
COPY --from=backend /app /app/backend

# Копируем Python из backend stage
COPY --from=backend /usr/local/bin/ /usr/local/bin/
COPY --from=backend /usr/local/lib/python3.11/ /usr/local/lib/python3.11/

# Устанавливаем переменные окружения для Python
ENV PATH="/usr/local/bin:$PATH"
ENV PYTHONPATH="/usr/local/lib/python3.11/site-packages"

WORKDIR /app

# Устанавливаем Python зависимости в контейнер с Nginx
# Удалено из-за PEP 668 - зависимости теперь в backend stage

# Копируем переменные окружения
COPY services/.env /app/backend/services/.env

EXPOSE 3000 8000

CMD ["/bin/sh", "-c", "nginx & cd /app/backend && python -m uvicorn main:app --host 0.0.0.0 --port 800"]
