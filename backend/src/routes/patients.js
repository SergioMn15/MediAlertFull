const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'medialert_secret_key_2024';

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No se proporciono token' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalido' });
  }
}

function requireDoctor(req, res, next) {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Acceso restringido a doctores' });
  }
  next();
}

function getDemoData(req) {
  return req.app.get('demoData') || {
    doctors: {},
    patients: {},
    prescriptions: {},
    medications: {},
    appointments: {},
    appointmentRequests: {}
  };
}

function useDatabase(req) {
  return req.app.get('useDatabase') || false;
}

function mapPrescriptionItemToMedication(item, prescription, doctorName = 'Doctor tratante') {
  return {
    id: item.id,
    patient_id: prescription.patient_id,
    prescription_id: prescription.id,
    name: item.name,
    dose_mg: item.dose_mg,
    frequency: item.frequency || '',
    time: item.time,
    duration_days: item.duration_days || null,
    notes: item.notes || '',
    emoji: item.emoji || '💊',
    prescribed_by: doctorName,
    prescribed_at: prescription.issued_at
  };
}

async function getActivePrescriptionFromDb(patientId) {
  const { query } = require('../config/db');
  const prescriptionResult = await query(
    `SELECT p.*, d.name AS doctor_name
     FROM prescriptions p
     LEFT JOIN doctors d ON d.id = p.doctor_id
     WHERE p.patient_id = $1 AND p.status = 'active'
     ORDER BY p.issued_at DESC
     LIMIT 1`,
    [patientId]
  );

  if (prescriptionResult.rows.length === 0) {
    return null;
  }

  const prescription = prescriptionResult.rows[0];
  const itemsResult = await query(
    `SELECT *
     FROM prescription_items
     WHERE prescription_id = $1
     ORDER BY time ASC, id ASC`,
    [prescription.id]
  );

  prescription.items = itemsResult.rows;
  prescription.doctor_name = prescription.doctor_name || 'Doctor tratante';
  return prescription;
}

function getActivePrescriptionFromDemo(demo, patientId) {
  const prescriptions = demo.prescriptions[patientId] || [];
  return prescriptions.find((item) => item.status === 'active') || prescriptions[0] || null;
}

