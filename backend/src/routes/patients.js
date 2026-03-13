const express = require('express');
const bcrypt = require('bcryptjs');
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
  return req.app.get('demoData') || { doctors: {}, patients: {}, medications: {}, appointments: {}, appointmentRequests: {} };
}

function useDatabase(req) {
  return req.app.get('useDatabase') || false;
}

// GET /api/patients - Listar pacientes (doctor)
router.get('/', verifyToken, requireDoctor, async (req, res) => {
  try {
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
        WHERE p.doctor_id = $1 OR p.doctor_id IS NULL
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, [req.user.id]);

      const patients = await Promise.all(result.rows.map(async (patient) => {
        const medResult = await query('SELECT name, time FROM medications WHERE patient_id = $1 ORDER BY time ASC LIMIT 1', [patient.id]);
        return { ...patient, next_medication: medResult.rows[0] || null };
      }));

      return res.json({ success: true, patients });
    }

    // Modo demo
    const patients = Object.values(demo.patients).map((p, idx) => ({
      id: idx + 1,
      curp: p.curp,
      name: p.name,
      created_at: p.created_at,
      medication_count: demo.medications[p.id]?.length || 0,
      appointment_count: demo.appointments[p.id]?.length || 0,
      next_medication: demo.medications[p.id]?.[0] || null
    }));

    res.json({ success: true, patients });

  } catch (error) {
    console.error('Error al listar pacientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/patients - Registrar paciente
router.post('/', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { curp, name, password } = req.body;
    if (!curp || !name || !password) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    if (!/^[A-Z0-9]{18}$/.test(curp.toUpperCase())) {
      return res.status(400).json({ error: 'CURP inválida' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      
      const existing = await query('SELECT id FROM patients WHERE UPPER(curp) = UPPER($1)', [curp]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Ya existe un paciente con esa CURP' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await query(
        'INSERT INTO patients (curp, name, password, doctor_id) VALUES ($1, $2, $3, $4) RETURNING id, curp, name, created_at',
        [curp.toUpperCase(), name, hashedPassword, req.user.id]
      );

      return res.status(201).json({
        success: true,
        message: `Paciente ${name} registrado correctamente`,
        patient: result.rows[0]
      });
    }

    // Modo demo
    if (demo.patients[curp.toUpperCase()]) {
      return res.status(400).json({ error: 'Ya existe un paciente con esa CURP' });
    }

    const newId = Object.keys(demo.patients).length + 1;
    demo.patients[curp.toUpperCase()] = {
      id: newId,
      curp: curp.toUpperCase(),
      name,
      password: bcrypt.hashSync(password, 10),
      doctor_id: req.user.id,
      created_at: new Date().toISOString()
    };
    demo.medications[newId] = [];
    demo.appointments[newId] = [];
    demo.appointmentRequests[newId] = [];

    res.status(201).json({
      success: true,
      message: `Paciente ${name} registrado correctamente`,
      patient: demo.patients[curp.toUpperCase()]
    });

  } catch (error) {
    console.error('Error al registrar paciente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/patients/:curp - Obtener datos de paciente
router.get('/:curp', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

      let patient, medications, appointments, appointmentRequests;

    if (isDb) {
      const { query } = require('../config/db');
      
      const patientResult = await query(
        'SELECT id, curp, name, doctor_id, created_at FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      patient = patientResult.rows[0];

      const medResult = await query(
        'SELECT * FROM medications WHERE patient_id = $1 ORDER BY time ASC',
        [patient.id]
      );
      medications = medResult.rows;

      const aptResult = await query(
        'SELECT * FROM appointments WHERE patient_id = $1 ORDER BY date DESC, time DESC',
        [patient.id]
      );
      appointments = aptResult.rows;

      const requestResult = await query(
        'SELECT * FROM appointment_requests WHERE patient_id = $1 ORDER BY created_at DESC',
        [patient.id]
      );
      appointmentRequests = requestResult.rows;

    } else {
      // Modo demo
      patient = Object.values(demo.patients).find(p => p.curp.toUpperCase() === curp.toUpperCase());
      
      if (!patient) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      medications = demo.medications[patient.id] || [];
      appointments = demo.appointments[patient.id] || [];
      appointmentRequests = demo.appointmentRequests[patient.id] || [];
    }

    if (req.user.role === 'patient' && req.user.curp !== curp.toUpperCase()) {
      return res.status(403).json({ error: 'No tienes acceso a este paciente' });
    }

    res.json({
      success: true,
      patient: { ...patient, medications, appointments, appointment_requests: appointmentRequests }
    });

  } catch (error) {
    console.error('Error al obtener paciente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/patients/:curp/medications - Asignar medicamento
router.post('/:curp/medications', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { curp } = req.params;
    const { name, dose_mg, time, notes, emoji } = req.body;

    if (!name || !dose_mg || !time) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      
      const patientResult = await query('SELECT id FROM patients WHERE UPPER(curp) = UPPER($1)', [curp]);
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const result = await query(
        'INSERT INTO medications (patient_id, name, dose_mg, time, notes, emoji, prescribed_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [patientResult.rows[0].id, name, dose_mg, time, notes || '', emoji || '💊', req.user.name]
      );

      return res.status(201).json({
        success: true,
        message: `${name} ${dose_mg}mg asignado correctamente`,
        medication: result.rows[0]
      });
    }

    // Modo demo
    const patient = Object.values(demo.patients).find(p => p.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const medId = (demo.medications[patient.id]?.length || 0) + 1;
    const newMed = {
      id: medId,
      patient_id: patient.id,
      name,
      dose_mg,
      time,
      notes: notes || '',
      emoji: emoji || '💊',
      prescribed_by: req.user.name,
      prescribed_at: new Date().toISOString()
    };

    if (!demo.medications[patient.id]) {
      demo.medications[patient.id] = [];
    }
    demo.medications[patient.id].push(newMed);

    res.status(201).json({
      success: true,
      message: `${name} ${dose_mg}mg asignado correctamente`,
      medication: newMed
    });

  } catch (error) {
    console.error('Error al asignar medicamento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/patients/:curp/appointment-requests - Obtener solicitudes de cita
router.get('/:curp/appointment-requests', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (req.user.role === 'patient' && req.user.curp !== curp.toUpperCase()) {
      return res.status(403).json({ error: 'No tienes acceso a este paciente' });
    }

    if (isDb) {
      const { query } = require('../config/db');

      const patientResult = await query('SELECT id FROM patients WHERE UPPER(curp) = UPPER($1)', [curp]);
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const result = await query(
        'SELECT * FROM appointment_requests WHERE patient_id = $1 ORDER BY created_at DESC',
        [patientResult.rows[0].id]
      );

      return res.json({ success: true, requests: result.rows });
    }

    const patient = Object.values(demo.patients).find(p => p.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    return res.json({
      success: true,
      requests: demo.appointmentRequests[patient.id] || []
    });
  } catch (error) {
    console.error('Error al obtener solicitudes de cita:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/patients/:curp/appointments - Obtener citas
router.get('/:curp/appointments', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      
      const patientResult = await query('SELECT id FROM patients WHERE UPPER(curp) = UPPER($1)', [curp]);
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const result = await query(
        'SELECT * FROM appointments WHERE patient_id = $1 ORDER BY date DESC, time DESC',
        [patientResult.rows[0].id]
      );

      return res.json({ success: true, appointments: result.rows });
    }

    // Modo demo
    const patient = Object.values(demo.patients).find(p => p.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json({
      success: true,
      appointments: demo.appointments[patient.id] || []
    });

  } catch (error) {
    console.error('Error al obtener citas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/patients/:curp/appointments - Crear cita directa por doctor
router.post('/:curp/appointments', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { curp } = req.params;
    const { date, time } = req.body;

    if (!date || !time) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      
      const patientResult = await query('SELECT id FROM patients WHERE UPPER(curp) = UPPER($1)', [curp]);
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const result = await query(
        'INSERT INTO appointments (patient_id, date, time, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [patientResult.rows[0].id, date, time, 'scheduled']
      );

      return res.status(201).json({
        success: true,
        message: `Cita programada para ${date} a las ${time}`,
        appointment: result.rows[0]
      });
    }

    // Modo demo
    const patient = Object.values(demo.patients).find(p => p.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const aptId = (demo.appointments[patient.id]?.length || 0) + 1;
    const newApt = {
      id: aptId,
      patient_id: patient.id,
      date,
      time,
      status: 'scheduled',
      created_at: new Date().toISOString()
    };

    if (!demo.appointments[patient.id]) {
      demo.appointments[patient.id] = [];
    }
    demo.appointments[patient.id].push(newApt);

    res.status(201).json({
      success: true,
      message: `Cita programada para ${date} a las ${time}`,
      appointment: newApt
    });

  } catch (error) {
    console.error('Error al agendar cita:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/patients/:curp/appointment-requests - Solicitar cita por paciente
router.post('/:curp/appointment-requests', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const { date, time, reason } = req.body;

    if (!date || !time) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    if (req.user.role !== 'patient' || req.user.curp !== curp.toUpperCase()) {
      return res.status(403).json({ error: 'Solo el paciente puede solicitar su propia cita' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');

      const patientResult = await query('SELECT id FROM patients WHERE UPPER(curp) = UPPER($1)', [curp]);
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const result = await query(
        `INSERT INTO appointment_requests (patient_id, requested_date, requested_time, reason, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [patientResult.rows[0].id, date, time, reason || '', 'pending']
      );

      return res.status(201).json({
        success: true,
        message: 'Solicitud de cita enviada al doctor',
        request: result.rows[0]
      });
    }

    const patient = Object.values(demo.patients).find(p => p.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const requestId = Object.values(demo.appointmentRequests)
      .flat()
      .reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
    const newRequest = {
      id: requestId,
      patient_id: patient.id,
      requested_date: date,
      requested_time: time,
      reason: reason || '',
      status: 'pending',
      doctor_response: '',
      reviewed_at: null,
      created_at: new Date().toISOString()
    };

    if (!demo.appointmentRequests[patient.id]) {
      demo.appointmentRequests[patient.id] = [];
    }

    demo.appointmentRequests[patient.id].unshift(newRequest);

    return res.status(201).json({
      success: true,
      message: 'Solicitud de cita enviada al doctor',
      request: newRequest
    });
  } catch (error) {
    console.error('Error al solicitar cita:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;

