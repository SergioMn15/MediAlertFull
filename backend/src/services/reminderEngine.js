function normalizeTimeString(timeValue) {
  const raw = String(timeValue || '').slice(0, 8);
  return raw.length === 5 ? `${raw}:00` : (raw || '08:00:00');
}

function parseFrequencyToInterval(frequency) {
  const match = String(frequency || '').match(/cada\s+(\d+)\s+hora/i);
  if (!match) {
    return null;
  }

  const interval = Number(match[1]);
  return Number.isFinite(interval) && interval > 0 ? interval : null;
}

function resolveIntervalHours(item) {
  const explicit = Number(item?.interval_hours);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  return parseFrequencyToInterval(item?.frequency) || 24;
}

function getDurationDays(item) {
  const duration = Number(item?.duration_days);
  return Number.isFinite(duration) && duration > 0 ? duration : 30;
}

function formatLocalDate(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildBaseDateTime(prescriptionIssuedAt, timeValue) {
  const issuedAt = prescriptionIssuedAt ? new Date(prescriptionIssuedAt) : new Date();
  const datePart = formatLocalDate(issuedAt);
  return new Date(`${datePart}T${normalizeTimeString(timeValue)}`);
}

function getReminderWindowEnd(baseDateTime, durationDays) {
  return new Date(baseDateTime.getTime() + (durationDays * 24 * 60 * 60 * 1000));
}

function getLatestDueReminderAt(item, prescriptionIssuedAt, now = new Date()) {
  const baseDateTime = buildBaseDateTime(prescriptionIssuedAt, item.time);
  if (now < baseDateTime) {
    return null;
  }

  const intervalHours = resolveIntervalHours(item);
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const elapsedMs = now.getTime() - baseDateTime.getTime();
  const slotIndex = Math.floor(elapsedMs / intervalMs);
  const candidate = new Date(baseDateTime.getTime() + (slotIndex * intervalMs));
  const windowEnd = getReminderWindowEnd(baseDateTime, getDurationDays(item));

  return candidate <= windowEnd ? candidate : null;
}

function getNextReminderAt(item, prescriptionIssuedAt, now = new Date()) {
  const baseDateTime = buildBaseDateTime(prescriptionIssuedAt, item.time);
  const intervalHours = resolveIntervalHours(item);
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const windowEnd = getReminderWindowEnd(baseDateTime, getDurationDays(item));

  let candidate = baseDateTime;
  if (now > baseDateTime) {
    const elapsedMs = now.getTime() - baseDateTime.getTime();
    const slotIndex = Math.ceil(elapsedMs / intervalMs);
    candidate = new Date(baseDateTime.getTime() + (slotIndex * intervalMs));
  }

  return candidate <= windowEnd ? candidate : null;
}

function buildUpcomingReminders(activePrescription, now = new Date(), limit = 6) {
if (!activePrescription?.items?.length) {
    return [];
  }

  // Filtrar por estatus de receta Y items no pausados
  if (activePrescription.status !== 'active') {
    return [];
  }
  const activeItems = activePrescription.items.filter(item => !(item.notifications_paused ?? false));

  const reminders = [];
  activeItems.forEach((item) => {
    const intervalMs = resolveIntervalHours(item) * 60 * 60 * 1000;
    let candidate = getNextReminderAt(item, activePrescription.issued_at, now);
    const windowEnd = candidate
      ? getReminderWindowEnd(buildBaseDateTime(activePrescription.issued_at, item.time), getDurationDays(item))
      : null;

    for (let count = 0; candidate && windowEnd && count < 3 && candidate <= windowEnd; count += 1) {
      reminders.push({
        item_id: item.id,
        prescription_id: activePrescription.id,
        name: item.name,
        dose_mg: item.dose_mg,
        emoji: item.emoji || '💊',
        frequency: item.frequency || `Cada ${resolveIntervalHours(item)} horas`,
        interval_hours: resolveIntervalHours(item),
        scheduled_at: candidate.toISOString(),
        notes: item.notes || '',
        channel_hint: null
      });

      candidate = new Date(candidate.getTime() + intervalMs);
    }
  });

  return reminders
    .sort((left, right) => new Date(left.scheduled_at) - new Date(right.scheduled_at))
    .slice(0, limit);
}

function buildReminderMessage(patient, item, scheduledAt) {
  const timeLabel = new Date(scheduledAt).toLocaleString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short'
  });

  return {
    subject: `Recordatorio de medicamento: ${item.name}`,
    text: `Hola ${patient.name}. Es momento de tomar ${item.name} ${item.dose_mg} mg. Horario: ${timeLabel}. Indicaciones: ${item.notes || 'Seguir la receta medica.'}`,
    html: `<p>Hola ${patient.name}.</p><p>Es momento de tomar <strong>${item.name}</strong> (${item.dose_mg} mg).</p><p>Horario: <strong>${timeLabel}</strong></p><p>${item.notes || 'Seguir la receta medica.'}</p>`
  };
}

module.exports = {
  buildBaseDateTime,
  buildReminderMessage,
  buildUpcomingReminders,
  getDurationDays,
  getLatestDueReminderAt,
  getNextReminderAt,
  formatLocalDate,
  normalizeTimeString,
  parseFrequencyToInterval,
  resolveIntervalHours
};
