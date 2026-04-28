 const express = require('express');
const { verifyToken, requireDoctor, requireSameDoctor } = require('../middleware/auth');

const router = express.Router();

// Toggle pausa notificaciones - RECETA COMPLETA
router.post('/prescriptions/:prescriptionId/pause-toggle', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    
    const demo = getDemoData(req);
    const isDb = useDatabase(req);
    
    if (isDb) {
      const { query } = require('../config/db');
      const presResult = await query('SELECT patient_id FROM prescriptions WHERE id = $1', [prescriptionId]);
      if (presResult.rows.length === 0) return res.status(404).json({ error: 'Receta no encontrada' });
      
      const patientId = presResult.rows[0].patient_id;
      const itemsResult = await query('SELECT id, notifications_paused FROM prescription_items WHERE prescription_id = $1', [prescriptionId]);
      const newPausedValue = itemsResult.rows.length > 0 && itemsResult.rows.every(item => item.notifications_paused === true) ? false : true;
      
      await query('UPDATE prescription_items SET notifications_paused = $1 WHERE prescription_id = $2', [newPausedValue, prescriptionId]);
      
      for (const item of itemsResult.rows) {
        await query('INSERT INTO status_logs (status, entity_type, entity_id, old_status, new_status, changed_by) VALUES ($1, $2, $3, $4, $5, $6)', 
          [newPausedValue ? 'paused' : 'active', 'prescription_item', item.id, item.notifications_paused ? 'paused' : 'active', newPausedValue ? 'paused' : 'active', req.user.id]);
      }
      
      return res.json({ success: true, message: `Receta ${newPausedValue ? 'pausada' : 'reanudada'}`, paused: newPausedValue });
      
    } else {
      let found = false;
      let paused = false;
      Object.values(demo.prescriptions).forEach(presList => {
        presList.forEach(pres => {
          if (String(pres.id) === String(prescriptionId)) {
            const allPaused = pres.items.every(item => item.notifications_paused === true);
            const newValue = !allPaused;
            pres.items.forEach(item => item.notifications_paused = newValue);
            paused = newValue;
            found = true;
          }
        });
      });
      if (!found) return res.status(404).json({ error: 'Receta no encontrada' });
      return res.json({ success: true, message: 'Receta toggle', paused });
    }
  } catch (error) {
    console.error('Error toggle receta:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Toggle pausa notificaciones - MEDICAMENTO INDIVIDUAL  
router.post('/prescriptions/items/:itemId/pause-toggle', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const demo = getDemoData(req);
    const isDb = useDatabase(req);
    
    if (isDb) {
      const { query } = require('../config/db');
      const itemResult = await query('SELECT notifications_paused FROM prescription_items WHERE id = $1', [itemId]);
      if (itemResult.rows.length === 0) return res.status(404).json({ error: 'Medicamento no encontrado' });
      
      const currentPaused = itemResult.rows[0].notifications_paused ?? false;
      const newPausedValue = !currentPaused;
      
      await query('UPDATE prescription_items SET notifications_paused = $1 WHERE id = $2', [newPausedValue, itemId]);
      await query('INSERT INTO status_logs (status, entity_type, entity_id, old_status, new_status, changed_by) VALUES ($1, $2, $3, $4, $5, $6)', 
        [newPausedValue ? 'paused' : 'active', 'prescription_item', itemId, currentPaused ? 'paused' : 'active', newPausedValue ? 'paused' : 'active', req.user.id]);
      
      return res.json({ success: true, message: `Medicamento ${newPausedValue ? 'pausado' : 'reanudado'}`, paused: newPausedValue });
      
    } else {
      let found = false;
      Object.values(demo.prescriptions).forEach(presList => {
        presList.forEach(pres => {
          pres.items?.forEach(item => {
            if (String(item.id) === String(itemId)) {
              item.notifications_paused = !(item.notifications_paused ?? false);
              found = true;
            }
          });
        });
      });
      if (!found) return res.status(404).json({ error: 'Medicamento no encontrado' });
      return res.json({ success: true, message: 'Medicamento toggle', paused: true });
    }
  } catch (error) {
    console.error('Error toggle item:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ========== FUNCIÓN getDemoData / useDatabase (SIEMPRE AL FINAL) ==========
function getDemoData(req) {
  return req.app.get('demoData') || {};
}

function useDatabase(req) {
  return req.app.get('useDatabase') || false;
}

// Resto del archivo original sin cambios...
// ...existing code...

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
    notifications_paused: item.notifications_paused ?? false,
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

router.get('/:id/patients', verifyToken, requireDoctor, requireSameDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        'SELECT id, curp, name, created_at FROM patients WHERE doctor_id = $1 ORDER BY created_at DESC',
        [doctorId]
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

    const doctor = Object.values(demo.doctors).find((item) => item.id === doctorId);
    const doctorName = doctor?.name || 'Doctor tratante';
    const patients = Object.values(demo.patients)
      .filter((item) => item.doctor_id === doctorId)
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
          'INSERT INTO prescription_items (prescription_id, name, dose_mg, frequency, interval_hours, time, duration_days, notes, emoji) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
          [
            prescription.id,
            item.name,
            item.dose_mg,
            item.frequency || '',
            item.interval_hours || 24,
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
        interval_hours: item.interval_hours || 24,
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

router.get('/:id/reports/prescriptions', verifyToken, requireDoctor, requireSameDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        'SELECT p.id, p.diagnosis, p.general_instructions, p.status, p.issued_at, d.name as doctor_name, COUNT(pi.id) as items_count, STRING_AGG(pi.name, \', \') as medications_list FROM prescriptions p LEFT JOIN doctors d ON d.id = p.doctor_id LEFT JOIN prescription_items pi ON pi.prescription_id = p.id WHERE p.doctor_id = $1 GROUP BY p.id, d.name ORDER BY p.issued_at DESC',
        [doctorId]
      );

      return res.json({ success: true, reports: result.rows });
    }

    const demo = getDemoData(req);
    const doctor = Object.values(demo.doctors).find((item) => item.id === doctorId);
    if (!doctor) return res.status(404).json({ error: 'Doctor no encontrado' });

    const reports = [];
    Object.entries(demo.prescriptions).forEach(([patientId, prescriptions]) => {
      const patient = Object.values(demo.patients).find((item) => item.id === Number(patientId));
      if (!patient || patient.doctor_id !== doctorId) {
        return;
      }

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

router.get('/:id/appointments', verifyToken, requireDoctor, requireSameDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        'SELECT a.id, a.date, a.time, a.status, a.created_at, p.name AS patient_name, p.curp FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE p.doctor_id = $1 ORDER BY a.date ASC, a.time ASC',
        [doctorId]
      );
      return res.json({ success: true, appointments: result.rows });
    }

    const appointments = [];
    Object.values(demo.patients)
      .filter((patient) => patient.doctor_id === doctorId)
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

router.get('/:id/appointment-requests', verifyToken, requireDoctor, requireSameDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(
        "SELECT ar.*, p.name AS patient_name, p.curp FROM appointment_requests ar JOIN patients p ON p.id = ar.patient_id WHERE p.doctor_id = $1 ORDER BY CASE ar.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, ar.created_at DESC",
        [doctorId]
      );

      return res.json({ success: true, requests: result.rows });
    }

    const requests = [];
    Object.values(demo.patients)
      .filter((patient) => patient.doctor_id === doctorId)
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

// Listar todas las prescriptions del doctor (activas, requested, deleted)
router.get('/:doctorId/prescriptions', verifyToken, requireDoctor, requireSameDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const demo = getDemoData(req);
    const isDb = useDatabase(req);
    const params = [doctorId];
    let q = `
      SELECT
        p.id, p.diagnosis, p.general_instructions, p.status, p.issued_at, p.updated_at, p.deleted_at,
        pt.curp as patient_curp, pt.name as patient_name,
        COUNT(pi.id) FILTER (WHERE COALESCE(pi.notifications_paused, false) = false) as active_items,
        COUNT(pi.id) as total_items
      FROM prescriptions p 
      JOIN patients pt ON pt.id = p.patient_id
      LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
      WHERE p.doctor_id = $1 AND p.deleted_at IS NULL
    `;
    let countQ = 'SELECT COUNT(DISTINCT p.id) FROM prescriptions p JOIN patients pt ON pt.id = p.patient_id WHERE p.doctor_id = $1 AND p.deleted_at IS NULL';
    let paramIndex = 2;

      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        q += ` AND (
          LOWER(pt.name) LIKE LOWER($${paramIndex})
          OR LOWER(pt.curp) LIKE LOWER($${paramIndex})
          OR LOWER(COALESCE(p.diagnosis, '')) LIKE LOWER($${paramIndex})
        )`;
        countQ += ` AND (
          LOWER(pt.name) LIKE LOWER($${paramIndex})
          OR LOWER(pt.curp) LIKE LOWER($${paramIndex})
          OR LOWER(COALESCE(p.diagnosis, '')) LIKE LOWER($${paramIndex})
        )`;
        params.push(searchTerm);
        paramIndex++;
      }

    if (status && status !== '') {
      q += ` AND p.status = $${paramIndex}`;
      countQ += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    q += `
      GROUP BY p.id, p.diagnosis, p.general_instructions, p.status, p.issued_at, p.updated_at, p.deleted_at, pt.curp, pt.name
      ORDER BY p.issued_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit), offset);

    if (isDb) {
      const { query } = require('../config/db');
      const result = await query(q, params);
      const countResult = await query(countQ, params.slice(0, -2)); // Sin limit/offset para count

      return res.json({
        success: true,
        prescriptions: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
        }
      });
    } else {
      let allPrescriptions = [];
      Object.entries(demo.prescriptions).forEach(([patientId, presList]) => {
        const patient = Object.values(demo.patients).find(p => p.id == patientId);
        if (patient?.doctor_id == parseInt(doctorId)) {
          presList.filter(p => p.status !== 'deleted' && !p.deleted_at).forEach(pres => {
            allPrescriptions.push({
              id: pres.id,
              diagnosis: pres.diagnosis || '',
              general_instructions: pres.general_instructions || '',
              status: pres.status,
              issued_at: pres.issued_at,
              updated_at: pres.updated_at || pres.issued_at,
              deleted_at: pres.deleted_at,
              patient_curp: patient.curp,
              patient_name: patient.name,
              active_items: pres.items?.filter(i => !(i.notifications_paused ?? false)).length || 0,
              total_items: pres.items?.length || 0
            });
          });
        }
      });

      if (status && status !== '') {
        allPrescriptions = allPrescriptions.filter(p => p.status === status);
      }
      if (search && search.trim()) {
        const lowerSearch = search.toLowerCase();
        allPrescriptions = allPrescriptions.filter(p => 
          p.patient_name.toLowerCase().includes(lowerSearch) || 
          p.patient_curp.toLowerCase().includes(lowerSearch) ||
          (p.diagnosis || '').toLowerCase().includes(lowerSearch)
        );
      }

      allPrescriptions.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
      const start = offset;
      const paginated = allPrescriptions.slice(start, start + parseInt(limit));

      return res.json({
        success: true,
        prescriptions: paginated,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: allPrescriptions.length,
          pages: Math.ceil(allPrescriptions.length / parseInt(limit))
        }
      });
    }
  } catch (error) {
    console.error('Error listando prescriptions doctor:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Obtener receta completa por ID (con items)
router.get('/prescriptions/:prescriptionId', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const presResult = await query(
        `SELECT p.*, pt.name as patient_name, pt.curp as patient_curp, d.name as doctor_name
         FROM prescriptions p
         JOIN patients pt ON pt.id = p.patient_id
         LEFT JOIN doctors d ON d.id = p.doctor_id
         WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [prescriptionId]
      );
      if (presResult.rows.length === 0) return res.status(404).json({ error: 'Receta no encontrada' });
      const prescription = presResult.rows[0];
      if (prescription.doctor_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

      const itemsResult = await query(
        'SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY time ASC, id ASC',
        [prescriptionId]
      );
      prescription.items = itemsResult.rows;

      return res.json({ success: true, prescription });
    } else {
      let targetPrescription = null;
      Object.values(demo.prescriptions).forEach(presList => {
        presList.forEach(pres => {
          if (String(pres.id) === String(prescriptionId) && pres.doctor_id === req.user.id) {
            const patient = Object.values(demo.patients).find(p => p.id === pres.patient_id);
            targetPrescription = {
              ...pres,
              patient_name: patient?.name || '',
              patient_curp: patient?.curp || ''
            };
          }
        });
      });
      if (!targetPrescription) return res.status(404).json({ error: 'Receta no encontrada' });
      return res.json({ success: true, prescription: targetPrescription });
    }
  } catch (error) {
    console.error('Error obteniendo receta:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Editar receta completa (upsert inteligente para preservar IDs de items)
router.put('/prescriptions/:prescriptionId', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { diagnosis, general_instructions, items = [], status } = req.body;
    
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const presResult = await query('SELECT patient_id, doctor_id FROM prescriptions WHERE id = $1', [prescriptionId]);
      if (presResult.rows.length === 0) return res.status(404).json({ error: 'Receta no encontrada' });
      
      const { patient_id, doctor_id } = presResult.rows[0];
      if (doctor_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

      // Update prescription
      await query(
        'UPDATE prescriptions SET diagnosis = $1, general_instructions = $2, status = COALESCE($3, status), updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [diagnosis || '', general_instructions || '', status, prescriptionId]
      );

      // Obtener items actuales
      const currentItemsResult = await query('SELECT id FROM prescription_items WHERE prescription_id = $1', [prescriptionId]);
      const currentIds = currentItemsResult.rows.map(r => r.id);
      const incomingIds = items.filter(i => i.id).map(i => Number(i.id));
      const idsToDelete = currentIds.filter(id => !incomingIds.includes(id));

      // Eliminar items que ya no estan en la lista
      if (idsToDelete.length > 0) {
        await query('DELETE FROM prescription_items WHERE id = ANY($1)', [idsToDelete]);
      }

      // Actualizar items existentes e insertar nuevos
      const processedItems = [];
      for (const item of items) {
        if (item.id && currentIds.includes(Number(item.id))) {
          // Actualizar item existente
          const updateResult = await query(
            `UPDATE prescription_items 
             SET name = $1, dose_mg = $2, frequency = $3, interval_hours = $4, time = $5, duration_days = $6, notes = $7, emoji = $8
             WHERE id = $9 RETURNING *`,
            [item.name, item.dose_mg, item.frequency || '', item.interval_hours || 24, item.time, item.duration_days || null, item.notes || '', item.emoji || '💊', item.id]
          );
          processedItems.push(updateResult.rows[0]);
        } else {
          // Insertar nuevo item
          const insertResult = await query(
            'INSERT INTO prescription_items (prescription_id, name, dose_mg, frequency, interval_hours, time, duration_days, notes, emoji) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [prescriptionId, item.name, item.dose_mg, item.frequency || '', item.interval_hours || 24, item.time, item.duration_days || null, item.notes || '', item.emoji || '💊']
          );
          processedItems.push(insertResult.rows[0]);
        }
      }

      return res.json({
        success: true,
        message: `Receta #${prescriptionId} actualizada con ${processedItems.length} medicamentos`,
        items_count: processedItems.length
      });
    } else {
      // Demo logic
      let found = false;
      Object.values(demo.prescriptions).forEach(presList => {
        presList.forEach(pres => {
          if (String(pres.id) === String(prescriptionId) && pres.doctor_id === req.user.id) {
            pres.diagnosis = diagnosis || pres.diagnosis;
            pres.general_instructions = general_instructions || pres.general_instructions;
            if (status) pres.status = status;
            
            // Upsert inteligente en demo
            const currentItems = pres.items || [];
            const incomingIds = items.filter(i => i.id).map(i => Number(i.id));
            const newItems = [];
            let nextId = currentItems.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
            
            for (const item of items) {
              if (item.id && currentItems.some(ci => ci.id === Number(item.id))) {
                // Actualizar existente
                const existing = currentItems.find(ci => ci.id === Number(item.id));
                newItems.push({ ...existing, ...item, prescription_id: prescriptionId });
              } else {
                // Nuevo item
                newItems.push({
                  ...item,
                  id: nextId++,
                  prescription_id: prescriptionId
                });
              }
            }
            pres.items = newItems;
            found = true;
          }
        });
      });
      if (!found) return res.status(404).json({ error: 'Receta no encontrada' });
      return res.json({ success: true, message: 'Receta actualizada' });
    }
  } catch (error) {
    console.error('Error editando receta:', error);
    return res.status(500).json({ error: error.message });
  }
});
// Soft-delete receta
router.delete('/prescriptions/:prescriptionId', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const presResult = await query('SELECT doctor_id FROM prescriptions WHERE id = $1', [prescriptionId]);
      if (presResult.rows.length === 0) return res.status(404).json({ error: 'Receta no encontrada' });
      if (presResult.rows[0].doctor_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });

      const result = await query(
        'UPDATE prescriptions SET status = $1, deleted_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
        ['deleted', prescriptionId]
      );
      return res.json({ success: true, message: 'Receta eliminada permanentemente (soft-delete)', deleted_id: result.rows[0].id });
    } else {
      let found = false;
      Object.values(demo.prescriptions).forEach(presList => {
        presList.forEach(pres => {
          if (String(pres.id) === String(prescriptionId) && pres.doctor_id === req.user.id) {
            pres.status = 'deleted';
            pres.deleted_at = new Date().toISOString();
            found = true;
          }
        });
      });
      if (!found) return res.status(404).json({ error: 'Receta no encontrada' });
      return res.json({ success: true, message: 'Receta eliminada' });
    }
  } catch (error) {
    console.error('Error eliminando receta:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Aprobar solicitud de receta (requested -> active, doctor agrega items)
router.post('/prescriptions/:prescriptionId/approve-request', verifyToken, requireDoctor, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { diagnosis, general_instructions, items } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Se requieren medicamentos para aprobar' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    if (isDb) {
      const { query } = require('../config/db');
      const presResult = await query('SELECT patient_id, doctor_id, status FROM prescriptions WHERE id = $1', [prescriptionId]);
      if (presResult.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
      const pres = presResult.rows[0];
      if (pres.doctor_id !== req.user.id || pres.status !== 'requested') return res.status(403).json({ error: 'No autorizado' });

      // Update to active + add items
      await query(
        'UPDATE prescriptions SET diagnosis = $1, general_instructions = $2, status = $3 WHERE id = $4',
        [diagnosis || pres.diagnosis, general_instructions || pres.general_instructions, 'active', prescriptionId]
      );

      await query('DELETE FROM prescription_items WHERE prescription_id = $1', [prescriptionId]);
      const insertedItems = [];
      for (const item of items) {
        const itemResult = await query(
          'INSERT INTO prescription_items (...) VALUES (...) RETURNING *', // Similar a create
          // params...
        );
        insertedItems.push(itemResult.rows[0]);
      }

      return res.json({
        success: true,
        message: `Solicitud aprobada y receta activada con ${insertedItems.length} medicamentos`,
        prescription_id: prescriptionId
      });
    } else {
      // Demo...
      return res.json({ success: true, message: 'Aprobado demo' });
    }
  } catch (error) {
    console.error('Error aprobando solicitud:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
