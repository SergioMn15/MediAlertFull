const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'medialert_secret_key_2024';

// Generar token JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username || user.curp,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Verificar token JWT
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No se proporcionó token de autenticación' });
  }

  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// Middleware para verificar rol de doctor
const requireDoctor = (req, res, next) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Acceso restringido a doctores' });
  }
  next();
};

// Middleware para verificar rol de paciente
const requirePatient = (req, res, next) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Acceso restringido a pacientes' });
  }
  next();
};

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  requireDoctor,
  requirePatient
};

