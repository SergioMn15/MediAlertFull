const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const authRoutes = require('./backend/src/routes/auth');
const patientsRoutes = require('./backend/src/routes/patients');
const doctorsRoutes = require('./backend/src/routes/doctors');
const { getPool } = require('./backend/src/config/db');

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, 'frontend');

let demoData = createEmptyDemoData();
let useDatabase = false;
let db = null;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.demoData = demoData;
  req.useDatabase = useDatabase;
  next();
});

app.use(express.static(frontendDir));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/doctors', doctorsRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: useDatabase ? 'postgresql' : 'demo',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'MediAlert API',
    version: '1.0.0',
    mode: useDatabase ? 'postgresql' : 'demo',
    endpoints: {
      auth: '/api/auth',
      patients: '/api/patients',
      doctors: '/api/doctors',
      health: '/api/health'
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get('/patient/:page', (req, res, next) => {
  sendFrontendPage(res, next, path.join(frontendDir, 'patient', req.params.page));
});

app.get('/doctor/:page', (req, res, next) => {
  sendFrontendPage(res, next, path.join(frontendDir, 'doctor', req.params.page));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Algo salio mal' });
});

function sendFrontendPage(res, next, filePath) {
  res.sendFile(filePath, (error) => {
    if (error) {
      next();
    }
  });
}

function createEmptyDemoData() {
  return {
    doctors: {},
    patients: {},
    prescriptions: {},
    medications: {},
    appointments: {},
    appointmentRequests: {}
  };
}

function initializeDemoData() {
  demoData = createEmptyDemoData();

  demoData.doctors.doctor1 = {
    id: 1,
    username: 'doctor1',
    email: 'doctor1@medialert.mx',
    password: bcrypt.hashSync('medialert123', 10),
    name: 'Dra. Laura Hernandez',
    license: 'CED-9081726',
    specialty: 'Medicina Interna'
  };

  demoData.patients.TEST010101HDFAAA09 = {
    id: 1,
    curp: 'TEST010101HDFAAA09',
    name: 'Rosa Martinez',
    password: bcrypt.hashSync('paciente123', 10),
    doctor_id: 1,
    created_at: new Date().toISOString()
  };

  demoData.prescriptions[1] = [
    {
      id: 1,
      patient_id: 1,
      doctor_id: 1,
      diagnosis: 'Control de hipertension arterial y glucosa',
      general_instructions: 'Mantener hidratacion, dieta balanceada y seguimiento semanal.',
      status: 'active',
      issued_at: new Date().toISOString(),
      items: [
        {
          id: 1,
          prescription_id: 1,
          name: 'Losartan',
          dose_mg: 50,
          frequency: 'Cada 24 horas',
          time: '08:00:00',
          duration_days: 30,
          notes: 'Tomar despues del desayuno',
          emoji: '💊'
        },
        {
          id: 2,
          prescription_id: 1,
          name: 'Metformina',
          dose_mg: 850,
          frequency: 'Cada 12 horas',
          time: '14:00:00',
          duration_days: 30,
          notes: 'Tomar con alimentos',
          emoji: '🩺'
        }
      ]
    }
  ];

  demoData.medications[1] = demoData.prescriptions[1][0].items.map((item) => ({
    id: item.id,
    patient_id: 1,
    name: item.name,
    dose_mg: item.dose_mg,
    time: item.time,
    notes: item.notes,
    emoji: item.emoji,
    prescribed_by: 'Dra. Laura Hernandez',
    prescribed_at: demoData.prescriptions[1][0].issued_at
  }));

  demoData.appointments[1] = [
    {
      id: 1,
      patient_id: 1,
      date: '2026-03-20',
      time: '10:00:00',
      status: 'scheduled',
      created_at: new Date().toISOString()
    }
  ];

  app.set('demoData', demoData);
  app.set('useDatabase', false);
  app.set('db', null);
}

async function ensureDatabaseSchema() {
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
    CREATE TABLE IF NOT EXISTS prescriptions (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
      diagnosis TEXT,
      general_instructions TEXT,
      status VARCHAR(20) DEFAULT 'active',
      issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS prescription_items (
      id SERIAL PRIMARY KEY,
      prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      dose_mg INTEGER NOT NULL,
      frequency VARCHAR(100),
      time TIME NOT NULL,
      duration_days INTEGER,
      notes TEXT,
      emoji VARCHAR(10) DEFAULT '💊'
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
    CREATE TABLE IF NOT EXISTS appointment_requests (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      requested_date DATE NOT NULL,
      requested_time TIME NOT NULL,
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      doctor_response TEXT,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      time TIME NOT NULL,
      status VARCHAR(20) DEFAULT 'scheduled',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureDatabaseDemoData() {
  const doctorCheck = await db.query('SELECT id FROM doctors WHERE username = $1', ['doctor1']);
  let doctorId;

  if (doctorCheck.rows.length === 0) {
    const hashedDoctorPassword = await bcrypt.hash('medialert123', 10);
    const doctorResult = await db.query(
      `INSERT INTO doctors (username, email, password, name, license, specialty)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['doctor1', 'doctor1@medialert.mx', hashedDoctorPassword, 'Dra. Laura Hernandez', 'CED-9081726', 'Medicina Interna']
    );
    doctorId = doctorResult.rows[0].id;
  } else {
    doctorId = doctorCheck.rows[0].id;
  }

  const patientCheck = await db.query('SELECT id FROM patients WHERE curp = $1', ['TEST010101HDFAAA09']);
  let patientId;

  if (patientCheck.rows.length === 0) {
    const hashedPatientPassword = await bcrypt.hash('paciente123', 10);
    const patientResult = await db.query(
      `INSERT INTO patients (curp, name, password, doctor_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['TEST010101HDFAAA09', 'Rosa Martinez', hashedPatientPassword, doctorId]
    );
    patientId = patientResult.rows[0].id;
  } else {
    patientId = patientCheck.rows[0].id;
  }

  const prescriptionCheck = await db.query('SELECT COUNT(*)::int AS total FROM prescriptions WHERE patient_id = $1', [patientId]);
  if (prescriptionCheck.rows[0].total === 0) {
    const prescriptionResult = await db.query(
      `INSERT INTO prescriptions (patient_id, doctor_id, diagnosis, general_instructions, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        patientId,
        doctorId,
        'Control de hipertension arterial y glucosa',
        'Mantener hidratacion, dieta balanceada y seguimiento semanal.',
        'active'
      ]
    );

    await db.query(
      `INSERT INTO prescription_items (prescription_id, name, dose_mg, frequency, time, duration_days, notes, emoji)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8),
              ($1, $9, $10, $11, $12, $13, $14, $15)`,
      [
        prescriptionResult.rows[0].id,
        'Losartan',
        50,
        'Cada 24 horas',
        '08:00:00',
        30,
        'Tomar despues del desayuno',
        '💊',
        'Metformina',
        850,
        'Cada 12 horas',
        '14:00:00',
        30,
        'Tomar con alimentos',
        '🩺'
      ]
    );
  }

  const medicationCheck = await db.query('SELECT COUNT(*)::int AS total FROM medications WHERE patient_id = $1', [patientId]);
  if (medicationCheck.rows[0].total === 0) {
    await db.query(
      `INSERT INTO medications (patient_id, name, dose_mg, time, notes, emoji, prescribed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7),
              ($1, $8, $9, $10, $11, $12, $7)`,
      [
        patientId,
        'Losartan',
        50,
        '08:00:00',
        'Tomar despues del desayuno',
        '💊',
        'Dra. Laura Hernandez',
        'Metformina',
        850,
        '14:00:00',
        'Tomar con alimentos',
        '🩺'
      ]
    );
  }

  const appointmentCheck = await db.query('SELECT COUNT(*)::int AS total FROM appointments WHERE patient_id = $1', [patientId]);
  if (appointmentCheck.rows[0].total === 0) {
    await db.query(
      `INSERT INTO appointments (patient_id, date, time, status)
       VALUES ($1, $2, $3, $4)`,
      [patientId, '2026-03-20', '10:00:00', 'scheduled']
    );
  }
}

async function initDatabase() {
  console.log('🚀 Iniciando conexion DB...');
  try {
    db = getPool();
    if (!db) {
      console.log('No pool DB - Fallback demo');
      throw new Error('Sin configuracion de base de datos');
    }

    console.log('🔗 Test conexion: SELECT 1');
    await db.query('SELECT 1');
    console.log('✅ Conexion OK');

    console.log('📋 Creando schema...');
    await ensureDatabaseSchema();
    console.log('✅ Schema OK');

    console.log('💾 Insertando demo data...');
    await ensureDatabaseDemoData();
    console.log('✅ Demo data OK');

    useDatabase = true;
    app.set('db', db);
    app.set('demoData', demoData);
    app.set('useDatabase', true);
    console.log('🌟 Base de datos conectada COMPLETA');
  } catch (error) {
    console.error('💥 Error DB:', error.message);
    useDatabase = false;
    initializeDemoData();
    console.log('Modo demo activo');
  }
}

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`MediAlert disponible en http://localhost:${PORT}`);
    console.log(`API disponible en http://localhost:${PORT}/api`);
    console.log(`Modo actual: ${useDatabase ? 'PostgreSQL' : 'Demo'}`);
  });
});

module.exports = app;
