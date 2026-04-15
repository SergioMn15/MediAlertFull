const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { buildReminderMessage } = require('./reminderEngine');

async function sendEmailReminder(patient, item, scheduledAt) {
  const from = process.env.REMINDER_FROM_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const message = buildReminderMessage(patient, item, scheduledAt);

  if (!patient.email) {
    return { status: 'skipped', provider: 'email', error_message: 'Paciente sin correo configurado' };
  }

  if (apiKey && from) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [patient.email],
          subject: message.subject,
          html: message.html,
          text: message.text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { status: 'failed', provider: 'resend', error_message: errorText || 'Error enviando correo' };
      }

      return { status: 'sent', provider: 'resend', recipient: patient.email, message_body: message.text };
    } catch (fetchError) {
      return { status: 'failed', provider: 'resend', error_message: fetchError.message || 'Error de red al enviar correo' };
    }
  }

  console.log(`[Simulado][EMAIL] ${patient.email} -> ${message.text}`);
  return { status: 'simulated', provider: 'console-email', recipient: patient.email, message_body: message.text };
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('+') ? raw : `+${raw}`;
}

async function sendSMSReminder(patient, item, scheduledAt) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_FROM;
  const message = buildReminderMessage(patient, item, scheduledAt);

  if (!patient.phone) {
    return { status: 'skipped', provider: 'sms', error_message: 'Paciente sin telefono configurado' };
  }

  if (accountSid && authToken && fromNumber) {
    const normalizedTo = patient.phone.startsWith('+') ? patient.phone : `+${patient.phone}`;
    const normalizedFrom = fromNumber.startsWith('+') ? fromNumber : `+${fromNumber}`;
    const body = new URLSearchParams({
      To: normalizedTo,
      From: normalizedFrom,
      Body: message.text.slice(0, 160) // SMS max 160 chars
    });

    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { status: 'failed', provider: 'twilio-sms', error_message: errorText || 'Error enviando SMS' };
      }

      return { status: 'sent', provider: 'twilio-sms', recipient: patient.phone, message_body: message.text };
    } catch (fetchError) {
      return { status: 'failed', provider: 'twilio-sms', error_message: fetchError.message || 'Error de red al enviar SMS' };
    }
  }

  console.log(`[Simulado][SMS] ${patient.phone} -> ${message.text.slice(0, 100)}...`);
  return { status: 'simulated', provider: 'console-sms', recipient: patient.phone, message_body: message.text };
}

function runPyWhatKit(phone, text) {
  const preferredPython = process.env.PYTHON_BIN;
  const localPython = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python313', 'python.exe')
    : '';
  const pythonBin = preferredPython || (localPython && fs.existsSync(localPython) ? localPython : 'python');
  const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'send_whatsapp_pywhatkit.py');
  const command = process.platform === 'win32' ? 'powershell.exe' : pythonBin;
  const args = process.platform === 'win32'
    ? [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `& '${pythonBin.replace(/'/g, "''")}' '${scriptPath.replace(/'/g, "''")}'`
      ]
    : [scriptPath];

  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: path.join(__dirname, '..', '..', '..'),
        env: {
          ...process.env,
          PYWHATKIT_PHONE: phone,
          PYWHATKIT_MESSAGE: text
        },
        timeout: Number(process.env.PYWHATKIT_TIMEOUT_MS || 120000),
        windowsHide: true,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        const output = String(stdout || '').trim();
        const errorOutput = String(stderr || '').trim();

        if (error) {
          if (output) {
            try {
              return resolve(JSON.parse(output));
            } catch (parseError) {
              return reject(new Error(output));
            }
          }

          return reject(new Error(errorOutput || error.message || 'Error ejecutando PyWhatKit'));
        }

        if (!output) {
          return reject(new Error(errorOutput || 'PyWhatKit no devolvio respuesta'));
        }

        try {
          resolve(JSON.parse(output));
        } catch (parseError) {
          reject(new Error(output));
        }
      }
    );
  });
}

async function sendPyWhatKitWhatsappReminder(patient, message) {
  try {
    const outcome = await runPyWhatKit(patient.phone, message.text.slice(0, 1024));
    return {
      status: outcome.status || 'failed',
      provider: outcome.provider || 'pywhatkit-whatsapp',
      recipient: outcome.recipient || patient.phone,
      message_body: outcome.message_body || message.text,
      error_message: outcome.error_message || ''
    };
  } catch (error) {
    return {
      status: 'failed',
      provider: 'pywhatkit-whatsapp',
      error_message: error.message || 'Error ejecutando PyWhatKit'
    };
  }
}

async function sendWhatsappReminder(patient, item, scheduledAt) {
  const message = buildReminderMessage(patient, item, scheduledAt);

  if (!patient.phone) {
    return { status: 'skipped', provider: 'whatsapp', error_message: 'Paciente sin telefono configurado' };
  }

  return sendPyWhatKitWhatsappReminder(patient, message);
}

async function sendReminderNotification(patient, item, scheduledAt) {
  const channel = patient.reminder_channel || 'email';

  if (!patient.reminder_opt_in || channel === 'none') {
    return { status: 'skipped', provider: channel, error_message: 'Recordatorios desactivados para el paciente' };
  }

  if (channel === 'sms') {
    return sendSMSReminder(patient, item, scheduledAt);
  }
  if (channel === 'whatsapp') {
    return sendWhatsappReminder(patient, item, scheduledAt);
  }

  return sendEmailReminder(patient, item, scheduledAt);
}

module.exports = {
  sendReminderNotification,
  sendSMSReminder,
  sendWhatsappReminder
};
