# Настройка поддержки SSE через traefik

Для корректной работы Server-Sent Events (SSE) через traefik, необходимо использовать следующие настройки в docker-compose.yml:

```yaml
services:
  llm-council:
    # ... остальные настройки
    labels:
      # Основной роут для фронтенда
      - "traefik.http.routers.llm-council.rule=Host(`llm.clusterdev.ru`)"
      - "traefik.http.routers.llm-council.entrypoints=web,websecure"
      - "traefik.http.routers.llm-council.tls=true"
      - "traefik.http.routers.llm-council.tls.certresolver=mytlschallenge"
      - "traefik.http.routers.llm-council.service=llm-council-service"
      
      # Настройки для сервиса фронтенда
      - "traefik.http.services.llm-council-service.loadbalancer.server.port=3000"
      - "traefik.http.services.llm-council-service.loadbalancer.server.scheme=http"
      
      # Роут для API (включая SSE endpoint)
      - "traefik.http.routers.llm-council-api.rule=Host(`llm.clusterdev.ru`) && PathPrefix(`/council`)"
      - "traefik.http.routers.llm-council-api.entrypoints=web,websecure"
      - "traefik.http.routers.llm-council-api.tls=true"
      - "traefik.http.routers.llm-council-api.tls.certresolver=mytlschallenge"
      - "traefik.http.routers.llm-council-api.service=llm-council-api-service"
      - "traefik.http.routers.llm-council-api.priority=100"
      
      # Настройки для API сервиса с учетом SSE
      - "traefik.http.services.llm-council-api-service.loadbalancer.server.port=8000"
      - "traefik.http.services.llm-council-api-service.loadbalancer.server.scheme=http"
      
      # Особые настройки для обработки SSE
      - "traefik.http.services.llm-council-api-service.loadbalancer.responseforwarding.flushinterval=100ms"
```

Ключевые параметры для SSE:
- `flushinterval=100ms` - позволяет traefik отправлять данные клиенту как только они доступны, что критично для SSE
- Правильные таймауты на уровне nginx (уже настроены в nginx.conf)
- Отключение буферизации на уровне nginx (уже настроено в nginx.conf)