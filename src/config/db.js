const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

// Crear pool solo si hay configuración de BD
function getPool() {
  if (pool) return pool;
  
  const hasDbConfig = process.env.DB_HOST || process.env.DATABASE_URL;
  
  if (!hasDbConfig) {
    console.log('⚠️ No hay configuración de PostgreSQL');
    return null;
  }
  
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'medialert',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('connect', () => {
    console.log('✅ Conectado a PostgreSQL');
  });

  pool.on('error', (err) => {
    console.error('❌ Error en PostgreSQL:', err.message);
  });

  return pool;
}

// Función para ejecutar queries
async function query(text, params) {
  const p = getPool();
  if (!p) {
    throw new Error('No hay conexión a PostgreSQL');
  }
  return await p.query(text, params);
}

module.exports = {
  query,
  getPool
};

