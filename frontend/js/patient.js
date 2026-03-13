(function () {
  let currentPatient = null;
  let selectedPrescriptionId = null;

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
    } catch (error) {
      app.showToast(error.message, 'error');
    }
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
              <strong>${medication.emoji || '💊'} ${escapeHtml(medication.name)}</strong>
              <div class="med-meta">${medication.dose_mg} mg · ${escapeHtml(medication.frequency || 'Frecuencia por definir')} · ${formatTime(medication.time)}</div>
              <p>${escapeHtml(medication.notes || 'Sin observaciones')}</p>
            </div>
            <span class="status-badge scheduled">${medication.duration_days ? `${medication.duration_days} dias` : 'Activa'}</span>
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

  document.addEventListener('DOMContentLoaded', bootstrapPatientPage);
})();
