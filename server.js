const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const authRoutes = require('./backend/src/routes/auth');
const patientsRoutes = require('./backend/src/routes/patients');
const doctorsRoutes = require('./backend/src/routes/doctors');
const { getPool } = require('./backend/src/config/db');
const { startReminderScheduler } = require('./backend/src/services/reminderScheduler');

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
    appointmentRequests: {},
    medicationTakes: {},
    notificationLogs: {}
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
    email: 'rosa@example.com',
    phone: '+5215550001111',
    reminder_channel: 'email',
    reminder_opt_in: true,
    password: bcrypt.hashSync('paciente123', 10),
    doctor_id: 1,
    allergies: 'Penicilina',
    medical_history: 'Hipertension arterial y control de glucosa en seguimiento.',
    doctor_notes: 'Paciente adherente al tratamiento. Vigilar presion y apego a dieta.',
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

  demoData.medicationTakes[1] = [];
  demoData.notificationLogs[1] = [];

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
      email VARCHAR(100),
      phone VARCHAR(30),
      reminder_channel VARCHAR(20) DEFAULT 'email',
      reminder_opt_in BOOLEAN DEFAULT true,
      password VARCHAR(255) NOT NULL,
      doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
      allergies TEXT DEFAULT '',
      medical_history TEXT DEFAULT '',
      doctor_notes TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS allergies TEXT DEFAULT ''
  `);

  await db.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS medical_history TEXT DEFAULT ''
  `);

  await db.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS doctor_notes TEXT DEFAULT ''
  `);

  await db.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS email VARCHAR(100)
  `);

  await db.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS phone VARCHAR(30)
  `);

  await db.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS reminder_channel VARCHAR(20) DEFAULT 'email'
  `);

  await db.query(`
    ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS reminder_opt_in BOOLEAN DEFAULT true
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
    ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await db.query(`
    ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS prescription_items (
      id SERIAL PRIMARY KEY,
      prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      dose_mg INTEGER NOT NULL,
      frequency VARCHAR(100),
      interval_hours INTEGER DEFAULT 24,
      time TIME NOT NULL,
      duration_days INTEGER,
      notes TEXT,
      emoji VARCHAR(10) DEFAULT '💊'
    )
  `);

  await db.query(`
    ALTER TABLE prescription_items
    ADD COLUMN IF NOT EXISTS interval_hours INTEGER DEFAULT 24
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS medication_takes (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      prescription_item_id INTEGER REFERENCES prescription_items(id) ON DELETE CASCADE,
      medication_name VARCHAR(100) NOT NULL,
      dose_mg INTEGER NOT NULL,
      scheduled_date DATE NOT NULL,
      scheduled_time TIME NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      notes TEXT,
      snoozed_until TIMESTAMP,
      action_taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query('CREATE INDEX IF NOT EXISTS idx_medication_takes_patient_id ON medication_takes(patient_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_medication_takes_schedule ON medication_takes(patient_id, scheduled_date)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      prescription_item_id INTEGER REFERENCES prescription_items(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL,
      recipient VARCHAR(120),
      scheduled_for TIMESTAMP NOT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) NOT NULL,
      provider VARCHAR(50),
      error_message TEXT,
      message_body TEXT
    )
  `);

  await db.query('CREATE INDEX IF NOT EXISTS idx_notification_logs_patient_id ON notification_logs(patient_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_notification_logs_item_schedule ON notification_logs(prescription_item_id, scheduled_for)');
}

async function ensureDatabaseDemoData() {
  let currentStep = 'doctor lookup';
  console.log('[DB DEMO] Paso: buscar doctor demo');
  const doctorCheck = await db.query('SELECT id FROM doctors WHERE username = $1', ['doctor1']);
  let doctorId;

  if (doctorCheck.rows.length === 0) {
    currentStep = 'doctor insert';
    console.log('[DB DEMO] Paso: insertar doctor demo');
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

  currentStep = 'patient lookup';
  console.log('[DB DEMO] Paso: buscar paciente demo');
  const patientCheck = await db.query('SELECT id FROM patients WHERE curp = $1', ['TEST010101HDFAAA09']);
  let patientId;

  if (patientCheck.rows.length === 0) {
    currentStep = 'patient insert';
    console.log('[DB DEMO] Paso: insertar paciente demo');
    const hashedPatientPassword = await bcrypt.hash('paciente123', 10);
    const patientResult = await db.query(
      `INSERT INTO patients (curp, name, email, phone, reminder_channel, reminder_opt_in, password, doctor_id, allergies, medical_history, doctor_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        'TEST010101HDFAAA09',
        'Rosa Martinez',
        'rosa@example.com',
        '+5215550001111',
        'email',
        true,
        hashedPatientPassword,
        doctorId,
        'Penicilina',
        'Hipertension arterial y control de glucosa en seguimiento.',
        'Paciente adherente al tratamiento. Vigilar presion y apego a dieta.'
      ]
    );
    patientId = patientResult.rows[0].id;
  } else {
    patientId = patientCheck.rows[0].id;
    currentStep = 'patient update defaults';
    console.log('[DB DEMO] Paso: actualizar perfil clinico demo');
    await db.query(
      `UPDATE patients
       SET allergies = COALESCE(NULLIF(allergies, ''), $2),
           medical_history = COALESCE(NULLIF(medical_history, ''), $3),
           doctor_notes = COALESCE(NULLIF(doctor_notes, ''), $4)
       WHERE id = $1`,
      [
        patientId,
        'Penicilina',
        'Hipertension arterial y control de glucosa en seguimiento.',
        'Paciente adherente al tratamiento. Vigilar presion y apego a dieta.'
      ]
    );
  }

  currentStep = 'prescription count';
  console.log('[DB DEMO] Paso: revisar recetas demo');
  const prescriptionCheck = await db.query('SELECT COUNT(*)::int AS total FROM prescriptions WHERE patient_id = $1', [patientId]);
  if (prescriptionCheck.rows[0].total === 0) {
    currentStep = 'prescription insert';
    console.log('[DB DEMO] Paso: insertar receta demo');
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

    currentStep = 'prescription items insert';
    console.log('[DB DEMO] Paso: insertar medicamentos de receta demo');
    await db.query(
      `INSERT INTO prescription_items (prescription_id, name, dose_mg, frequency, interval_hours, time, duration_days, notes, emoji)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9),
              ($1, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        prescriptionResult.rows[0].id,
        'Losartan',
        50,
        'Cada 24 horas',
        24,
        '08:00:00',
        30,
        'Tomar despues del desayuno',
        '💊',
        'Paracetamol',
        50,
        'Cada 8 horas',
        8,
        '12:00:00',
        5,
        'Prueba',
        '💊'
      ]
    );
  }

  currentStep = 'medications count';
  console.log('[DB DEMO] Paso: revisar medicamentos legacy demo');
  const medicationCheck = await db.query('SELECT COUNT(*)::int AS total FROM medications WHERE patient_id = $1', [patientId]);
  if (medicationCheck.rows[0].total === 0) {
    currentStep = 'medications insert';
    console.log('[DB DEMO] Paso: insertar medicamentos legacy demo');
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

  currentStep = 'appointments count';
  console.log('[DB DEMO] Paso: revisar citas demo');
  const appointmentCheck = await db.query('SELECT COUNT(*)::int AS total FROM appointments WHERE patient_id = $1', [patientId]);
  if (appointmentCheck.rows[0].total === 0) {
    currentStep = 'appointments insert';
    console.log('[DB DEMO] Paso: insertar cita demo');
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
    console.error('[DB INIT] Detalle del error:', {
      message: error.message,
      code: error.code,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint,
      routine: error.routine
    });
    console.error('💥 Error DB:', error.message);
    useDatabase = false;
    initializeDemoData();
    console.log('Modo demo activo');
  }
}

initDatabase().then(() => {
  startReminderScheduler(app);
  app.listen(PORT, () => {
    console.log(`MediAlert disponible en http://localhost:${PORT}`);
    console.log(`API disponible en http://localhost:${PORT}/api`);
    console.log(`Modo actual: ${useDatabase ? 'PostgreSQL' : 'Demo'}`);
  });
});

module.exports = app;
