-- MediAlertV3 Database Schema for PostgreSQL

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

CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    curp VARCHAR(18) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    allergies TEXT DEFAULT '',
    medical_history TEXT DEFAULT '',
    doctor_notes TEXT DEFAULT '',
    email VARCHAR(120),
    phone VARCHAR(30),
    reminder_channel VARCHAR(20) DEFAULT 'email',
    reminder_opt_in BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    diagnosis TEXT,
    general_instructions TEXT,
    status VARCHAR(20) DEFAULT 'active',
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id SERIAL PRIMARY KEY,
    prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    dose_mg INTEGER NOT NULL,
    frequency VARCHAR(100),
    time TIME NOT NULL,
    duration_days INTEGER,
    notes TEXT,
    emoji VARCHAR(10) DEFAULT '💊',
    interval_hours INTEGER DEFAULT 24,
    notifications_paused BOOLEAN DEFAULT FALSE
);

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
);

CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_curp ON patients(curp);
CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription_id ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient_id ON medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointment_requests_patient_id ON appointment_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_medication_takes_patient_id ON medication_takes(patient_id);
CREATE INDEX IF NOT EXISTS idx_medication_takes_schedule ON medication_takes(patient_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_notification_logs_patient_id ON notification_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_item_schedule ON notification_logs(prescription_item_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
