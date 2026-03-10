# MediAlertV3 🏥

Sistema profesional de gestión de citas y medicamentos para pacientes y doctores.

## Características

- **Autenticación segura** con JWT (JSON Web Tokens)
- **Gestión de pacientes** - Alta, modificación y seguimiento
- **Recetas médicas** - Asignación de medicamentos con dosis y horarios
- **Citas médicas** - Agendamiento y seguimiento de citas
- **Interfaz profesional** diseñada para doctores y pacientes
- **Exportación PDF** de recetas médicas
- **Diseño responsivo** adaptable a dispositivos móviles
- **Base de datos PostgreSQL** en la nube (Render.com)

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript Vanilla
- **Backend**: Node.js + Express
- **Base de datos**: PostgreSQL
- **Despliegue**: Render.com

## Requisitos Previos

- Node.js (v14 o superior)
- PostgreSQL (local o en la nube)
- npm o yarn

## Instalación Local

### 1. Clonar el proyecto
```bash
cd MediAlert/MediAlertV3
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo `.env.example` a `.env` y configura tus valores:

```env
# Puerto del servidor
PORT=3000

# PostgreSQL (configura según tu base de datos)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=medialert
DB_USER=postgres
DB_PASSWORD=tu_contraseña

# JWT Secret (cambia en producción)
JWT_SECRET=tu_secret_key_muy_segura
```

### 4. Crear la base de datos

Si usas PostgreSQL local:

```bash
# Crear base de datos
createdb medialert

# Ejecutar schema
psql -d medialert -f database/schema.sql

# (Opcional) Insertar datos demo
psql -d medialert -f database/seed.sql
```

**Nota**: Los datos de demo en `seed.sql` tienen contraseñas encriptadas. Para el primer uso, el servidor creará automáticamente las credenciales de demo con la primera conexión.

### 5. Iniciar el servidor

```bash
npm start
```

El servidor estará disponible en: **http://localhost:3000**

## Credenciales de Demo

### Doctor
- **Usuario**: `doctor1`
- **Contraseña**: `medialert123`

### Paciente
- **CURP**: `TEST010101HDFAAA09`
- **Contraseña**: `paciente123`

## Estructura del Proyecto

```
MediAlertV3/
├── database/
│   ├── schema.sql      # Estructura de la base de datos
│   └── seed.sql        # Datos de ejemplo
├── src/
│   ├── config/
│   │   └── db.js       # Conexión a PostgreSQL
│   ├── middleware/
│   │   └── auth.js     # Autenticación JWT
│   └── routes/
│       ├── auth.js     # Rutas de autenticación
│       ├── doctors.js  # Rutas de doctores
│       └── patients.js # Rutas de pacientes
├── public/             # Archivos estáticos (frontend)
├── server.js           # Servidor principal
├── package.json
├── Procfile            # Configuración para Render
└── .env.example        # Variables de entorno ejemplo
```

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar doctor
- `GET /api/auth/verify` - Verificar token

### Pacientes
- `GET /api/patients` - Listar pacientes (doctor)
- `POST /api/patients` - Registrar paciente (doctor)
- `GET /api/patients/:curp` - Obtener datos de paciente
- `GET /api/patients/:curp/medications` - Ver medicamentos
- `POST /api/patients/:curp/medications` - Asignar medicamento (doctor)
- `GET /api/patients/:curp/appointments` - Ver citas
- `POST /api/patients/:curp/appointments` - Agendar cita

### Doctores
- `GET /api/doctors/profile` - Ver perfil
- `GET /api/doctors/:id/patients` - Ver pacientes del doctor
- `GET /api/doctors/:id/appointments` - Ver todas las citas

## Despliegue en Render.com

### Paso 1: Preparar cuenta de Render
1. Crea una cuenta en [render.com](https://render.com)
2. Crea una base de datos PostgreSQL:
   - Dashboard → New → PostgreSQL
   - Nombre: `medialert-db`
   - Guarda los valores de `Internal Database URL`

### Paso 2: Configurar el servicio web
1. Dashboard → New → Web Service
2. Conecta tu repositorio de GitHub
3. Configura:
   - **Name**: `medialert`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `DB_HOST`: (del paso anterior)
     - `DB_PORT`: 5432
     - `DB_NAME`: medialert
     - `DB_USER`: (de Render)
     - `DB_PASSWORD`: (de Render)
     - `JWT_SECRET`: (genera una clave aleatoria)

### Paso 3: Configurar base de datos
1. Conecta a tu base de datos PostgreSQL desde Render
2. Ejecuta el contenido de `database/schema.sql`
3. (Opcional) Ejecuta `database/seed.sql` para datos demo

### Paso 4: Desplegar
1. Click en "Create Web Service"
2. Espera a que termine el build
3. Tu app estará disponible en: `https://tu-app.onrender.com`

## Uso

### Como Doctor:
1. Inicia sesión con tus credenciales
2. Registra nuevos pacientes (CURP, nombre, contraseña)
3. Asigna medicamentos a tus pacientes
4. Consulta la lista de pacientes y sus citas

### Como Paciente:
1. Inicia sesión con tu CURP y contraseña
2. Consulta tu receta médica
3. Ve tus próximos medicamentos
4. Agenda citas con tu doctor
5. Descarga tu receta en PDF

## Licencia

MIT License - Feel free to use this project for learning or commercial purposes.

