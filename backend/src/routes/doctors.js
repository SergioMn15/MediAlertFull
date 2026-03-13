const express = require('express');
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
    "SELECT p.*, d.name AS doctor_name FROM prescriptions p LEFT JOIN doctors d ON d.id = p.doctor_id WHERE p.patient_id = $1 AND p.status = 'active' ORDER BY p.issued_at DESC LIMIT 1",
    [patientId]
  );

  if (prescriptionResult.rows.length === 0) {
    return null;
  }

  const prescription = prescriptionResult.rows[0];
  const itemsResult = await query(
    'SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY time ASC, id ASC',
    [prescription.id]
  );

  prescription.items = itemsResult.rows;
  prescription.doctor_name = prescription.doctor_name || 'Doctor tratante';
  return prescription;
}

function getActivePrescriptionFromDemo(demo, patientId, doctorName = 'Doctor tratante') {
  const prescriptions = demo.prescriptions[patientId] || [];
  const activePrescription = prescriptions.find((item) => item.status === 'active') || prescriptions[0] || null;
  if (!activePrescription) {
    return null;
  }
  return {
    ...activePrescription,
    doctor_name: doctorName
  };
}

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

      const countResult = await query('SELECT COUNT(*)::int AS patient_count FROM patients WHERE doctor_id = $1', [req.user.id]);
      return res.json({
        success: true,
        doctor: { ...result.rows[0], patient_count: countResult.rows[0].patient_count }
      });
    }

    const doctor = Object.values(demo.doctors).find((item) => item.id === req.user.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor no encontrado' });
    }

    return res.json({
      success: true,
      doctor: {
        ...doctor,
        patient_count: Object.values(demo.patients).filter((item) => item.doctor_id === doctor.id).length
      }
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:id/patients', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        'SELECT id, curp, name, created_at FROM patients WHERE doctor_id = $1 ORDER BY created_at DESC',
        [id]
      );

      const patients = await Promise.all(result.rows.map(async (patient) => {
        const activePrescription = await getActivePrescriptionFromDb(patient.id);
        return {
          ...patient,
          medication_count: activePrescription?.items?.length || 0,
          appointment_count: 0,
          next_medication: activePrescription?.items?.length
            ? mapPrescriptionItemToMedication(activePrescription.items[0], activePrescription, activePrescription.doctor_name)
            : null
        };
      }));

      return res.json({ success: true, patients });
    }

    const doctor = Object.values(demo.doctors).find((item) => item.id === parseInt(id, 10));
    const doctorName = doctor?.name || 'Doctor tratante';
    const patients = Object.values(demo.patients)
      .filter((item) => item.doctor_id === parseInt(id, 10))
      .map((patient) => {
        const activePrescription = getActivePrescriptionFromDemo(demo, patient.id, doctorName);
        const medications = activePrescription
          ? activePrescription.items.map((item) => mapPrescriptionItemToMedication(item, activePrescription, doctorName))
          : [];

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
    console.error('Error al obtener pacientes:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/prescriptions', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { curp, diagnosis, general_instructions, items } = req.body;

    console.log('🎉 Creando receta para CURP:', curp, '- Items recibidos:', items?.length || 0, '- Primer item:', items?.[0]?.name || 'N/A');

    if (!curp || !Array.isArray(items) || items.length === 0) {
      console.log('❌ Error validacion: items vacio o no array');
      return res.status(400).json({ error: 'Se requiere paciente y al menos un medicamento' });
    }

    const invalidItem = items.find((item) => !item.name || !item.dose_mg || !item.time);
    if (invalidItem) {
      console.log('❌ Item invalido:', invalidItem);
      return res.status(400).json({ error: 'Cada medicamento debe tener nombre, dosis y horario' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const patientResult = await query(
        'SELECT id FROM patients WHERE UPPER(curp) = UPPER($1) AND doctor_id = $2',
        [curp, req.user.id]
      );

      if (patientResult.rows.length === 0) {
        console.log('❌ Paciente no encontrado para:', curp);
        return res.status(404).json({ error: 'Paciente no encontrado o no asignado al doctor' });
      }

      const patientId = patientResult.rows[0].id;
      await query('UPDATE prescriptions SET status = $1 WHERE patient_id = $2 AND status = $3', ['completed', patientId, 'active']);

      const prescriptionResult = await query(
        'INSERT INTO prescriptions (patient_id, doctor_id, diagnosis, general_instructions, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [patientId, req.user.id, diagnosis || '', general_instructions || '', 'active']
      );

      const prescription = prescriptionResult.rows[0];
      const insertedItems = [];
      console.log('📝 Insertando', items.length, 'items a prescription', prescription.id);
      
      for (const item of items) {
        const itemResult = await query(
          'INSERT INTO prescription_items (prescription_id, name, dose_mg, frequency, time, duration_days, notes, emoji) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
          [
            prescription.id,
            item.name,
            item.dose_mg,
            item.frequency || '',
            item.time,
            item.duration_days || null,
            item.notes || '',
            item.emoji || '💊'
          ]
        );
        insertedItems.push(itemResult.rows[0]);
      }
      console.log('✅ Insertados', insertedItems.length, 'items. Respuesta OK');

      return res.status(201).json({
        success: true,
        message: 'Receta medica con ' + insertedItems.length + ' medicamentos creada correctamente',
        prescription: {
          ...prescription,
          doctor_name: req.user.name,
          items: insertedItems
        }
      });
    }

    const patient = Object.values(demo.patients).find((item) => item.curp.toUpperCase() === curp.toUpperCase() && item.doctor_id === req.user.id);
    if (!patient) {
      return res.status(404).json({ error: 'Paciente no encontrado o no asignado al doctor' });
    }

    if (!demo.prescriptions[patient.id]) {
      demo.prescriptions[patient.id] = [];
    }

    demo.prescriptions[patient.id].forEach((item) => {
      if (item.status === 'active') {
        item.status = 'completed';
      }
    });

    const prescriptionId = demo.prescriptions[patient.id].reduce((max, item) => Math.max(max, item.id), 0) + 1;
    const prescription = {
      id: prescriptionId,
      patient_id: patient.id,
      doctor_id: req.user.id,
      diagnosis: diagnosis || '',
      general_instructions: general_instructions || '',
      status: 'active',
      issued_at: new Date().toISOString(),
      items: items.map((item, index) => ({
        id: index + 1,
        prescription_id: prescriptionId,
        name: item.name,
        dose_mg: item.dose_mg,
        frequency: item.frequency || '',
        time: item.time,
        duration_days: item.duration_days || null,
        notes: item.notes || '',
        emoji: item.emoji || '💊'
      }))
    };

    demo.prescriptions[patient.id].unshift(prescription);
    demo.medications[patient.id] = prescription.items.map((item) => mapPrescriptionItemToMedication(item, prescription, req.user.name));

    console.log('✅ Demo: Receta creada con', prescription.items.length, 'items');

    return res.status(201).json({
      success: true,
      message: 'Receta medica con ' + prescription.items.length + ' medicamentos creada correctamente',
      prescription: {
        ...prescription,
        doctor_name: req.user.name
      }
    });
  } catch (error) {
    console.error('💥 Error al crear receta medica:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:id/reports/prescriptions', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        'SELECT p.id, p.diagnosis, p.general_instructions, p.status, p.issued_at, d.name as doctor_name, COUNT(pi.id) as items_count, STRING_AGG(pi.name, \', \') as medications_list FROM prescriptions p LEFT JOIN doctors d ON d.id = p.doctor_id LEFT JOIN prescription_items pi ON pi.prescription_id = p.id WHERE p.doctor_id = $1 GROUP BY p.id, d.name ORDER BY p.issued_at DESC',
        [id]
      );

      return res.json({ success: true, reports: result.rows });
    }

    const demo = getDemoData(req);
    const doctor = Object.values(demo.doctors).find(d => d.id === parseInt(id, 10));
    if (!doctor) return res.status(404).json({ error: 'Doctor no encontrado' });

    const reports = [];
    Object.entries(demo.prescriptions).forEach(([patientId, prescriptions]) => {
      prescriptions.forEach(prescription => {
        reports.push({
          id: prescription.id,
          diagnosis: prescription.diagnosis,
          general_instructions: prescription.general_instructions,
          status: prescription.status,
          issued_at: prescription.issued_at,
          doctor_name: doctor.name,
          items_count: prescription.items.length,
          medications_list: prescription.items.map(i => i.name).join(', ')
        });
      });
    });

    return res.json({ success: true, reports });
  } catch (error) {
    console.error('Error en reporte prescriptions:', error);
    return res.status(500).json({ error: 'Error en reporte' });
  }
});

router.get('/:id/appointments', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        'SELECT a.id, a.date, a.time, a.status, a.created_at, p.name AS patient_name, p.curp FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE p.doctor_id = $1 ORDER BY a.date ASC, a.time ASC',
        [id]
      );
      return res.json({ success: true, appointments: result.rows });
    }

    const appointments = [];
    Object.values(demo.patients)
      .filter((patient) => patient.doctor_id === parseInt(id, 10))
      .forEach((patient) => {
        (demo.appointments[patient.id] || []).forEach((appointment) => {
          appointments.push({
            ...appointment,
            patient_name: patient.name,
            curp: patient.curp
          });
        });
      });

    appointments.sort((left, right) => {
      const leftDate = new Date(left.date + 'T' + left.time);
      const rightDate = new Date(right.date + 'T' + right.time);
      return leftDate - rightDate;
    });
    return res.json({ success: true, appointments });
  } catch (error) {
    console.error('Error al obtener citas:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:id/appointment-requests', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { id } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        "SELECT ar.*, p.name AS patient_name, p.curp FROM appointment_requests ar JOIN patients p ON p.id = ar.patient_id WHERE p.doctor_id = $1 ORDER BY CASE ar.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, ar.created_at DESC",
        [id]
      );

      return res.json({ success: true, requests: result.rows });
    }

    const requests = [];
    Object.values(demo.patients)
      .filter((patient) => patient.doctor_id === parseInt(id, 10))
      .forEach((patient) => {
        (demo.appointmentRequests[patient.id] || []).forEach((request) => {
          requests.push({
            ...request,
            patient_name: patient.name,
            curp: patient.curp
          });
        });
      });

    requests.sort((left, right) => {
      const order = { pending: 0, approved: 1, rejected: 2 };
      const leftOrder = order[left.status] ?? 3;
      const rightOrder = order[right.status] ?? 3;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return new Date(right.created_at) - new Date(left.created_at);
    });

    return res.json({ success: true, requests });
  } catch (error) {
    console.error('Error al obtener solicitudes de cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

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
      const requestResult = await query(
        "SELECT ar.*, p.doctor_id FROM appointment_requests ar JOIN patients p ON p.id = ar.patient_id WHERE ar.id = $1",
        [requestId]
      );

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
        "UPDATE appointment_requests SET status = $1, doctor_response = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *",
        [status, response || '', requestId]
      );

      let appointment = null;
      if (action === 'approve') {
        const appointmentResult = await query(
          "INSERT INTO appointments (patient_id, date, time, status) VALUES ($1, $2, $3, $4) RETURNING *",
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
      .filter((patient) => patient.doctor_id === req.user.id)
      .some((patient) => {
        const request = (demo.appointmentRequests[patient.id] || []).find((item) => item.id === parseInt(requestId, 10));
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
      appointment = {
        id: (demo.appointments[targetPatient.id]?.length || 0) + 1,
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

    return res.json({
      success: true,
      message: action === 'approve' ? 'Solicitud aprobada y cita creada' : 'Solicitud rechazada',
      request: targetRequest,
      appointment
    });
  } catch (error) {
    console.error('Error al revisar solicitud de cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
