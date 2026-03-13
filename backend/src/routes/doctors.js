const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'medialert_secret_key_2024';

// Middleware para verificar token
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No se proporcionó token' });
  }
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Función para verificar rol de doctor
function requireDoctor(req, res, next) {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Acceso restringido a doctores' });
  }
  next();
}

// Obtener datos demo
function getDemoData(req) {
  return req.app.get('demoData') || { doctors: {}, patients: {}, medications: {}, appointments: {} };
}

function useDatabase(req) {
  return req.app.get('useDatabase') || false;
}

// GET /api/doctors/profile - Obtener perfil del doctor
router.get('/profile', verifyToken, requireDoctor, async (req, res) => {
  try {
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        'SELECT id, username, email, name, license, specialty, created_at FROM doctors WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Doctor no encontrado' });
      }

      const countResult = await query(
        'SELECT COUNT(*) as patient_count FROM patients WHERE doctor_id = $1',
        [req.user.id]
      );

      return res.json({
        success: true,
        doctor: { ...result.rows[0], patient_count: parseInt(countResult.rows[0].patient_count) }
      });
    }

    // Modo demo
    const doctor = Object.values(demo.doctors).find(d => d.id === req.user.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor no encontrado' });
    }

    const patientCount = Object.values(demo.patients).filter(p => p.doctor_id === doctor.id).length;

    res.json({
      success: true,
      doctor: { ...doctor, patient_count: patientCount }
    });

  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/doctors/:id/patients - Obtener pacientes del doctor
router.get('/:id/patients', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      
      const result = await query(`
        SELECT p.id, p.curp, p.name, p.created_at,
        COUNT(m.id) as medication_count,
        COUNT(DISTINCT a.id) as appointment_count
        FROM patients p
        LEFT JOIN medications m ON m.patient_id = p.id
        LEFT JOIN appointments a ON a.patient_id = p.id
        WHERE p.doctor_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, [id]);

      return res.json({ success: true, patients: result.rows });
    }

    // Modo demo
    const patients = Object.values(demo.patients)
      .filter(p => p.doctor_id === parseInt(id))
      .map((p, idx) => ({
        id: idx + 1,
        curp: p.curp,
        name: p.name,
        created_at: p.created_at,
        medication_count: demo.medications[p.id]?.length || 0,
        appointment_count: demo.appointments[p.id]?.length || 0
      }));

    res.json({ success: true, patients });

  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/doctors/:id/appointments - Obtener citas de pacientes
router.get('/:id/appointments', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      
      const result = await query(`
        SELECT a.id, a.date, a.time, a.status, a.created_at,
        p.name as patient_name, p.curp
        FROM appointments a
        JOIN patients p ON p.id = a.patient_id
        WHERE p.doctor_id = $1
        ORDER BY a.date ASC, a.time ASC
      `, [id]);

      return res.json({ success: true, appointments: result.rows });
    }

    // Modo demo
    const appointments = [];
    Object.values(demo.patients)
      .filter(p => p.doctor_id === parseInt(id))
      .forEach(patient => {
        const patientApts = demo.appointments[patient.id] || [];
        patientApts.forEach(apt => {
          appointments.push({
            ...apt,
            patient_name: patient.name,
            curp: patient.curp
          });
        });
      });

    appointments.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ success: true, appointments });

  } catch (error) {
    console.error('Error al obtener citas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;

