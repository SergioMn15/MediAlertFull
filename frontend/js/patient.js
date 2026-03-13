(function () {
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

      renderSidebar(patient);
      renderDashboard(patient);
      renderRecipe(patient);
      renderProfile(patient);
      bindAppointmentForm(patient);
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
            <strong>${nextMedication.emoji || '💊'} ${nextMedication.name}</strong>
            <div class="med-meta">${nextMedication.dose_mg} mg a las ${formatTime(nextMedication.time)}</div>
            <p>${nextMedication.notes || 'Sin observaciones.'}</p>
            ${nextMedication.frequency ? `<p><strong>Frecuencia:</strong> ${nextMedication.frequency}</p>` : ''}
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
          <span class="status-badge scheduled">${nextAppointment.status || 'scheduled'}</span>
        `
        : emptyState('No hay citas registradas');
    }

    const recentList = document.getElementById('recent-medications');
    if (recentList) {
      recentList.innerHTML = medications.length
        ? medications.map((medication) => `
            <article class="med-card">
              <div>
                <strong>${medication.emoji || '💊'} ${medication.name}</strong>
                <div class="med-meta">${medication.dose_mg} mg · ${formatTime(medication.time)}</div>
                <p>${medication.notes || 'Sin notas'}</p>
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
              <span class="status-badge scheduled">${item.status || 'scheduled'}</span>
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
                <p>${item.reason || 'Sin motivo especificado'}</p>
                ${item.doctor_response ? `<p><strong>Respuesta:</strong> ${item.doctor_response}</p>` : ''}
              </div>
              <span class="status-badge ${item.status || 'pending'}">${formatRequestStatus(item.status)}</span>
            </article>
          `).join('')
        : emptyState('Aun no has enviado solicitudes de cita');
    }

    setText('recipe-doctor', `Doctor: ${activePrescription?.doctor_name || 'Sin asignar'}`);
    setText('recipe-date', `Ultima actualizacion: ${activePrescription?.issued_at ? formatDateTime(activePrescription.issued_at) : new Date().toLocaleDateString('es-MX')}`);
  }

  function renderRecipe(patient) {
    const list = document.getElementById('medication-list');
    const diagnosis = document.getElementById('recipe-diagnosis');
    const instructions = document.getElementById('recipe-instructions');
    if (!list) {
      return;
    }

    const activePrescription = patient.active_prescription;
    const medications = patient.medications || [];

    if (diagnosis) {
      diagnosis.textContent = activePrescription?.diagnosis || 'Sin diagnostico capturado';
    }

    if (instructions) {
      instructions.textContent = activePrescription?.general_instructions || 'Sin indicaciones generales';
    }

    list.innerHTML = medications.length
      ? medications.map((medication) => `
          <article class="med-card">
            <div>
              <strong>${medication.emoji || '💊'} ${medication.name}</strong>
              <div class="med-meta">${medication.dose_mg} mg · ${medication.frequency || 'Frecuencia por definir'} · ${formatTime(medication.time)}</div>
              <p>${medication.notes || 'Sin observaciones'}</p>
            </div>
            <span class="status-badge scheduled">${medication.duration_days ? `${medication.duration_days} dias` : 'Activa'}</span>
          </article>
        `).join('')
      : emptyState('Aun no tienes medicamentos asignados');

    document.getElementById('download-pdf')?.addEventListener('click', () => {
      window.print();
    });
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
