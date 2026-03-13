const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

function buildDatabaseUrlConfig(connectionString) {
  const parsedUrl = new URL(connectionString);
  const databaseName = parsedUrl.pathname.replace(/^\//, '') || 'defaultdb';

  console.log('Config DB detectada:', {
    hasDATABASE_URL: true,
    databaseName
  });

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  };
}

function buildHostConfig() {
  console.log('Config DB detectada:', {
    hasDATABASE_URL: false,
    hasDB_HOST: !!process.env.DB_HOST,
    databaseName: process.env.DB_NAME || 'medialert'
  });

  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'medialert',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

function getPool() {
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    console.log('Usando DATABASE_URL completa (Aiven/Render)');
    pool = new Pool(buildDatabaseUrlConfig(process.env.DATABASE_URL));
  } else if (process.env.DB_HOST) {
    console.log('Usando config individual local');
    pool = new Pool(buildHostConfig());
  } else {
    console.log('No hay configuracion de PostgreSQL - modo demo');
    return null;
  }

  pool.on('connect', () => {
    console.log('Conectado a PostgreSQL');
  });

  pool.on('error', (err) => {
    console.error('Error en PostgreSQL:', err.message);
  });

  return pool;
}

async function query(text, params) {
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error('No hay conexion a PostgreSQL');
  }
  return currentPool.query(text, params);
}

module.exports = {
  query,
  getPool
};
