# Bot Teams para reservas de salas

MVP con tres piezas:

- `frontend`: panel administrativo React/Vite.
- `backend`: API Express, Postgres y endpoint Bot Framework.
- `gateway`: Nginx que publica frontend y backend bajo el mismo host.

## Ejecutar local

```bash
docker compose up --build
```

URLs locales:

- Panel: `http://localhost:8080`
- Health backend: `http://localhost:8080/health`
- Endpoint Azure Bot: `https://TU_DOMINIO/api/messages`

## Variables `.env`

```bash
POSTGRES_PASSWORD=usa_un_password_local
PUBLIC_URL=https://tu-dominio-publico
FRONTEND_URL=https://tu-dominio-publico
CLOUDFLARE_TUNNEL_TOKEN=token_del_tunel
MicrosoftAppId=app_id_del_bot_en_azure
MicrosoftAppPassword=client_secret_del_bot_en_azure
DEFAULT_EMAIL_DOMAIN=empresa.cl
```

## Cloudflare Tunnel

En Cloudflare Zero Trust crea un tunnel y un public hostname HTTPS.

Configura el servicio del public hostname hacia:

```text
http://gateway:8080
```

Con eso Azure Bot debe apuntar a:

```text
https://tu-dominio-publico/api/messages
```

Referencias oficiales:

- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/setup/
- Bot Framework SDK y Azure AI Bot Service: https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-basics?view=azure-bot-service-4.0
- Bots en Teams: https://learn.microsoft.com/en-us/microsoftteams/platform/bots/build-conversational-capability

## Comandos del bot

```text
ayuda
salas
reservas hoy
reservas 2026-04-29
reservar Sala Directorio 2026-04-29 09:00 10:00 Reunion gerencia
```
