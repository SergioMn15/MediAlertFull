$patientJs = 'c:\MediAlertV3\frontend\js\patient.js'
$doctorJs  = 'c:\MediAlertV3\frontend\js\doctor-dashboard.js'

# ── patient.js ──────────────────────────────────────────────────────────────
$p = [System.IO.File]::ReadAllText($patientJs, [System.Text.Encoding]::UTF8)

# Fix broken reminder section – replace the three broken functions in one block
$oldBlock = @"
    try {
      const data = await window.MediAlertAPI.getReminderOverview(curp);
      renderReminderStats(data.stats || {});
      renderReminderList(data.upcoming || []);
      renderReminderHistory(data.history || []);
    } catch (error) {
      reminderList.innerHTML = emptyState(error.message || 'No se pudieron cargar los recordatorios autom?ticos.');
      renderReminderHistory([]);
    }
  }

  function bindReminderActions() {
    return;
  }
"@

$newBlock = @"
    try {
      const data = await window.MediAlertAPI.getReminderOverview(curp);
      renderReminderStats(data.stats || {});
      renderReminderList(data.upcoming || [], curp);
      renderReminderHistory(data.history || []);
    } catch (error) {
      reminderList.innerHTML = emptyState(error.message || 'No se pudieron cargar los recordatorios automaticos.');
      renderReminderHistory([]);
    }
  }

  function bindReminderActions(patient) {
    const reminderList = document.getElementById('today-medications-list');
    if (!reminderList || reminderList.dataset.bound === 'true') {
      return;
    }

    reminderList.dataset.bound = 'true';
    reminderList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-reminder-action]');
      if (!button || button.disabled) {
        return;
      }

      const action = button.dataset.reminderAction;
      const itemId = button.dataset.itemId;
      const curp = patient && patient.curp;

      if (!action || !itemId || !curp) {
        return;
      }

      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = '...';

      try {
        await window.MediAlertAPI.recordMedicationTake(curp, Number(itemId), action);
        const messages = { taken: 'Marcado como tomado', skipped: 'Toma omitida', snoozed: 'Pospuesto 30 min' };
        window.MediAlertMain.showToast(messages[action] || 'Actualizado', 'success');
        await loadTodayReminders(curp);
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  }
"@

$p = $p.Replace($oldBlock, $newBlock)

# Fix renderReminderList – replace broken inner content + add action buttons
$oldList = @"
  function renderReminderList(reminders) {
    const reminderList = document.getElementById('today-medications-list');
    if (!reminderList) {
      return;
    }

    reminderList.innerHTML = reminders.length
      ? reminders.map((reminder) => ``
          <article class="med-card">
            <div>
              <strong>`${escapeHtml(reminder.emoji || '??')} `${escapeHtml(reminder.name)}</strong>
              <div class="med-meta">`${reminder.dose_mg} mg ? cada `${reminder.interval_hours || 24} horas</div>
              <p>Pr?ximo aviso: `${formatDateTime(reminder.scheduled_at)}</p>
              <p>`${escapeHtml(reminder.notes || 'Sin indicaciones adicionales')}</p>
            </div>
            <span class="status-badge scheduled">`${escapeHtml(reminder.channel_hint || 'email')}</span>
          </article>
        ``).join('')
      : emptyState('Aun no hay avisos programados.');
  }
"@

$newList = @"
  function renderReminderList(reminders, curp) {
    const reminderList = document.getElementById('today-medications-list');
    if (!reminderList) {
      return;
    }

    reminderList.dataset.bound = '';
    reminderList.innerHTML = reminders.length
      ? reminders.map((reminder) => ``
          <article class="med-card">
            <div>
              <strong>`${escapeHtml(reminder.emoji || '💊')} `${escapeHtml(reminder.name)}</strong>
              <div class="med-meta">`${reminder.dose_mg} mg &middot; cada `${reminder.interval_hours || 24} horas</div>
              <p>Proximo aviso: `${formatDateTime(reminder.scheduled_at)}</p>
              <p>`${escapeHtml(reminder.notes || 'Sin indicaciones adicionales')}</p>
            </div>
            <div class="reminder-actions">
              <span class="status-badge scheduled">`${escapeHtml(reminder.channel_hint || 'email')}</span>
              <button class="btn btn-primary btn-small" type="button" data-reminder-action="taken" data-item-id="`${reminder.item_id}">Tomar</button>
              <button class="btn btn-secondary btn-small" type="button" data-reminder-action="snoozed" data-item-id="`${reminder.item_id}">Posponer</button>
              <button class="btn btn-secondary btn-small" type="button" data-reminder-action="skipped" data-item-id="`${reminder.item_id}">Omitir</button>
            </div>
          </article>
        ``).join('')
      : emptyState('Aun no hay avisos programados.');

    if (curp && currentPatient) {
      bindReminderActions(currentPatient);
    }
  }
"@

$p = $p.Replace($oldList, $newList)

# Fix renderReminderHistory broken middle-dot
$p = $p.Replace('scheduled_for)} ? ${escapeHtml(formatNotificationStatus', 'scheduled_for)} &middot; ${escapeHtml(formatNotificationStatus')

[System.IO.File]::WriteAllText($patientJs, $p, [System.Text.Encoding]::UTF8)
Write-Host "patient.js done"

# ── doctor-dashboard.js ──────────────────────────────────────────────────────
$d = [System.IO.File]::ReadAllText($doctorJs, [System.Text.Encoding]::UTF8)

$d = $d.Replace("|| '??'", "|| '💊'")
$d = $d.Replace('mg ? ${escapeHtml(medication.frequency', 'mg &middot; ${escapeHtml(medication.frequency')
$d = $d.Replace('${genderLabel} ? ${stateLabel}', '${genderLabel} &middot; ${stateLabel}')
$d = $d.Replace("? reciente`", "&middot; reciente`")

[System.IO.File]::WriteAllText($doctorJs, $d, [System.Text.Encoding]::UTF8)
Write-Host "doctor-dashboard.js done"
