const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'medialert_secret_key_2024';

// Generar token JWT
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username || user.curp, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Verificar token JWT
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

// Obtener datos demo del app
function getDemoData(req) {
  return req.app.get('demoData') || { doctors: {}, patients: {}, medications: {}, appointments: {} };
}

// Obtener estado de BD
function useDatabase(req) {
  return req.app.get('useDatabase') || false;
}

// POST /api/auth/login - Iniciar sesión
router.post('/login', async (req, res) => {
  try {
    const { credential, password } = req.body;
    if (!credential || !password) {
      return res.status(400).json({ error: 'Credenciales incompletas' });
    }

    const demo = getDemoData(req);
    const isDb = useDatabase(req);

    // Buscar en doctores
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
      // Modo demo
      doctor = Object.values(demo.doctors).find(d => 
        d.username.toLowerCase() === credential.toLowerCase() || 
        d.email.toLowerCase() === credential.toLowerCase()
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
          user: { id: doctor.id, username: doctor.username, name: doctor.name, license: doctor.license, specialty: doctor.specialty, role: 'doctor' }
        });
      }
    }

    // Buscar en pacientes
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
      // Modo demo
      patient = Object.values(demo.patients).find(p => 
        p.curp.toUpperCase() === credential.toUpperCase()
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

// GET /api/auth/verify - Verificar token
router.get('/verify', verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router;

