# Многоступенчатый Dockerfile для LLM Council
# Используем Python-контейнер с установленным nginx для решения проблемы "python3: not found"

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
FROM python:3.11-alpine AS backend

WORKDIR /app

# Установка системных зависимостей
RUN apk add --no-cache gcc musl-dev

# Установка зависимостей Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Копируем исходный код бэкенда
COPY . .

# Копируем собранный фронтенд из предыдущего этапа
COPY --from=frontend-builder /app/dist /app/dist

# Stage 3: Финальный образ с Python и nginx
FROM python:3.11-alpine AS production

# Установка nginx и необходимых утилит
RUN apk add --no-cache nginx supervisor && \
    # Создание директории для статических файлов
    mkdir -p /usr/share/nginx/html && \
    # Создание директории для конфигурации nginx
    mkdir -p /etc/nginx/conf.d && \
    # Создание директории для конфигурации supervisor
    mkdir -p /etc/supervisor/conf.d

WORKDIR /app

# Копируем конфигурацию Nginx
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Копируем конфигурацию Supervisor
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Копируем собранный фронтенд
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Копируем бэкенд
COPY --from=backend /app /app

WORKDIR /app

# Копируем переменные окружения
COPY services/.env /app/services/.env

EXPOSE 3000 8000

# Запуск supervisor, который управляет nginx и uvicorn
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
