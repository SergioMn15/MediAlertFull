const { query } = require('../config/db');
const { getLatestDueReminderAt } = require('./reminderEngine');
const { sendReminderNotification } = require('./notifier');

async function hasLoggedScheduledReminderDb(prescriptionItemId, scheduledAt) {
  const result = await query(
    'SELECT id FROM notification_logs WHERE prescription_item_id = $1 AND scheduled_for = $2 LIMIT 1',
    [prescriptionItemId, scheduledAt]
  );
  return result.rows.length > 0;
}

async function logReminderDb(patientId, item, scheduledAt, outcome, patientChannel) {
  const isWhatsappProvider = String(outcome.provider || '').includes('whatsapp');
  const channel = patientChannel || (isWhatsappProvider ? 'whatsapp' : 'email');
  await query(
    `INSERT INTO notification_logs
      (patient_id, prescription_item_id, channel, recipient, scheduled_for, sent_at, status, provider, error_message, message_body)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, $8, $9)`,
    [
      patientId,
      item.id,
      channel,
      outcome.recipient || '',
      scheduledAt,
      outcome.status,
      outcome.provider || 'unknown',
      outcome.error_message || '',
      outcome.message_body || ''
    ]
  );
}

function hasLoggedScheduledReminderDemo(logs, itemId, scheduledAt) {
  return logs.some((log) => log.prescription_item_id === itemId && String(log.scheduled_for) === String(scheduledAt));
}

function logReminderDemo(logs, patientId, item, scheduledAt, outcome, patientChannel) {
  const isWhatsappProvider = String(outcome.provider || '').includes('whatsapp');
  const channel = patientChannel || (isWhatsappProvider ? 'whatsapp' : 'email');
  logs.push({
    id: logs.length + 1,
    patient_id: patientId,
    prescription_item_id: item.id,
    channel,
    recipient: outcome.recipient || '',
    scheduled_for: scheduledAt,
    sent_at: new Date().toISOString(),
    status: outcome.status,
    provider: outcome.provider || 'unknown',
    error_message: outcome.error_message || '',
    message_body: outcome.message_body || ''
  });
}

async function processDatabaseReminders(app) {
  try {
    const result = await query(`
      SELECT pr.id AS prescription_id, pr.issued_at,
             pi.id, pi.name AS medication_name, pi.dose_mg, pi.frequency, pi.time, pi.duration_days, pi.interval_hours, pi.notes, pi.emoji,
             p.id AS patient_id, p.name, p.email, p.phone, p.reminder_channel, p.reminder_opt_in
      FROM prescriptions pr
      JOIN patients p ON p.id = pr.patient_id
      JOIN prescription_items pi ON pi.prescription_id = pr.id
      WHERE pr.status = 'active' 
      AND (pi.notifications_paused IS NULL OR pi.notifications_paused = false)
    `);

    const now = new Date();
    for (const row of result.rows) {
      const item = {
        id: row.id,
        name: row.medication_name,
        dose_mg: row.dose_mg,
        frequency: row.frequency,
        time: row.time,
        duration_days: row.duration_days,
        interval_hours: row.interval_hours,
        notes: row.notes,
        emoji: row.emoji || '💊'
      };

      const scheduledAt = getLatestDueReminderAt(item, row.issued_at, now);
      if (!scheduledAt) continue;

      const alreadyLogged = await hasLoggedScheduledReminderDb(row.id, scheduledAt);
      if (alreadyLogged) continue;

      const patient = {
        id: row.patient_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        reminder_channel: row.reminder_channel,
        reminder_opt_in: row.reminder_opt_in
      };

      const outcome = await sendReminderNotification(patient, item, scheduledAt);

      if (outcome.status !== 'skipped') {
        console.log(`[Reminder] ${row.name} - ${item.name} → ${outcome.status}`);
      }

      await logReminderDb(row.patient_id, item, scheduledAt, outcome, row.reminder_channel);
    }
  } catch (error) {
    console.error('Scheduler DB error (continuando):', error.message);
  }
}

async function processDemoReminders(app) {
  const demo = app.get('demoData') || {};
  const patients = Object.values(demo.patients || {});
  const now = new Date();

  for (const patient of patients) {
    const prescriptions = demo.prescriptions?.[patient.id] || [];
    const activePrescription = prescriptions.find((item) => item.status === 'active') || null;
    if (!activePrescription) continue;

    if (!demo.notificationLogs[patient.id]) demo.notificationLogs[patient.id] = [];

    for (const item of activePrescription.items || []) {
      if (item.notifications_paused) continue;
      
      const scheduledAt = getLatestDueReminderAt(item, activePrescription.issued_at, now);
      if (!scheduledAt) continue;

      if (hasLoggedScheduledReminderDemo(demo.notificationLogs[patient.id], item.id, scheduledAt.toISOString())) continue;

      const outcome = await sendReminderNotification(patient, item, scheduledAt);
      logReminderDemo(demo.notificationLogs[patient.id], patient.id, item, scheduledAt.toISOString(), outcome, patient.reminder_channel);
    }
  }
}

function startReminderScheduler(app) {
  if (app.get('reminderSchedulerStarted')) return;

  const isEnabled = process.env.REMINDER_SCHEDULER_ENABLED === 'true';
  if (!isEnabled) {
    console.log('✅ Scheduler desactivado (usa REMINDER_SCHEDULER_ENABLED=true)');
    app.set('reminderSchedulerStarted', true);
    return;
  }

  const intervalMs = Number(process.env.REMINDER_INTERVAL_MS || 30000); // 30s
  let isRunning = false;

  const runTick = async () => {
    if (isRunning) return;
    isRunning = true;
    
    try {
      if (app.get('useDatabase')) {
        await processDatabaseReminders(app);
      } else {
        await processDemoReminders(app);
      }
    } catch (error) {
      console.error('Scheduler error (continuando):', error.message);
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(runTick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  app.set('reminderSchedulerStarted', true);
  console.log('✅ Scheduler activo cada 30s');
  runTick();
}

module.exports = {
  startReminderScheduler
};
