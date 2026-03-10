-- MediAlertV3 Database Schema for PostgreSQL

-- Tabla de doctores
CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    license VARCHAR(50) NOT NULL,
    specialty VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de pacientes
CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    curp VARCHAR(18) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de medicamentos (receta médica)
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
);

-- Tabla de citas
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de sesiones (opcional para tracking)
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_patients_curp ON patients(curp);
CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient_id ON medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

