const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

function getPoolMax() {
  const configured = Number(process.env.DB_POOL_MAX);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  // Keep the default conservative for small hosted PostgreSQL plans.
  return 5;
}

function buildSslConfig() {
  const caFromEnv = process.env.DB_CA_CERT || process.env.DATABASE_CA_CERT;
  const caFromBase64 = process.env.DB_CA_CERT_BASE64 || process.env.DATABASE_CA_CERT_BASE64;

  if (caFromEnv) {
    return {
      rejectUnauthorized: true,
      ca: caFromEnv.replace(/\\n/g, '\n')
    };
  }

  if (caFromBase64) {
    return {
      rejectUnauthorized: true,
      ca: Buffer.from(caFromBase64, 'base64').toString('utf8')
    };
  }

  return {
    rejectUnauthorized: false
  };
}

function buildDatabaseUrlConfig(connectionString) {
  const parsedUrl = new URL(connectionString);
  const databaseName = parsedUrl.pathname.replace(/^\//, '') || 'defaultdb';
  const sslConfig = buildSslConfig();
  parsedUrl.searchParams.delete('sslmode');
  parsedUrl.searchParams.delete('sslcert');
  parsedUrl.searchParams.delete('sslkey');
  parsedUrl.searchParams.delete('sslrootcert');

  console.log('Config DB detectada:', {
    hasDATABASE_URL: true,
    databaseName,
    host: parsedUrl.hostname,
    port: parsedUrl.port || '5432',
    usingCustomCa: !!(sslConfig.ca)
  });

  return {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 5432),
    database: databaseName,
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    ssl: sslConfig,
    max: getPoolMax(),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
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
    max: getPoolMax(),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: process.env.DB_SSL === 'true' ? buildSslConfig() : false
  };
}

function createPool(config) {
  const newPool = new Pool(config);

  newPool.on('connect', () => {
    console.log('Conectado a PostgreSQL');
  });

  newPool.on('error', (err) => {
    console.error('Error en PostgreSQL:', err.message);
    pool = null;
  });

  return newPool;
}

function getPool() {
  if (pool) return pool;

  if (process.env.DATABASE_URL) {
    console.log('Usando DATABASE_URL completa (Aiven/Render)');
    pool = createPool(buildDatabaseUrlConfig(process.env.DATABASE_URL));
  } else if (process.env.DB_HOST) {
    console.log('Usando config individual local');
    pool = createPool(buildHostConfig());
  } else {
    console.log('No hay configuracion de PostgreSQL - modo demo');
    return null;
  }

  return pool;
}

async function query(text, params) {
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error('No hay conexion a PostgreSQL');
  }
  try {
    return await currentPool.query(text, params);
  } catch (err) {
    if (err.message && err.message.includes('Connection terminated')) {
      pool = null;
    }
    throw err;
  }
}

module.exports = {
  query,
  getPool
};
