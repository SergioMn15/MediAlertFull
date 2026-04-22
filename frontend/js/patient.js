(function () {
  let currentPatient = null;
  let selectedPrescriptionId = null;
  let currentReminder = null;

async function initPatientPage() {
    const app = window.MediAlertMain;
    if (!window.location.pathname.includes('/patient/')) {
      return;
    }
    if (!app?.state?.user) {
      app?.logout(false);
      return;
    }

    if (!app.requireRole('patient')) {
      return;
    }

    try {
      const response = await window.MediAlertAPI.getPatientData(app.state.user.curp);
      const patient = response.patient;
      currentPatient = patient;
      selectedPrescriptionId = patient.active_prescription?.id || patient.prescriptions_history?.[0]?.id || null;

      renderSidebar(patient);
      renderDashboard(patient);
      renderRecipeHistory(patient);
      renderSelectedRecipe(patient);
      renderProfile(patient);
      bindAppointmentForm(patient);
      bindRecipeHistory();
      bindRecipePrint();
      bindReminderActions(patient);
      bindRecetasPage(); // Nueva logica /recetas.html
      bindRecipeRequestForm(); // Nueva /recipe.html solo request
      await loadTodayReminders(patient.curp);
    } catch (error) {
      app.showToast(error.message, 'error');
    }
  }

  function bindRecetasPage() {
    if (!window.location.pathname.includes('recetas.html')) return;

    const container = document.getElementById('recipe-list-container');
    const stats = {
      total: document.getElementById('total-recipes-stat'),
      active: document.getElementById('active-recipes-stat'),
      meds: document.getElementById('active-meds-stat'),
    };
    const searchInput = document.getElementById('recipe-search');
    const statusFilter = document.getElementById('recipe-status-filter');
    const detailModal = document.getElementById('recipe-detail-modal');
    const modalTitle = document.getElementById('recipe-detail-title');
    const modalBody = document.getElementById('recipe-detail-body');
    const closeModalBtn = document.querySelector('#recipe-detail-modal .close-modal');

    if (!container) return;

    async function loadRecetas(search = '', status = '') {
      container.innerHTML = '<div class="loading">Cargando recetas...</div>';
      try {
        const prescriptions = await window.MediAlertAPI.getPatientPrescriptions(currentPatient.curp);
        renderRecetasList(prescriptions.prescriptions.filter(p => !p.deleted_at), search, status);
        updateRecetasStats(prescriptions.prescriptions);
      } catch (error) {
        container.innerHTML = `<div class="empty-state">${error.message || 'No se pudieron cargar las recetas'}</div>`;
      }
    }

    function renderRecetasList(recetas, search, status) {
      let filtered = recetas.slice();
      if (search) {
        filtered = filtered.filter(r => 
          r.id.toString().includes(search) || 
          (r.diagnosis || '').toLowerCase().includes(search.toLowerCase())
        );
      }
      if (status) {
        filtered = filtered.filter(r => r.status === status);
      }

      container.innerHTML = filtered.length
        ? filtered.map(recipe => `
            <article class="recipe-card" data-recipe-id="${recipe.id}">
              <div class="content-header">
                <div>
                  <strong>Receta #${recipe.id}</strong>
                  <div class="recipe-meta">${formatDateTime(recipe.issued_at)}</div>
                  ${recipe.doctor_name ? `<p>Doctor: ${escapeHtml(recipe.doctor_name)}</p>` : ''}
                </div>
                <span class="status-badge ${recipe.status === 'active' ? 'scheduled' : 'pending'}">
                  ${recipe.status === 'active' ? 'Activa' : recipe.status.charAt(0).toUpperCase() + recipe.status.slice(1)}
                </span>
              </div>
              <div class="recipe-body">
                ${recipe.diagnosis ? `<p><strong>Diagnóstico:</strong> ${escapeHtml(recipe.diagnosis)}</p>` : ''}
                ${recipe.general_instructions ? `<p><strong>Indicaciones:</strong> ${escapeHtml(recipe.general_instructions)}</p>` : ''}
                <p>${recipe.items?.length || 0} medicamentos</p>
              </div>
              <button class="btn btn-primary" onclick="openRecipeDetail(${recipe.id})">
                Ver detalle
              </button>
            </article>
          `).join('')
        : '<div class="empty-state">No hay recetas que coincidan con tu busqueda.</div>';
    }

    function updateRecetasStats(recetas) {
      if (stats.total) stats.total.textContent = recetas.length;
      if (stats.active) stats.active.textContent = recetas.filter(r => r.status === 'active').length;
      const activeMeds = recetas.filter(r => r.status === 'active').reduce((sum, r) => sum + (r.items?.length || 0), 0);
      if (stats.meds) stats.meds.textContent = activeMeds;
    }

    function bindSearchFilter() {
      let timeout;
      searchInput?.addEventListener('input', e => {
        clearTimeout(timeout);
        timeout = setTimeout(() => loadRecetas(e.target.value, statusFilter?.value), 300);
      });
      statusFilter?.addEventListener('change', e => loadRecetas(searchInput?.value || '', e.target.value));
    }

    bindSearchFilter();
    loadRecetas();

    // Modal detail
    window.openRecipeDetail = async (recipeId) => {
      try {
        const response = await window.MediAlertAPI.getPatientData(currentPatient.curp);
        const recipe = response.patient.prescriptions_history.find(r => r.id == recipeId);
        if (!recipe) throw new Error('Receta no encontrada');
        
        modalTitle.textContent = `Receta #${recipe.id}`;
        modalBody.innerHTML = `
          <div class="recipe-detail-header">
            <div class="recipe-doctor-info">
              <strong>${escapeHtml(recipe.doctor_name || 'Doctor')}</strong>
              <p>${formatDateTime(recipe.issued_at)}</p>
              <span class="status-badge ${recipe.status === 'active' ? 'scheduled' : 'pending'}">${recipe.status}</span>
            </div>
          </div>
          ${recipe.diagnosis ? `<p><strong>Diagnóstico:</strong> ${escapeHtml(recipe.diagnosis)}</p>` : ''}
          ${recipe.general_instructions ? `<p><strong>Indicaciones:</strong> ${escapeHtml(recipe.general_instructions)}</p>` : ''}
          <div class="medications-grid">
            ${recipe.items?.map(item => `
              <article class="med-card">
                <div>
                  <strong>${escapeHtml(item.emoji || '💊')} ${escapeHtml(item.name)}</strong>
                  <div class="med-meta">${item.dose_mg}mg · ${formatTime(item.time)}</div>
                  <p>${escapeHtml(item.notes || 'Sin notas')}</p>
                  ${item.notifications_paused ? '<span class="status-badge paused">Notificaciones pausadas</span>' : ''}
                </div>
              </article>
            `).join('') || '<div class="empty-state">Sin medicamentos en esta receta</div>'}
          </div>
        `;
        detailModal.style.display = 'block';
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
      }
    };

    closeModalBtn?.addEventListener('click', () => detailModal.style.display = 'none');
    detailModal.addEventListener('click', e => {
      if (e.target === detailModal) detailModal.style.display = 'none';
    });

    document.getElementById('download-recipe-pdf')?.addEventListener('click', () => {
      window.MediAlertMain.showToast('Descarga PDF próximamente disponible', 'info');
    });
  }

  function bindRecipeRequestForm() {
    if (!window.location.pathname.includes('recipe.html')) return;

    const form = document.getElementById('recipe-request-form') || document.querySelector('form');
    if (!form || form.dataset.bound === 'true') return;

    form.dataset.bound = 'true';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const symptoms = document.getElementById('symptoms-input')?.value.trim() || '';
      const notes = document.getElementById('notes-input')?.value.trim() || '';
      const result = document.getElementById('recipe-request-result');

      if (!symptoms && !notes) {
        if (result) result.textContent = 'Describe tus síntomas o el motivo de la nueva receta.';
        return;
      }

      try {
        await window.MediAlertAPI.requestNewPrescription(currentPatient.curp, { symptoms, notes });
        if (result) {
          result.textContent = 'Solicitud enviada al doctor. Te notificaremos pronto.';
          result.className = 'form-message success';
        }
        window.MediAlertMain.showToast('Solicitud de receta enviada', 'success');
        form.reset();
      } catch (error) {
        if (result) result.textContent = error.message;
        window.MediAlertMain.showToast(error.message, 'error');
      }
    });
  }

  function renderSidebar(patient) {
    setText('patient-name', patient.name);
    setText('patient-curp', patient.curp);
  }

  function renderDashboard(patient) {
    const medications = patient.medications || [];
    const appointments = patient.appointments || [];
    const requests = patient.appointment_requests || [];
    const activePrescription = patient.active_prescription;
    const nextMedication = medications[0];
    const nextAppointment = appointments
      .slice()
      .sort((left, right) => new Date(`${left.date}T${left.time}`) - new Date(`${right.date}T${right.time}`))[0];

    setText('patient-welcome', patient.name);
    setText('stat-medications', String(medications.length));
    setText('stat-appointments', String(appointments.length));
    setText('stat-next-dose', nextMedication ? formatTime(nextMedication.time) : 'Sin horario');

    const nextMedicationCard = document.getElementById('next-medication-card');
    if (nextMedicationCard) {
      nextMedicationCard.innerHTML = nextMedication
        ? `
          <div>
            <strong>${nextMedication.emoji || '💊'} ${escapeHtml(nextMedication.name)}</strong>
            <div class="med-meta">${nextMedication.dose_mg} mg a las ${formatTime(nextMedication.time)}</div>
            <p>${escapeHtml(nextMedication.notes || 'Sin observaciones.')}</p>
            ${nextMedication.frequency ? `<p><strong>Frecuencia:</strong> ${escapeHtml(nextMedication.frequency)}</p>` : ''}
          </div>
          <span class="status-badge scheduled">Activa</span>
        `
        : emptyState('No hay medicamentos asignados');
    }

    const nextAppointmentCard = document.getElementById('next-appointment-card');
    if (nextAppointmentCard) {
      nextAppointmentCard.innerHTML = nextAppointment
        ? `
          <div>
            <strong>Proxima consulta</strong>
            <div class="appointment-meta">${formatDate(nextAppointment.date)} a las ${formatTime(nextAppointment.time)}</div>
          </div>
          <span class="status-badge scheduled">${escapeHtml(nextAppointment.status || 'scheduled')}</span>
        `
        : emptyState('No hay citas registradas');
    }

    const recentList = document.getElementById('recent-medications');
    if (recentList) {
      recentList.innerHTML = medications.length
        ? medications.map((medication) => `
            <article class="med-card">
              <div>
                <strong>${medication.emoji || '💊'} ${escapeHtml(medication.name)}</strong>
                <div class="med-meta">${medication.dose_mg} mg · ${formatTime(medication.time)}</div>
                <p>${escapeHtml(medication.notes || 'Sin notas')}</p>
              </div>
            </article>
          `).join('')
        : emptyState('Aun no tienes receta activa');
    }

    const appointmentList = document.getElementById('appointment-list');
    if (appointmentList) {
      appointmentList.innerHTML = appointments.length
        ? appointments.map((item) => `
            <article class="appointment-card">
              <div>
                <strong>${formatDate(item.date)}</strong>
                <div class="appointment-meta">${formatTime(item.time)}</div>
              </div>
              <span class="status-badge scheduled">${escapeHtml(item.status || 'scheduled')}</span>
            </article>
          `).join('')
        : emptyState('Sin citas pendientes');
    }

    const requestList = document.getElementById('appointment-request-list');
    if (requestList) {
      requestList.innerHTML = requests.length
        ? requests.map((item) => `
            <article class="appointment-card">
              <div>
                <strong>${formatDate(item.requested_date)}</strong>
                <div class="appointment-meta">${formatTime(item.requested_time)} · ${formatRequestStatus(item.status)}</div>
                <p>${escapeHtml(item.reason || 'Sin motivo especificado')}</p>
                ${item.doctor_response ? `<p><strong>Respuesta:</strong> ${escapeHtml(item.doctor_response)}</p>` : ''}
              </div>
              <span class="status-badge ${item.status || 'pending'}">${formatRequestStatus(item.status)}</span>
            </article>
          `).join('')
        : emptyState('Aun no has enviado solicitudes de cita');
    }
  }

  function renderRecipeHistory(patient) {
    const historyList = document.getElementById('recipe-history-list');
    if (!historyList) {
      return;
    }

    const history = patient.prescriptions_history || [];
    historyList.innerHTML = history.length
      ? history.map((prescription) => `
          <button class="recipe-history-card ${prescription.id === selectedPrescriptionId ? 'active' : ''}" type="button" data-prescription-id="${prescription.id}">
            <div>
              <strong>Receta #${prescription.id}</strong>
              <div class="med-meta">${formatDateTime(prescription.issued_at)} · ${escapeHtml(prescription.doctor_name || 'Doctor tratante')}</div>
              <p><strong>Diagnostico:</strong> ${escapeHtml(prescription.diagnosis || 'Sin diagnostico')}</p>
              <p>${prescription.items?.length || 0} medicamento(s)</p>
            </div>
            <span class="status-badge ${prescription.status === 'active' ? 'scheduled' : 'pending'}">${prescription.status === 'active' ? 'Activa' : 'Anterior'}</span>
          </button>
        `).join('')
      : emptyState('Aun no tienes historial de recetas.');
  }

  function renderSelectedRecipe(patient) {
    const history = patient.prescriptions_history || [];
    const selectedPrescription = history.find((prescription) => prescription.id === selectedPrescriptionId)
      || patient.active_prescription
      || history[0]
      || null;

    const title = document.getElementById('recipe-title');
    const doctor = document.getElementById('recipe-doctor');
    const date = document.getElementById('recipe-date');
    const diagnosis = document.getElementById('recipe-diagnosis');
    const instructions = document.getElementById('recipe-instructions');
    const list = document.getElementById('medication-list');

    if (title) {
      title.textContent = selectedPrescription ? `Receta #${selectedPrescription.id}` : 'Selecciona una receta';
    }

    if (doctor) {
      doctor.textContent = `Doctor: ${selectedPrescription?.doctor_name || 'Sin asignar'}`;
    }

    if (date) {
      date.textContent = `Fecha de receta: ${selectedPrescription?.issued_at ? formatDateTime(selectedPrescription.issued_at) : 'Sin fecha'}`;
    }

    if (diagnosis) {
      diagnosis.textContent = `Diagnostico: ${selectedPrescription?.diagnosis || 'Sin diagnostico capturado'}`;
    }

    if (instructions) {
      instructions.textContent = `Indicaciones: ${selectedPrescription?.general_instructions || 'Sin indicaciones generales'}`;
    }

    if (!list) {
      return;
    }

    if (!selectedPrescription) {
      list.innerHTML = emptyState('Selecciona una receta del historial para ver el desglose.');
      return;
    }

    const items = selectedPrescription?.items || [];
    list.innerHTML = items.length
      ? items.map((medication) => `
          <article class="med-card">
            <div>
              <strong>${escapeHtml(medication.name)}</strong>
              <div class="med-meta">${medication.dose_mg} mg · ${escapeHtml(medication.frequency || 'Frecuencia por definir')} · ${formatTime(medication.time)}</div>
              <p>${escapeHtml(medication.notes || 'Sin observaciones')}</p>
            </div>
            <div class="med-actions">
              <button class="btn btn-sm ${medication.notifications_paused ? 'btn-success' : 'btn-danger'}" data-action="pause" data-item-id="${medication.id}" data-prescription-id="${selectedPrescriptionId}">
                ${medication.notifications_paused ? 'Activar' : 'Pausar'} notifs
              </button>
            </div>
            <span class="status-badge ${medication.notifications_paused ? 'paused' : 'scheduled'}">${medication.notifications_paused ? 'Pausado' : (medication.duration_days ? `${medication.duration_days} dias` : 'Activa')}</span>
          </article>
        `).join('')
      : emptyState('Esta receta no tiene medicamentos capturados.');

  }

  function bindRecipeHistory() {
    const historyList = document.getElementById('recipe-history-list');
    if (!historyList || historyList.dataset.bound === 'true') {
      return;
    }

    historyList.dataset.bound = 'true';
    historyList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-prescription-id]');
      if (!button || !currentPatient) {
        return;
      }

      selectedPrescriptionId = Number(button.dataset.prescriptionId);
      renderRecipeHistory(currentPatient);
      renderSelectedRecipe(currentPatient);
    });
  }

  function handlePrintRecipe() {
    window.print();
  }

  function bindRecipePrint() {
    const button = document.getElementById('download-pdf');
    if (!button || button.dataset.bound === 'true') {
      return;
    }

    button.dataset.bound = 'true';
    button.addEventListener('click', handlePrintRecipe);
  }

  function renderProfile(patient) {
    setText('profile-name', patient.name || 'Paciente');
    setText('profile-curp', patient.curp || 'Sin CURP');

    const createdAt = document.getElementById('profile-created-at');
    if (createdAt) {
      createdAt.textContent = patient.created_at
        ? `Registro en sistema: ${formatDateTime(patient.created_at)}`
        : 'Registro en sistema disponible';
    }
  }

  function bindAppointmentForm(patient) {
    const form = document.getElementById('appointment-form');
    if (!form || form.dataset.bound === 'true') {
      return;
    }

    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const date = document.getElementById('appointment-date').value;
      const time = document.getElementById('appointment-time').value;
      const reason = document.getElementById('appointment-reason')?.value.trim() || '';

      try {
        await window.MediAlertAPI.requestAppointment(patient.curp, date, time, reason);
        window.MediAlertMain.showToast('Solicitud de cita enviada', 'success');
        window.location.reload();
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
      }
    });
  }

  async function loadTodayReminders(curp) {
    const reminderList = document.getElementById('today-medications-list');
    if (!reminderList) {
      return;
    }

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
      const button = event.target.closest('[data-action][data-item-id]');
      if (!button || !patient?.curp) {
        return;
      }

      const action = button.dataset.action;
      const itemId = Number(button.dataset.itemId);
      button.disabled = true;
      const wasPaused = button.textContent.includes('Activar');

      try {
        if (action === 'pause') {
          await window.MediAlertAPI.pauseMedication(patient.curp, itemId);
          window.MediAlertMain.showToast(wasPaused ? 'Notificaciones activadas' : 'Notificaciones pausadas', 'success');
        } else {
          await window.MediAlertAPI.recordMedicationTake(patient.curp, itemId, action);
          const labels = { take: 'Toma registrada', skip: 'Dosis omitida', snooze: 'Recordatorio pospuesto 30 min' };
          window.MediAlertMain.showToast(labels[action] || 'Accion registrada', 'success');
        }
        await loadTodayReminders(patient.curp);
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
        button.disabled = false;
      }
    });
  }

  function renderReminderStats(stats) {
    setText('today-adherence', String(stats.sent_today || 0));
    setText('today-meds', String(stats.active_medications || 0));
    setText('next-dose', stats.next_reminder ? formatDateTime(stats.next_reminder) : '--:--');
    const count = document.getElementById('today-takes-count');
    if (count) {
      count.textContent = `(${stats.active_medications || 0})`;
    }
  }

  function renderReminderList(reminders, curp) {
    const reminderList = document.getElementById('today-medications-list');
    if (!reminderList) {
      return;
    }

    reminderList.innerHTML = reminders.length
      ? reminders.map((reminder) => `
          <article class="med-card">
            <div>
              <strong>${escapeHtml(reminder.emoji || '💊')} ${escapeHtml(reminder.name)}</strong>
              <div class="med-meta">${reminder.dose_mg} mg · cada ${reminder.interval_hours || 24} horas</div>
              <p>Próximo aviso: ${formatDateTime(reminder.scheduled_at)}</p>
              <p>${escapeHtml(reminder.notes || 'Sin indicaciones adicionales')}</p>
            </div>
            <div class="med-actions">
              <button class="btn btn-sm btn-success" data-action="take" data-item-id="${reminder.item_id}">Tomar</button>
              <button class="btn btn-sm btn-warning" data-action="snooze" data-item-id="${reminder.item_id}">Posponer</button>
              <button class="btn btn-sm btn-secondary" data-action="skip" data-item-id="${reminder.item_id}">Omitir</button>
              <button class="btn btn-sm ${reminder.notifications_paused ? 'btn-success' : 'btn-danger'}" data-action="pause" data-item-id="${reminder.item_id}">
                ${reminder.notifications_paused ? 'Activar' : 'Pausar'} notifs ⏸️
              </button>
            </div>
          </article>
        `).join('')
      : emptyState('Aún no hay avisos programados.');
  }

  function renderReminderHistory(history) {
    const historyList = document.getElementById('taken-history');
    if (!historyList) {
      return;
    }

    const count = document.getElementById('taken-count');
    if (count) {
      count.textContent = `(${history.length})`;
    }

    historyList.innerHTML = history.length
      ? history.map((item) => `
          <article class="appointment-card">
            <div>
              <strong>${escapeHtml(item.provider || 'scheduler')}</strong>
              <div class="appointment-meta">${formatDateTime(item.scheduled_for)} · ${escapeHtml(formatNotificationStatus(item.status))}</div>
              <p>${escapeHtml(item.message_body || 'Recordatorio procesado por el sistema.')}</p>
            </div>
            <span class="status-badge ${mapNotificationBadgeClass(item.status)}">${escapeHtml(formatNotificationStatus(item.status))}</span>
          </article>
        `).join('')
      : emptyState('Todavia no hay envios registrados.');
  }

  function formatNotificationStatus(status) {
    const labels = {
      sent: 'Enviado',
      simulated: 'Simulado',
      skipped: 'Omitido',
      failed: 'Error'
    };

    return labels[status] || status || 'Pendiente';
  }

  function mapNotificationBadgeClass(status) {
    const classes = {
      sent: 'scheduled',
      simulated: 'approved',
      skipped: 'pending',
      failed: 'rejected'
    };

    return classes[status] || 'pending';
  }

  function emptyState(message) {
    return `<div class="empty-state">${message}</div>`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(value) {
    return String(value || '').slice(0, 5);
  }

  function formatDate(value) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatDateTime(value) {
    return new Date(value).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRequestStatus(status) {
    const labels = {
      pending: 'Pendiente',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      scheduled: 'Programada'
    };
    return labels[status] || status || 'Pendiente';
  }

  function bootstrapPatientPage() {
    const app = window.MediAlertMain;
    if (app?.isReady) {
      initPatientPage();
      return;
    }

    document.addEventListener('medialert:ready', initPatientPage, { once: true });
  }

  // Global pause listener para recipe items
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action="pause"]');
    if (!button || !currentPatient) return;

    const itemId = Number(button.dataset.itemId);
    const prescriptionId = Number(button.dataset.prescriptionId || selectedPrescriptionId);
    const curp = currentPatient.curp;
    button.disabled = true;
    const wasPaused = button.textContent.includes('Activar');

    try {
      if (prescriptionId) {
        await window.MediAlertAPI.pausePrescription(curp, prescriptionId);
        window.MediAlertMain.showToast(wasPaused ? 'Receta activada' : 'Receta pausada', 'success');
      } else {
        await window.MediAlertAPI.pauseMedication(curp, itemId);
        window.MediAlertMain.showToast(wasPaused ? 'Notificaciones activadas' : 'Notificaciones pausadas', 'success');
      }
      
      // Recargar data
      const response = await window.MediAlertAPI.getPatientData(curp);
      currentPatient = response.patient;
      renderRecipeHistory(currentPatient);
      renderSelectedRecipe(currentPatient);
      await loadTodayReminders(curp);
    } catch (error) {
      window.MediAlertMain.showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener('DOMContentLoaded', bootstrapPatientPage);
})();
