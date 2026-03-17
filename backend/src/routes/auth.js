const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

function getDemoData(req) {
  return req.app.get('demoData') || { doctors: {}, patients: {}, medications: {}, appointments: {} };
}

function useDatabase(req) {
  return req.app.get('useDatabase') || false;
}

router.post('/login', async (req, res) => {
  try {
    const { credential, password } = req.body;
    if (!credential || !password) {
      return res.status(400).json({ error: 'Credenciales incompletas' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    let doctor = null;

    if (isDb) {
      const doctorResult = await query(
        'SELECT id, username, email, password, name, license, specialty FROM doctors WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
        [credential]
      );
      if (doctorResult.rows.length > 0) {
        doctor = doctorResult.rows[0];
      }
    } else {
      doctor = Object.values(demo.doctors).find((item) =>
        item.username.toLowerCase() === credential.toLowerCase()
        || item.email.toLowerCase() === credential.toLowerCase()
      );
    }

    if (doctor) {
      const validPassword = isDb
        ? await bcrypt.compare(password, doctor.password)
        : bcrypt.compareSync(password, doctor.password);

      if (validPassword) {
        const token = generateToken({
          id: doctor.id,
          username: doctor.username,
          name: doctor.name,
          role: 'doctor'
        });

        return res.json({
          success: true,
          token,
          user: {
            id: doctor.id,
            username: doctor.username,
            name: doctor.name,
            license: doctor.license,
            specialty: doctor.specialty,
            role: 'doctor'
          }
        });
      }
    }

    let patient = null;

    if (isDb) {
      const patientResult = await query(
        'SELECT id, curp, name, password, doctor_id FROM patients WHERE UPPER(curp) = UPPER($1)',
        [credential]
      );
      if (patientResult.rows.length > 0) {
        patient = patientResult.rows[0];
      }
    } else {
      patient = Object.values(demo.patients).find((item) =>
        item.curp.toUpperCase() === credential.toUpperCase()
      );
    }

    if (patient) {
      const validPassword = isDb
        ? await bcrypt.compare(password, patient.password)
        : bcrypt.compareSync(password, patient.password);

      if (validPassword) {
        const token = generateToken({
          id: patient.id,
          curp: patient.curp,
          name: patient.name,
          role: 'patient'
        });

        return res.json({
          success: true,
          token,
          user: { id: patient.id, curp: patient.curp, name: patient.name, role: 'patient' }
        });
      }
    }

    return res.status(401).json({ error: 'Credenciales incorrectas' });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/verify', verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router;
