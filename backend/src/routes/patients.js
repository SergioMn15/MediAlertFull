const express = require('express');
const bcrypt = require('bcryptjs');
const { verifyToken, requireDoctor } = require('../middleware/auth');
const notifier = require('../services/notifier');
const { buildUpcomingReminders } = require('../services/reminderEngine');

const router = express.Router();

function getDemoData(req) {
  return req.app.get('demoData') || {
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

function useDatabase(req) {
  return req.app.get('useDatabase') || false;
}

function normalizeCurp(curp) {
  return String(curp || '').toUpperCase().trim();
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function combineDateTime(dateValue, timeValue) {
  const normalizedDate = String(dateValue || '').slice(0, 10);
  const normalizedTime = String(timeValue || '').slice(0, 8) || '00:00:00';
  return new Date(`${normalizedDate}T${normalizedTime}`);
}

function canAccessPatientRecord(req, patient) {
  if (!patient) {
    return false;
  }

  if (req.user.role === 'patient') {
    return normalizeCurp(req.user.curp) === normalizeCurp(patient.curp);
  }

  if (req.user.role === 'doctor') {
    return patient.doctor_id === req.user.id;
  }

  return false;
}

function ensurePatientAccess(req, res, patient) {
  if (!canAccessPatientRecord(req, patient)) {
    res.status(403).json({ error: 'No tienes acceso a este paciente' });
    return false;
  }

  return true;
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

async function getPrescriptionHistoryFromDb(patientId) {
  const { query } = require('../config/db');
  const prescriptionsResult = await query(
    `SELECT p.*, d.name AS doctor_name
     FROM prescriptions p
     LEFT JOIN doctors d ON d.id = p.doctor_id
     WHERE p.patient_id = $1
     ORDER BY p.issued_at DESC, p.id DESC`,
    [patientId]
  );

  const prescriptions = [];
  for (const prescription of prescriptionsResult.rows) {
    const itemsResult = await query(
      `SELECT *
       FROM prescription_items
       WHERE prescription_id = $1
       ORDER BY time ASC, id ASC`,
      [prescription.id]
    );

    prescriptions.push({
      ...prescription,
      doctor_name: prescription.doctor_name || 'Doctor tratante',
      items: itemsResult.rows
    });
  }

  return prescriptions;
}

function getActivePrescriptionFromDemo(demo, patientId) {
  const prescriptions = demo.prescriptions[patientId] || [];
  return prescriptions.find((item) => item.status === 'active') || prescriptions[0] || null;
}

function getPrescriptionHistoryFromDemo(demo, patientId) {
  return (demo.prescriptions[patientId] || [])
    .slice()
    .sort((left, right) => new Date(right.issued_at) - new Date(left.issued_at));
}

async function getTodayMedicationTakesFromDb(patientId, scheduledDate) {
  const { query } = require('../config/db');
  const result = await query(
    `SELECT *
     FROM medication_takes
     WHERE patient_id = $1 AND scheduled_date = $2
     ORDER BY scheduled_time ASC, id ASC`,
    [patientId, scheduledDate]
  );

  return result.rows;
}

function getTodayMedicationTakesFromDemo(demo, patientId, scheduledDate) {
  return (demo.medicationTakes[patientId] || [])
    .filter((item) => String(item.scheduled_date || '').slice(0, 10) === scheduledDate)
    .sort((left, right) => combineDateTime(left.scheduled_date, left.scheduled_time) - combineDateTime(right.scheduled_date, right.scheduled_time));
}

function buildReminderPayload(activePrescription, medicationTakes, scheduledDate) {
  const items = activePrescription?.items || [];
  const takeMap = new Map(
    medicationTakes.map((take) => [`${take.prescription_item_id}-${String(take.scheduled_date).slice(0, 10)}`, take])
  );

  const reminders = items
    .map((item) => {
      const take = takeMap.get(`${item.id}-${scheduledDate}`) || null;
      const reminderTime = take?.status === 'snoozed' && take?.snoozed_until
        ? new Date(take.snoozed_until).toISOString().slice(11, 19)
        : item.time;

      return {
        item_id: item.id,
        prescription_id: activePrescription.id,
        name: item.name,
        dose_mg: item.dose_mg,
        frequency: item.frequency || '',
        notes: item.notes || '',
        emoji: item.emoji || '💊',
        scheduled_date: scheduledDate,
        scheduled_time: item.time,
        reminder_time: reminderTime,
        status: take?.status || 'pending',
        take_id: take?.id || null,
        snoozed_until: take?.snoozed_until || null,
        action_taken_at: take?.action_taken_at || null
      };
    })
    .sort((left, right) => combineDateTime(left.scheduled_date, left.reminder_time) - combineDateTime(right.scheduled_date, right.reminder_time));

  const history = reminders
    .filter((item) => item.status !== 'pending')
    .sort((left, right) => {
      const leftTime = left.action_taken_at ? new Date(left.action_taken_at) : combineDateTime(left.scheduled_date, left.reminder_time);
      const rightTime = right.action_taken_at ? new Date(right.action_taken_at) : combineDateTime(right.scheduled_date, right.reminder_time);
      return rightTime - leftTime;
    });

  const total = reminders.length;
  const taken = reminders.filter((item) => item.status === 'taken').length;
  const pendingLike = reminders.filter((item) => item.status === 'pending' || item.status === 'snoozed');
  const nextDose = pendingLike.length > 0 ? pendingLike[0].reminder_time : null;

  return {
    scheduled_date: scheduledDate,
    reminders,
    history,
    stats: {
      total_medications: total,
      taken_count: taken,
      adherence_percent: total ? Math.round((taken / total) * 100) : 0,
      next_dose: nextDose
    }
  };
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
         WHERE p.doctor_id = $1
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

    const patients = Object.values(demo.patients)
      .filter((patient) => patient.doctor_id === req.user.id)
      .map((patient) => {
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
    const {
      curp,
      name,
      password,
      email = '',
      phone = '',
      reminder_channel = 'email',
      reminder_opt_in = true
    } = req.body;

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
        `INSERT INTO patients (curp, name, email, phone, reminder_channel, reminder_opt_in, password, doctor_id, allergies, medical_history, doctor_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, curp, name, email, phone, reminder_channel, reminder_opt_in, allergies, medical_history, doctor_notes, created_at`,
        [curp.toUpperCase(), name, email.trim(), phone.trim(), reminder_channel, reminder_opt_in !== false, hashedPassword, req.user.id, '', '', '']
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
      email: email.trim(),
      phone: phone.trim(),
      reminder_channel,
      reminder_opt_in: reminder_opt_in !== false,
      password: bcrypt.hashSync(password, 10),
      doctor_id: req.user.id,
      allergies: '',
      medical_history: '',
      doctor_notes: '',
      created_at: new Date().toISOString()
    };
    demo.prescriptions[newId] = [];
    demo.medications[newId] = [];
    demo.appointments[newId] = [];
    demo.appointmentRequests[newId] = [];
    demo.medicationTakes[newId] = [];
    demo.notificationLogs[newId] = [];

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
    let prescriptionsHistory = [];

    if (isDb) {
      const { query } = require('../config/db');
      const patientResult = await query(
        'SELECT id, curp, name, email, phone, reminder_channel, reminder_opt_in, doctor_id, allergies, medical_history, doctor_notes, created_at FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }
      activePrescription = await getActivePrescriptionFromDb(patient.id);
      prescriptionsHistory = await getPrescriptionHistoryFromDb(patient.id);
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

      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      activePrescription = getActivePrescriptionFromDemo(demo, patient.id);
      if (activePrescription) {
        activePrescription = {
          ...activePrescription,
          doctor_name: activePrescription.doctor_name || 'Dra. Laura Hernandez'
        };
      }
      prescriptionsHistory = getPrescriptionHistoryFromDemo(demo, patient.id).map((prescription) => ({
        ...prescription,
        doctor_name: prescription.doctor_name || 'Dra. Laura Hernandez'
      }));
      medications = activePrescription
        ? activePrescription.items.map((item) => mapPrescriptionItemToMedication(item, activePrescription, 'Dra. Laura Hernandez'))
        : (demo.medications[patient.id] || []);
      appointments = demo.appointments[patient.id] || [];
      appointmentRequests = demo.appointmentRequests[patient.id] || [];
    }

    return res.json({
      success: true,
      patient: {
        ...patient,
        medications,
        appointments,
        appointment_requests: appointmentRequests,
        active_prescription: activePrescription,
        prescriptions_history: prescriptionsHistory
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
      const patientResult = await query(
        'SELECT id, curp, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      let activePrescription = await getActivePrescriptionFromDb(patient.id);
      if (!activePrescription) {
        const prescriptionResult = await query(
          `INSERT INTO prescriptions (patient_id, doctor_id, diagnosis, general_instructions, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [patient.id, req.user.id, 'Seguimiento general', 'Sin indicaciones generales', 'active']
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

    if (!ensurePatientAccess(req, res, patient)) {
      return;
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

    if (isDb) {
      const { query } = require('../config/db');
      const patientResult = await query(
        'SELECT id, curp, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      const result = await query(
        'SELECT * FROM appointment_requests WHERE patient_id = $1 ORDER BY created_at DESC',
        [patient.id]
      );

      return res.json({ success: true, requests: result.rows });
    }

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    if (!ensurePatientAccess(req, res, patient)) {
      return;
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
      const patientResult = await query(
        'SELECT id, curp, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      const result = await query(
        'SELECT * FROM appointments WHERE patient_id = $1 ORDER BY date DESC, time DESC',
        [patient.id]
      );

      return res.json({ success: true, appointments: result.rows });
    }

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase());
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    if (!ensurePatientAccess(req, res, patient)) {
      return;
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
      const patientResult = await query(
        'SELECT id, curp, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );
      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      const result = await query(
        `INSERT INTO appointments (patient_id, date, time, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [patient.id, date, time, 'scheduled']
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

    if (!ensurePatientAccess(req, res, patient)) {
      return;
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

    if (req.user.role !== 'patient' || normalizeCurp(req.user.curp) !== normalizeCurp(curp)) {
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

router.put('/:curp/clinical-profile', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { curp } = req.params;
    const {
      allergies = '',
      medical_history = '',
      doctor_notes = ''
    } = req.body;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const patientResult = await query(
        'SELECT id, curp, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      const patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      const result = await query(
        `UPDATE patients
         SET allergies = $1,
             medical_history = $2,
             doctor_notes = $3
         WHERE id = $4
         RETURNING id, curp, name, doctor_id, allergies, medical_history, doctor_notes, created_at`,
        [allergies.trim(), medical_history.trim(), doctor_notes.trim(), patient.id]
      );

      return res.json({
        success: true,
        message: 'Perfil clinico actualizado correctamente',
        patient: result.rows[0]
      });
    }

    const patient = Object.values(demo.patients).find((item) => normalizeCurp(item.curp) === normalizeCurp(curp));
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    if (!ensurePatientAccess(req, res, patient)) {
      return;
    }

    patient.allergies = allergies.trim();
    patient.medical_history = medical_history.trim();
    patient.doctor_notes = doctor_notes.trim();

    return res.json({
      success: true,
      message: 'Perfil clinico actualizado correctamente',
      patient
    });
  } catch (error) {
    console.error('Error al actualizar perfil clinico:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:curp/reminders/today', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const scheduledDate = getTodayDateString();
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    let patient;
    let activePrescription = null;
    let medicationTakes = [];

    if (isDb) {
      const { query } = require('../config/db');
      const patientResult = await query(
        'SELECT id, curp, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      activePrescription = await getActivePrescriptionFromDb(patient.id);
      medicationTakes = await getTodayMedicationTakesFromDb(patient.id, scheduledDate);
    } else {
      patient = Object.values(demo.patients).find((item) => normalizeCurp(item.curp) === normalizeCurp(curp));
      if (!patient) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      activePrescription = getActivePrescriptionFromDemo(demo, patient.id);
      medicationTakes = getTodayMedicationTakesFromDemo(demo, patient.id, scheduledDate);
    }

    const payload = buildReminderPayload(activePrescription, medicationTakes, scheduledDate);
    return res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Error al obtener recordatorios del dia:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/test-sms', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Se requiere número de teléfono' });
    }

    const patientMock = { phone: phone, reminder_channel: 'sms' };
    const itemMock = { name: 'Ibuprofeno 500mg' };
    const scheduledAt = new Date();

    const result = await notifier.sendSMSReminder(patientMock, itemMock, scheduledAt);
    
    return res.json({
      success: true,
      message: 'Test SMS enviado',
      result
    });
  } catch (error) {
    console.error('Error test SMS:', error);
    return res.status(500).json({ error: 'Error enviando test SMS' });
  }
});

router.post('/test-whatsapp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Se requiere numero de telefono' });
    }

    const patientMock = {
      name: 'Paciente de prueba',
      phone,
      reminder_channel: 'whatsapp',
      reminder_opt_in: true
    };
    const itemMock = {
      name: 'Ibuprofeno',
      dose_mg: 500,
      notes: 'Seguir la receta medica.'
    };
    const scheduledAt = new Date();

    const result = await notifier.sendWhatsappReminder(patientMock, itemMock, scheduledAt);

    return res.json({
      success: true,
      message: 'Test WhatsApp ejecutado',
      provider: 'pywhatkit',
      result
    });
  } catch (error) {
    console.error('Error test WhatsApp:', error);
    return res.status(500).json({ error: 'Error enviando test WhatsApp' });
  }
});

router.post('/:curp/medication-takes', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const { item_id, action, notes = '' } = req.body;
    const scheduledDate = getTodayDateString();

    if (req.user.role !== 'patient' || normalizeCurp(req.user.curp) !== normalizeCurp(curp)) {
      return res.status(403).json({ error: 'Solo el paciente puede registrar sus propias tomas' });
    }

    if (!item_id || !['taken', 'skipped', 'snoozed'].includes(action)) {
      return res.status(400).json({ error: 'Debes indicar un medicamento y una accion valida' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    let patient;
    let activePrescription = null;
    let targetItem = null;

    if (isDb) {
      const { query } = require('../config/db');
      const patientResult = await query(
        'SELECT id, curp, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      activePrescription = await getActivePrescriptionFromDb(patient.id);
      targetItem = activePrescription?.items?.find((item) => item.id === Number(item_id)) || null;

      if (!activePrescription || !targetItem) {
        return res.status(404).json({ error: 'Medicamento activo no encontrado' });
      }

      const scheduledTime = String(targetItem.time || '').slice(0, 8);
      const snoozedUntil = action === 'snoozed'
        ? new Date(Date.now() + (30 * 60 * 1000)).toISOString()
        : null;

      const existingResult = await query(
        `SELECT id
         FROM medication_takes
         WHERE patient_id = $1 AND prescription_item_id = $2 AND scheduled_date = $3
         LIMIT 1`,
        [patient.id, targetItem.id, scheduledDate]
      );

      let medicationTake;
      if (existingResult.rows.length > 0) {
        const updateResult = await query(
          `UPDATE medication_takes
           SET medication_name = $1,
               dose_mg = $2,
               scheduled_time = $3,
               status = $4,
               notes = $5,
               snoozed_until = $6,
               action_taken_at = CURRENT_TIMESTAMP
           WHERE id = $7
           RETURNING *`,
          [targetItem.name, targetItem.dose_mg, scheduledTime, action, notes.trim(), snoozedUntil, existingResult.rows[0].id]
        );
        medicationTake = updateResult.rows[0];
      } else {
        const insertResult = await query(
          `INSERT INTO medication_takes
             (patient_id, prescription_item_id, medication_name, dose_mg, scheduled_date, scheduled_time, status, notes, snoozed_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [patient.id, targetItem.id, targetItem.name, targetItem.dose_mg, scheduledDate, scheduledTime, action, notes.trim(), snoozedUntil]
        );
        medicationTake = insertResult.rows[0];
      }

      return res.json({
        success: true,
        message: action === 'taken'
          ? 'Medicamento marcado como tomado'
          : action === 'skipped'
            ? 'Toma marcada como omitida'
            : 'Recordatorio pospuesto 30 minutos',
        medication_take: medicationTake
      });
    }

    patient = Object.values(demo.patients).find((item) => normalizeCurp(item.curp) === normalizeCurp(curp));
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    if (!ensurePatientAccess(req, res, patient)) {
      return;
    }

    activePrescription = getActivePrescriptionFromDemo(demo, patient.id);
    targetItem = activePrescription?.items?.find((item) => item.id === Number(item_id)) || null;

    if (!activePrescription || !targetItem) {
      return res.status(404).json({ error: 'Medicamento activo no encontrado' });
    }

    if (!demo.medicationTakes[patient.id]) {
      demo.medicationTakes[patient.id] = [];
    }

    const snoozedUntil = action === 'snoozed'
      ? new Date(Date.now() + (30 * 60 * 1000)).toISOString()
      : null;
    const existingIndex = demo.medicationTakes[patient.id].findIndex(
      (item) => item.prescription_item_id === targetItem.id && String(item.scheduled_date || '').slice(0, 10) === scheduledDate
    );

    const medicationTake = {
      id: existingIndex >= 0 ? demo.medicationTakes[patient.id][existingIndex].id : (demo.medicationTakes[patient.id].length + 1),
      patient_id: patient.id,
      prescription_item_id: targetItem.id,
      medication_name: targetItem.name,
      dose_mg: targetItem.dose_mg,
      scheduled_date: scheduledDate,
      scheduled_time: String(targetItem.time || '').slice(0, 8),
      status: action,
      notes: notes.trim(),
      snoozed_until: snoozedUntil,
      action_taken_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      demo.medicationTakes[patient.id][existingIndex] = medicationTake;
    } else {
      demo.medicationTakes[patient.id].push(medicationTake);
    }

    return res.json({
      success: true,
      message: action === 'taken'
        ? 'Medicamento marcado como tomado'
        : action === 'skipped'
          ? 'Toma marcada como omitida'
          : 'Recordatorio pospuesto 30 minutos',
      medication_take: medicationTake
    });
  } catch (error) {
    console.error('Error al registrar toma de medicamento:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:curp/reminders/overview', verifyToken, async (req, res) => {
  try {
    const { curp } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    let patient;
    let activePrescription = null;
    let logs = [];

    if (isDb) {
      const { query } = require('../config/db');
      const patientResult = await query(
        'SELECT id, curp, name, email, phone, reminder_channel, reminder_opt_in, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [curp]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      patient = patientResult.rows[0];
      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      activePrescription = await getActivePrescriptionFromDb(patient.id);
      const logsResult = await query(
        'SELECT * FROM notification_logs WHERE patient_id = $1 ORDER BY scheduled_for DESC LIMIT 20',
        [patient.id]
      );
      logs = logsResult.rows;
    } else {
      patient = Object.values(demo.patients).find((item) => normalizeCurp(item.curp) === normalizeCurp(curp));
      if (!patient) {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }

      if (!ensurePatientAccess(req, res, patient)) {
        return;
      }

      activePrescription = getActivePrescriptionFromDemo(demo, patient.id);
      logs = (demo.notificationLogs?.[patient.id] || []).slice().sort((left, right) => new Date(right.scheduled_for) - new Date(left.scheduled_for)).slice(0, 20);
    }

    const upcoming = buildUpcomingReminders(activePrescription, new Date(), 8).map((item) => ({
      ...item,
      channel_hint: patient.reminder_channel || 'email'
    }));

    const today = new Date().toISOString().slice(0, 10);
    const sentToday = logs.filter((item) => String(item.scheduled_for || '').slice(0, 10) === today && ['sent', 'simulated'].includes(item.status)).length;

    return res.json({
      success: true,
      stats: {
        active_medications: activePrescription?.items?.length || 0,
        sent_today: sentToday,
        next_reminder: upcoming[0]?.scheduled_at || null,
        channel: patient.reminder_channel || 'email'
      },
      settings: {
        email: patient.email || '',
        phone: patient.phone || '',
        reminder_channel: patient.reminder_channel || 'email',
        reminder_opt_in: patient.reminder_opt_in !== false
      },
      upcoming,
      history: logs
    });
  } catch (error) {
    console.error('Error al obtener overview de recordatorios:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;

