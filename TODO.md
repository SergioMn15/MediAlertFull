# MediAlertV3 - Plan de Proyecto Profesional

## Información Recopilada
- **Proyecto actual**: Prototipo funcional con localStorage
- **Frontend**: HTML, CSS, JavaScript vanilla
- **Stack confirmado**: Node.js + Express + PostgreSQL
- **Objetivo**: Doctor (web) y Paciente (móvil)
- **Despliegue**: Render.com

## Estado: ✅ PROYECTO COMPLETADO

### Archivos Creados:
- ✅ `package.json` - Dependencias del proyecto
- ✅ `server.js` - Servidor principal Express
- ✅ `src/config/db.js` - Conexión PostgreSQL
- ✅ `src/routes/auth.js` - Rutas API REST (autenticación)
- ✅ `src/routes/patients.js` - Rutas API REST (pacientes)
- ✅ `src/routes/doctors.js` - Rutas API REST (doctores)
- ✅ `src/middleware/auth.js` - Autenticación JWT
- ✅ `database/schema.sql` - Estructura BD
- ✅ `database/seed.sql` - Datos de demo
- ✅ `index.html` - Frontend mejorado
- ✅ `styles.css` - Diseño profesional
- ✅ `app.js` - Lógica frontend
- ✅ `Procfile` - Configuración Render
- ✅ `.env.example` - Variables de entorno
- ✅ `README.md` - Documentación completa
- ✅ `.gitignore` - Archivos ignorados
- ✅ `TODO.md` - Este archivo

---

## 📋 Pasos para Ejecutar Localmente

### 1. Configurar PostgreSQL
```bash
# Crear base de datos
createdb medialert

# Ejecutar schema
psql -d medialert -f database/schema.sql

# Insertar datos demo (opcional)
psql -d medialert -f database/seed.sql
```

### 2. Configurar variables de entorno
```bash
# Copiar .env.example a .env y configurar:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=medialert
DB_USER=postgres
DB_PASSWORD=tu_contraseña
JWT_SECRET=tu_secret_key
```

### 3. Iniciar servidor
```bash
npm start
```

### 4. Acceder
- URL: http://localhost:3000
- Doctor: `doctor1` / `medialert123`
- Paciente: `TEST010101HDFAAA09` / `paciente123`

---

## 📋 Pasos para Desplegar en Render.com

### 1. Crear base de datos PostgreSQL en Render
- Dashboard → New → PostgreSQL
- Guardar Internal Database URL

### 2. Crear Web Service
- Dashboard → New → Web Service
- Conectar repositorio GitHub
- Configurar variables de entorno con los datos de PostgreSQL

### 3. Ejecutar schema
- Conectar a la base de datos y ejecutar `database/schema.sql`

### 4. ¡Listo!
- La app estará disponible en https://tu-app.onrender.com

