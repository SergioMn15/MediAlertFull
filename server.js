const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Importar rutas
const authRoutes = require('./src/routes/auth');
const patientsRoutes = require('./src/routes/patients');
const doctorsRoutes = require('./src/routes/doctors');

// Datos en memoria para modo demo
let demoData = {
  doctors: {},
  patients: {},
  medications: {},
  appointments: {}
};

// Verificar si usamos BD o modo demo
let useDatabase = false;
let db = null;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para compartir datos demo
app.use((req, res, next) => {
  req.demoData = demoData;
  req.useDatabase = useDatabase;
  next();
});

// Servir archivos estáticos (frontend)
app.use(express.static(path.join(__dirname, '.')));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/doctors', doctorsRoutes);

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: useDatabase ? 'MediAlert API con PostgreSQL' : 'MediAlert API en modo demo (sin BD)',
    timestamp: new Date().toISOString()
  });
});

// Endpoint de info
app.get('/api', (req, res) => {
  res.json({
    name: 'MediAlert API',
    version: '1.0.0',
    mode: useDatabase ? 'postgresql' : 'demo',
    endpoints: {
      auth: '/api/auth',
      patients: '/api/patients',
      doctors: '/api/doctors'
    }
  });
});

// Servir index.html para cualquier ruta no manejada (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Algo salió mal!' });
});

// Función para inicializar modo demo
function initializeDemoData() {
  // Crear doctor demo
  demoData.doctors['doctor1'] = {
    id: 1,
    username: 'doctor1',
    email: 'doctor1@medialert.mx',
    password: bcrypt.hashSync('medialert123', 10),
    name: 'Dra. Laura Hernández',
    license: 'CED-9081726',
    specialty: 'Medicina Interna'
  };

  // Crear paciente demo
  demoData.patients['TEST010101HDFAAA09'] = {
    id: 1,
    curp: 'TEST010101HDFAAA09',
    name: 'Rosa Martínez',
    password: bcrypt.hashSync('paciente123', 10),
    doctor_id: 1,
    created_at: new Date().toISOString()
  };

  // Crear medicamentos demo
  demoData.medications[1] = [
    {
      id: 1,
      patient_id: 1,
      name: 'Losartán',
      dose_mg: 50,
      time: '08:00:00',
      notes: 'Tomar después del desayuno',
      emoji: '💊',
      prescribed_by: 'Dra. Laura Hernández',
      prescribed_at: new Date().toISOString()
    },
    {
      id: 2,
      patient_id: 1,
      name: 'Metformina',
      dose_mg: 850,
      time: '14:00:00',
      notes: 'Tomar con alimentos',
      emoji: '🩺',
      prescribed_by: 'Dra. Laura Hernández',
      prescribed_at: new Date().toISOString()
    }
  ];

  // Citas demo
  demoData.appointments[1] = [
    {
      id: 1,
      patient_id: 1,
      date: '2024-12-25',
      time: '10:00:00',
      status: 'pending',
      created_at: new Date().toISOString()
    }
  ];

  console.log('✅ Modo demo inicializado con datos de prueba');
}

// Intentar conectar a PostgreSQL
async function initDatabase() {
  try {
    const { Pool } = require('pg');
    db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'medialert',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    });

    // Probar conexión
    await db.query('SELECT 1');
    useDatabase = true;
    console.log('✅ Conectado a PostgreSQL');
    
    // Crear datos demo si no existen
    await ensureDatabaseDemoData();
    
  } catch (error) {
    console.log('⚠️ No hay conexión a PostgreSQL, usando modo demo');
    console.log('   Para usar PostgreSQL, configura el archivo .env');
    useDatabase = false;
    initializeDemoData();
  }
}

// Crear datos demo en PostgreSQL
async function ensureDatabaseDemoData() {
  try {
    const bcrypt = require('bcryptjs');
    
    // Crear tablas si no existen
    await db.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        license VARCHAR(50) NOT NULL,
        specialty VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        curp VARCHAR(18) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS medications (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        dose_mg INTEGER NOT NULL,
        time TIME NOT NULL,
        notes TEXT,
        emoji VARCHAR(10) DEFAULT '💊',
        prescribed_by VARCHAR(100),
        prescribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Verificar si hay datos
    const doctorCheck = await db.query('SELECT id FROM doctors WHERE username = $1', ['doctor1']);
    
    if (doctorCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('medialert123', 10);
      await db.query(
        'INSERT INTO doctors (username, email, password, name, license, specialty) VALUES ($1, $2, $3, $4, $5, $6)',
        ['doctor1', 'doctor1@medialert.mx', hashedPassword, 'Dra. Laura Hernández', 'CED-9081726', 'Medicina Interna']
      );
      console.log('✅ Doctor demo creado en PostgreSQL');
    }

    const patientCheck = await db.query('SELECT id FROM patients WHERE curp = $1', ['TEST010101HDFAAA09']);
    
    if (patientCheck.rows.length === 0) {
      const doctor = await db.query('SELECT id FROM doctors WHERE username = $1', ['doctor1']);
      
      if (doctor.rows.length > 0) {
        const hashedPassword = await bcrypt.hash('paciente123', 10);
        const patientResult = await db.query(
          'INSERT INTO patients (curp, name, password, doctor_id) VALUES ($1, $2, $3, $4) RETURNING id',
          ['TEST010101HDFAAA09', 'Rosa Martínez', hashedPassword, doctor.rows[0].id]
        );
        
        await db.query(
          'INSERT INTO medications (patient_id, name, dose_mg, time, notes, emoji, prescribed_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [patientResult.rows[0].id, 'Losartán', 50, '08:00:00', 'Tomar después del desayuno', '💊', 'Dra. Laura Hernández']
        );
        await db.query(
          'INSERT INTO medications (patient_id, name, dose_mg, time, notes, emoji, prescribed_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [patientResult.rows[0].id, 'Metformina', 850, '14:00:00', 'Tomar con alimentos', '🩺', 'Dra. Laura Hernández']
        );
        
        console.log('✅ Paciente demo creado en PostgreSQL');
      }
    }
    
    console.log('✅ Datos de PostgreSQL verificados');
  } catch (error) {
    console.error('❌ Error con PostgreSQL:', error.message);
  }
}

// Exportar db para las rutas
app.set('db', db);
app.set('demoData', demoData);
app.set('useDatabase', useDatabase);

// Iniciar servidor
initDatabase().then(() => {
  app.listen(PORT, () => {
    const mode = useDatabase ? 'PostgreSQL' : 'DEMO (sin BD)';
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🏥 MediAlertV3 - Servidor iniciado                    ║
║                                                          ║
║   📡 Servidor: http://localhost:${PORT}                   ║
║   🔗 API:       http://localhost:${PORT}/api               ║
║   📊 Modo:      ${mode.padEnd(42)}║
║   📊 Health:    http://localhost:${PORT}/api/health        ║
║                                                          ║
║   Credenciales demo:                                     ║
║   👨‍⚕️ Doctor:   doctor1 / medialert123                  ║
║   👤 Paciente: TEST010101HDFAAA09 / paciente123         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);
  });
});

module.exports = app;

