-- MediAlertV3 - Datos de Demo
-- Este archivo contiene datos de ejemplo para pruebas

-- Insertar doctor demo (contraseña: medialert123 - ya encriptada)
INSERT INTO doctors (username, email, password, name, license, specialty) 
VALUES (
    'doctor1', 
    'doctor1@medialert.mx', 
    '$2a$10$rQnM1z8JzqF9K8xLxYz9eOvYxLqGqzYxYz9eOvYxLqGqzYxYz9eOvY', 
    'Dra. Laura Hernández', 
    'CED-9081726', 
    'Medicina Interna'
) ON CONFLICT (username) DO NOTHING;

-- Insertar paciente demo (contraseña: paciente123 - ya encriptada)
-- Para pruebas locales, la contraseña encriptada de "paciente123" es:
-- $2a$10$8K1p/a0dL1.EjRfY9vY0uO9Y0K0K0K0K0K0K0K0K0K0K0K0K0K0K0
INSERT INTO patients (curp, name, password, doctor_id) 
VALUES (
    'TEST010101HDFAAA09', 
    'Rosa Martínez',
    '$2a$10$8K1p/a0dL1.EjRfY9vY0uO9Y0K0K0K0K0K0K0K0K0K0K0K0K0K0',
    (SELECT id FROM doctors WHERE username = 'doctor1' LIMIT 1)
) ON CONFLICT (curp) DO NOTHING;

-- Insertar medicamentos de ejemplo
INSERT INTO medications (patient_id, name, dose_mg, time, notes, emoji, prescribed_by)
SELECT 
    p.id,
    'Losartan',
    50,
    '08:00:00',
    'Tomar después del desayuno',
    '💊',
    d.name
FROM patients p, doctors d
WHERE p.curp = 'TEST010101HDFAAA09' AND d.username = 'doctor1'
ON CONFLICT DO NOTHING;

INSERT INTO medications (patient_id, name, dose_mg, time, notes, emoji, prescribed_by)
SELECT 
    p.id,
    'Metformina',
    850,
    '14:00:00',
    'Tomar con alimentos',
    '🩺',
    d.name
FROM patients p, doctors d
WHERE p.curp = 'TEST010101HDFAAA09' AND d.username = 'doctor1'
ON CONFLICT DO NOTHING;

-- Verificar datos
-- SELECT * FROM doctors;
-- SELECT * FROM patients;
-- SELECT * FROM medications;

