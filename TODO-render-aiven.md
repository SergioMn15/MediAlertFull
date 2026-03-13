# Checklist Deploy Aiven + Render ✅

## 🟢 **Preparación Local (LISTO)**
- [x] Server.js monolito funciona (`npm start`)
- [x] API auth/patients/doctors OK (demo data)
- [x] Frontend responsive + login persistente
- [x] CORS configurado

## 🟡 **Aiven PostgreSQL**
```
[ ] 1. Aiven.io → Create PostgreSQL
[ ] 2. Copia DATABASE_URL (postgres://...)
[ ] 3. Crea .env:
       DATABASE_URL=\"tu-url-aqui\"
[ ] 4. npm start → \"Base de datos conectada\"
[ ] 5. /api/health → {\"mode\": \"postgresql\"}
```

## 🟢 **Render Deploy**
```
[ ] 1. package.json (raíz):
        \"scripts\": {\"start\": \"node server.js\"}
[ ] 2. git add . && git commit -m \"Render ready\" && git push
[ ] 3. render.com → New → Web Service → GitHub repo
[ ] 4. Environment Variables → DATABASE_URL (Aiven)
[ ] 5. Deploy → https://tu-app.onrender.com
```

## 🧪 **Test Final**
```
Doctor: doctor1/medialert123 → Registra pacientes
Paciente: TEST010101HDFAAA09/paciente123 → Recetas/citas
```

**¡Proyecto perfecto para producción!** No hay errores estructurales.
