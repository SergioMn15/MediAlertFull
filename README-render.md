# Deploy Render + Aiven MediAlert

## Config Render Dashboard

| Setting | Value |
|---------|-------|
| Root Directory | `(vacio)` |
| Build Command | `npm install` |
| Start Command | `npm start` |

## Environment Variables
```env
DATABASE_URL=postgres://user:pass@host:port/medialert?sslmode=require
```

## DB `medialert` detection
`DATABASE_URL` incluye el nombre de la base:
```text
postgres://user:pass@host:port/medialert
```

## Test
```text
https://tu-app.onrender.com/api/health
-> {"mode":"postgresql"}
```
