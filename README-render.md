# Deploy Render + Aiven MediAlert

## Config Render Dashboard

| Setting | Value |
|---------|-------|
| Root Directory | `(vacio)` |
| Build Command | `npm install` |
| Start Command | `npm start` |

## Environment Variables
```env
DATABASE_URL=postgres://user:pass@host:port/defaultdb?sslmode=require
```

Si Aiven te da certificado CA, tambien puedes agregar:
```env
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

## DB detectada desde `DATABASE_URL`
`DATABASE_URL` incluye el nombre de la base:
```text
postgres://user:pass@host:port/defaultdb
```

## Test
```text
https://tu-app.onrender.com/api/health
-> {"mode":"postgresql"}
```