router.get('/', verifyToken, requireDoctor, async (req, res) => {
  try {
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        `SELECT p.id, p.curp, p.name, p.created_at
         FROM patients p
         WHERE p.doctor_id = $1 OR p.doctor_id IS NULL
         ORDER BY p.created_at DESC`,
        [req.user.id]
      );

      const patients = await Promise.all(result.rows.map(async (patient) => {
        const activePrescription = await getActivePrescriptionFromDb(patient.id);
        const medicationCount = activePrescription?.items?.length || 0;
        return {
          ...patient,
          medication_count: medicationCount,
          appointment_count: 0,
          next_medication: medicationCount > 0 ? mapPrescriptionItemToMedication(activePrescription.items[0], activePrescription, activePrescription.doctor_name) : null
        };
      }));

      return res.json({ success: true, patients });
    }

    const patients = Object.values(demo.patients).map((patient) => {
      const activePrescription = getActivePrescriptionFromDemo(demo, patient.id);
      const medications = activePrescription
        ? activePrescription.items.map((item) => mapPrescriptionItemToMedication(item, activePrescription, 'Dra. Laura Hernandez'))
        : (demo.medications[patient.id] || []);

      return {
        id: patient.id,
        curp: patient.curp,
        name: patient.name,
        created_at: patient.created_at,
        medication_count: medications.length,
        appointment_count: (demo.appointments[patient.id] || []).length,
        next_medication: medications[0] || null
      };
    });

    return res.json({ success: true, patients });
  } catch (error) {
    console.error('Error al listar pacientes:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { curp, name, password } = req.body;
    if (!curp || !name || !password) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    if (!/^[A-Z0-9]{18}$/.test(curp.toUpperCase())) {
      return res.status(400).json({ error: 'CURP invalida' });
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
        `INSERT INTO patients (curp, name, password, doctor_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, curp, name, created_at`,
        [curp.toUpperCase(), name, hashedPassword, req.user.id]
      );

      return res.status(201).json({
        success: true,
        message: `Paciente ${name} registrado correctamente`,
        patient: result.rows[0]
      });
    }

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
    demo.prescriptions[newId] = [];
    demo.medications[newId] = [];
    demo.appointments[newId] = [];
    demo.appointmentRequests[newId] = [];

    return res.status(201).json({
      success: true,
      message: `Paciente ${name} registrado correctamente`,
      patient: demo.patients[curp.toUpperCase()]
    });
  } catch (error) {
    console.error('Error al registrar paciente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:curp', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    let patient;
    let medications = [];
    let appointments = [];
    let appointmentRequests = [];
    let activePrescription = null;

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
      activePrescription = await getActivePrescriptionFromDb(patient.id);
      medications = activePrescription
        ? activePrescription.items.map((item) => mapPrescriptionItemToMedication(item, activePrescription, activePrescription.doctor_name))
        : [];

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
      patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
      if (!patient) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      activePrescription = getActivePrescriptionFromDemo(demo, patient.id);
      medications = activePrescription
        ? activePrescription.items.map((item) => mapPrescriptionItemToMedication(item, activePrescription, 'Dra. Laura Hernandez'))
        : (demo.medications[patient.id] || []);
      appointments = demo.appointments[patient.id] || [];
      appointmentRequests = demo.appointmentRequests[patient.id] || [];
    }

    if (req.user.role === 'patient' && req.user.curp !== curp.toUpperCase()) {
      return res.status(403).json({ error: 'No tienes acceso a este paciente' });
    }

    return res.json({
      success: true,
      patient: {
        ...patient,
        medications,
        appointments,
        appointment_requests: appointmentRequests,
        active_prescription: activePrescription
      }
    });
  } catch (error) {
    console.error('Error al obtener paciente:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

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

      let activePrescription = await getActivePrescriptionFromDb(patientResult.rows[0].id);
      if (!activePrescription) {
        const prescriptionResult = await query(
          `INSERT INTO prescriptions (patient_id, doctor_id, diagnosis, general_instructions, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [patientResult.rows[0].id, req.user.id, 'Seguimiento general', 'Sin indicaciones generales', 'active']
        );
        activePrescription = { ...prescriptionResult.rows[0], items: [], doctor_name: req.user.name };
      }

      const itemResult = await query(
        `INSERT INTO prescription_items (prescription_id, name, dose_mg, frequency, time, duration_days, notes, emoji)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [activePrescription.id, name, dose_mg, 'Cada 24 horas', time, 30, notes || '', emoji || '💊']
      );

      return res.status(201).json({
        success: true,
        message: `${name} ${dose_mg}mg asignado correctamente`,
        medication: mapPrescriptionItemToMedication(itemResult.rows[0], activePrescription, req.user.name)
      });
    }

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    if (!demo.prescriptions[patient.id]) {
      demo.prescriptions[patient.id] = [];
    }

    let activePrescription = getActivePrescriptionFromDemo(demo, patient.id);
    if (!activePrescription) {
      activePrescription = {
        id: demo.prescriptions[patient.id].length + 1,
        patient_id: patient.id,
        doctor_id: req.user.id,
        diagnosis: 'Seguimiento general',
        general_instructions: 'Sin indicaciones generales',
        status: 'active',
        issued_at: new Date().toISOString(),
        items: []
      };
      demo.prescriptions[patient.id].unshift(activePrescription);
    }

    const newItem = {
      id: activePrescription.items.length + 1,
      prescription_id: activePrescription.id,
      name,
      dose_mg,
      frequency: 'Cada 24 horas',
      time,
      duration_days: 30,
      notes: notes || '',
      emoji: emoji || '💊'
    };

    activePrescription.items.push(newItem);
    demo.medications[patient.id] = activePrescription.items.map((item) => mapPrescriptionItemToMedication(item, activePrescription, req.user.name));

    return res.status(201).json({
      success: true,
      message: `${name} ${dose_mg}mg asignado correctamente`,
      medication: mapPrescriptionItemToMedication(newItem, activePrescription, req.user.name)
    });
  } catch (error) {
    console.error('Error al asignar medicamento:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

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

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    return res.json({
      success: true,
      requests: demo.appointmentRequests[patient.id] || []
    });
  } catch (error) {
    console.error('Error al obtener solicitudes de cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

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

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    return res.json({
      success: true,
      appointments: demo.appointments[patient.id] || []
    });
  } catch (error) {
    console.error('Error al obtener citas:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

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
        `INSERT INTO appointments (patient_id, date, time, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [patientResult.rows[0].id, date, time, 'scheduled']
      );

      return res.status(201).json({
        success: true,
        message: `Cita programada para ${date} a las ${time}`,
        appointment: result.rows[0]
      });
    }

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const newAppointment = {
      id: (demo.appointments[patient.id]?.length || 0) + 1,
      patient_id: patient.id,
      date,
      time,
      status: 'scheduled',
      created_at: new Date().toISOString()
    };

    if (!demo.appointments[patient.id]) {
      demo.appointments[patient.id] = [];
    }
    demo.appointments[patient.id].push(newAppointment);

    return res.status(201).json({
      success: true,
      message: `Cita programada para ${date} a las ${time}`,
      appointment: newAppointment
    });
  } catch (error) {
    console.error('Error al agendar cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

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

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
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
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
