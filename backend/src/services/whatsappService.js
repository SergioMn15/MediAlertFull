const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const whatsappClients = new Map();
const whatsappQrCodes = new Map();
const whatsappConnectionErrors = new Map();

const originalConsoleInfo = console.info.bind(console);
console.info = (...args) => {
  if (String(args[0] || '').startsWith('Closing session:')) {
    return;
  }

  originalConsoleInfo(...args);
};

const RECONNECTABLE_STATUS_CODES = new Set([
  DisconnectReason.connectionClosed,
  DisconnectReason.connectionLost,
  DisconnectReason.restartRequired,
  DisconnectReason.timedOut
]);

function getSessionDir(doctorId) {
  return path.join(__dirname, '..', '..', 'whatsapp_sessions', `doctor_${doctorId}`);
}

function ensureSessionDirExists(doctorId) {
  const sessionDir = getSessionDir(doctorId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
}

function hasSavedSession(doctorId) {
  const sessionDir = getSessionDir(doctorId);
  return fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
}

function removeSessionFiles(doctorId) {
  const sessionDir = getSessionDir(doctorId);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true, maxRetries: 3 });
    }
  } catch (e) {
    console.warn(`No se pudo limpiar carpeta de sesion (doctor ${doctorId}):`, e.message);
  }

  const legacySessionFile = path.join(__dirname, '..', '..', 'whatsapp_sessions', `doctor_${doctorId}.json`);
  try {
    if (fs.existsSync(legacySessionFile)) {
      fs.unlinkSync(legacySessionFile);
    }
  } catch (e) {
    console.warn(`No se pudo limpiar sesion legacy (doctor ${doctorId}):`, e.message);
  }
}


async function markDoctorWhatsAppConnected(doctorId, connected) {
  try {
    const { query } = require('../config/db');
    await query(
      'UPDATE doctors SET whatsapp_connected = $1 WHERE id = $2',
      [connected, doctorId]
    );
  } catch (error) {
    console.error(`Error actualizando estado de WhatsApp para doctor ${doctorId}:`, error.message);
  }
}

async function createWhatsAppClient(doctorId, callbacks = {}) {
  const { onQR, onReady, onDisconnect, onConnectionUpdate } = callbacks;

  if (whatsappClients.has(doctorId)) {
    console.log(`Cliente de WhatsApp ya existe para doctor ${doctorId}`);
    const latestQr = whatsappQrCodes.get(doctorId);
    if (latestQr && onQR) {
      onQR(latestQr);
    }
    return whatsappClients.get(doctorId);
  }

  ensureSessionDirExists(doctorId);
  const { state, saveCreds } = await useMultiFileAuthState(getSessionDir(doctorId));
  const { version, isLatest, error: versionError } = await fetchLatestWaWebVersion({
    timeout: 10000
  });

  if (versionError) {
    console.warn(`No se pudo obtener la version web mas reciente de WhatsApp. Usando version local: ${version.join('.')}`);
  } else {
    console.log(`Version WhatsApp Web ${version.join('.')} (${isLatest ? 'actualizada' : 'local'})`);
  }

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 30000,
    qrTimeout: 60000,
    syncFullHistory: false,
    markOnlineOnConnect: true
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`QR generado para doctor ${doctorId}`);
      whatsappQrCodes.set(doctorId, qr);
      whatsappConnectionErrors.delete(doctorId);
      if (onQR) {
        onQR(qr);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode
        : 500;
      const shouldReconnect = RECONNECTABLE_STATUS_CODES.has(statusCode);

      console.log(`Conexion cerrada para doctor ${doctorId}, razon: ${statusCode}, reconectar: ${shouldReconnect}`);
      whatsappClients.delete(doctorId);
      whatsappConnectionErrors.set(doctorId, statusCode);

      if (onDisconnect) {
        onDisconnect(shouldReconnect, statusCode);
      }

      if (shouldReconnect) {
        setTimeout(async () => {
          try {
            await createWhatsAppClient(doctorId, callbacks);
          } catch (error) {
            console.error(`Error reconectando para doctor ${doctorId}:`, error.message);
          }
        }, 5000);
      } else {
        whatsappQrCodes.delete(doctorId);
        removeSessionFiles(doctorId);
        markDoctorWhatsAppConnected(doctorId, false);
      }
    }

    if (connection === 'open') {
      console.log(`Conexion de WhatsApp abierta para doctor ${doctorId}`);
      whatsappQrCodes.delete(doctorId);
      whatsappConnectionErrors.delete(doctorId);
      markDoctorWhatsAppConnected(doctorId, true);
      if (onReady) {
        onReady();
      }
    }

    if (onConnectionUpdate) {
      onConnectionUpdate(update);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  whatsappClients.set(doctorId, sock);
  console.log(`Cliente de WhatsApp creado para doctor ${doctorId}`);

  return sock;
}

