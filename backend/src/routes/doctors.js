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
  return req.app.get('demoData') || { doctors: {}, patients: {}, medications: {}, appointments: {}, appointmentRequests: {} };
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

// GET /api/doctors/:id/appointment-requests - Obtener solicitudes de cita
router.get('/:id/appointment-requests', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');

      const result = await query(`
        SELECT ar.*, p.name AS patient_name, p.curp
        FROM appointment_requests ar
        JOIN patients p ON p.id = ar.patient_id
        WHERE p.doctor_id = $1
        ORDER BY
          CASE ar.status
            WHEN 'pending' THEN 0
            WHEN 'approved' THEN 1
            WHEN 'rejected' THEN 2
            ELSE 3
          END,
          ar.created_at DESC
      `, [id]);

      return res.json({ success: true, requests: result.rows });
    }

    const requests = [];
    Object.values(demo.patients)
      .filter(p => p.doctor_id === parseInt(id))
      .forEach((patient) => {
        const patientRequests = demo.appointmentRequests[patient.id] || [];
        patientRequests.forEach((request) => {
          requests.push({
            ...request,
            patient_name: patient.name,
            curp: patient.curp
          });
        });
      });

    requests.sort((a, b) => {
      const order = { pending: 0, approved: 1, rejected: 2 };
      const left = order[a.status] ?? 3;
      const right = order[b.status] ?? 3;
      if (left !== right) return left - right;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json({ success: true, requests });
  } catch (error) {
    console.error('Error al obtener solicitudes de cita:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/doctors/appointment-requests/:requestId/review - Aprobar/rechazar solicitud
router.post('/appointment-requests/:requestId/review', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, response, scheduled_date, scheduled_time } = req.body;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Accion invalida' });
    }

    if (action === 'approve' && (!scheduled_date || !scheduled_time)) {
      return res.status(400).json({ error: 'Faltan fecha u hora para aprobar la solicitud' });
    }

    if (isDb) {
      const { query } = require('../config/db');

      const requestResult = await query(`
        SELECT ar.*, p.doctor_id, p.name AS patient_name, p.curp
        FROM appointment_requests ar
        JOIN patients p ON p.id = ar.patient_id
        WHERE ar.id = $1
      `, [requestId]);

      if (requestResult.rows.length === 0) {
        return res.status(404).json({ error: 'Solicitud no encontrada' });
      }

      const appointmentRequest = requestResult.rows[0];
      if (appointmentRequest.doctor_id !== req.user.id) {
        return res.status(403).json({ error: 'No puedes gestionar solicitudes de otro doctor' });
      }

      if (appointmentRequest.status !== 'pending') {
        return res.status(400).json({ error: 'La solicitud ya fue procesada' });
      }

      const status = action === 'approve' ? 'approved' : 'rejected';
      const updatedRequest = await query(
        `UPDATE appointment_requests
         SET status = $1, doctor_response = $2, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [status, response || '', requestId]
      );

      let appointment = null;
      if (action === 'approve') {
        const appointmentResult = await query(
          `INSERT INTO appointments (patient_id, date, time, status)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [appointmentRequest.patient_id, scheduled_date, scheduled_time, 'scheduled']
        );
        appointment = appointmentResult.rows[0];
      }

      return res.json({
        success: true,
        message: action === 'approve' ? 'Solicitud aprobada y cita creada' : 'Solicitud rechazada',
        request: updatedRequest.rows[0],
        appointment
      });
    }

    let targetPatient = null;
    let targetRequest = null;

    Object.values(demo.patients)
      .filter(patient => patient.doctor_id === req.user.id)
      .some((patient) => {
        const requests = demo.appointmentRequests[patient.id] || [];
        const request = requests.find(item => item.id === parseInt(requestId));
        if (request) {
          targetPatient = patient;
          targetRequest = request;
          return true;
        }
        return false;
      });

    if (!targetRequest || !targetPatient) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    if (targetRequest.status !== 'pending') {
      return res.status(400).json({ error: 'La solicitud ya fue procesada' });
    }

    targetRequest.status = action === 'approve' ? 'approved' : 'rejected';
    targetRequest.doctor_response = response || '';
    targetRequest.reviewed_at = new Date().toISOString();

    let appointment = null;
    if (action === 'approve') {
      const newAppointmentId = (demo.appointments[targetPatient.id]?.length || 0) + 1;
      appointment = {
        id: newAppointmentId,
        patient_id: targetPatient.id,
        date: scheduled_date,
        time: scheduled_time,
        status: 'scheduled',
        created_at: new Date().toISOString()
      };

      if (!demo.appointments[targetPatient.id]) {
        demo.appointments[targetPatient.id] = [];
      }

      demo.appointments[targetPatient.id].unshift(appointment);
    }

    res.json({
      success: true,
      message: action === 'approve' ? 'Solicitud aprobada y cita creada' : 'Solicitud rechazada',
      request: targetRequest,
      appointment
    });
  } catch (error) {
    console.error('Error al revisar solicitud de cita:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;