function getWhatsAppClient(doctorId) {
  return whatsappClients.get(doctorId);
}

function getLatestQr(doctorId) {
  return whatsappQrCodes.get(doctorId) || null;
}

function getLastConnectionError(doctorId) {
  return whatsappConnectionErrors.get(doctorId) || null;
}

function isDoctorConnected(doctorId) {
  const client = whatsappClients.get(doctorId);
  if (!client) return false;

  // En Baileys, `client.user` puede no estar disponible aún aunque ya se haya abierto conexión.
  // Usamos señales más seguras.
  const hasUser = Boolean(client?.user);
  const hasKey = Boolean(client?.key);
  return hasUser || hasKey;
}


async function sendWhatsAppMessage(doctorId, phoneNumber, message) {
  let client = getWhatsAppClient(doctorId);

  if (!client && hasSavedSession(doctorId)) {
    console.log(`No hay cliente Baileys en memoria para doctor ${doctorId}, intentando restaurar desde sesion guardada...`);
    try {
      await createWhatsAppClient(doctorId);
      client = getWhatsAppClient(doctorId);
    } catch (restoreError) {
      console.warn(`No se pudo restaurar el cliente de WhatsApp para doctor ${doctorId}:`, restoreError.message);
    }
  }

  if (!client) {
    throw new Error(`No hay sesion de WhatsApp activa para el doctor ${doctorId}`);
  }

  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  const jid = `${normalizedPhone}@s.whatsapp.net`;

  const result = await client.sendMessage(jid, {
    text: message,
    contextInfo: {
      forwardingScore: 0,
      isForwarded: false
    }
  });

  console.log(`Mensaje enviado a ${phoneNumber} por doctor ${doctorId}:`, result?.key?.id);
  return {
    success: true,
    messageId: result?.key?.id,
    timestamp: new Date().toISOString()
  };
}

async function logoutWhatsApp(doctorId) {
  const client = whatsappClients.get(doctorId);

  if (client) {
    client.end(undefined);
    whatsappClients.delete(doctorId);
  }

  whatsappQrCodes.delete(doctorId);
  whatsappConnectionErrors.delete(doctorId);
  await markDoctorWhatsAppConnected(doctorId, false);

  removeSessionFiles(doctorId);

  console.log(`Sesion de WhatsApp cerrada para doctor ${doctorId}`);
}

async function initializeSavedSessions() {
  const sessionRoot = path.join(__dirname, '..', '..', 'whatsapp_sessions');
  const doctorsToRestore = new Set();

  if (fs.existsSync(sessionRoot)) {
    const entries = fs.readdirSync(sessionRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^doctor_(\d+)$/);
      if (match) {
        doctorsToRestore.add(Number(match[1]));
      }
    }
  }

  try {
    const { query } = require('../config/db');
    const result = await query('SELECT id FROM doctors WHERE whatsapp_connected = true');
    for (const row of result.rows) {
      doctorsToRestore.add(row.id);
    }
  } catch (error) {
    console.error('Error consultando la DB para sesiones guardadas:', error.message);
  }

  if (doctorsToRestore.size === 0) {
    console.log('No se encontraron sesiones de WhatsApp para restaurar');
    return;
  }

  console.log(`Encontradas ${doctorsToRestore.size} sesiones de WhatsApp potenciales para restaurar`);

  for (const doctorId of doctorsToRestore) {
    try {
      await createWhatsAppClient(doctorId, {
        onReady: () => console.log(`Sesion restaurada para doctor ${doctorId}`),
        onQR: () => console.log(`QR necesario para doctor ${doctorId} (sesion expirada)`),
        onDisconnect: (shouldReconnect) => {
          if (!shouldReconnect) {
            console.log(`Sesion de doctor ${doctorId} cerrada permanentemente`);
          }
        }
      });
    } catch (error) {
      console.error(`Error restaurando sesion para doctor ${doctorId}:`, error.message);
    }
  }
}

module.exports = {
  createWhatsAppClient,
  getWhatsAppClient,
  getLatestQr,
  getLastConnectionError,
  isDoctorConnected,
  sendWhatsAppMessage,
  logoutWhatsApp,
  initializeSavedSessions,
  whatsappClients
};
