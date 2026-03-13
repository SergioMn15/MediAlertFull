(function () {
  async function initDoctorPage() {
    const app = window.MediAlertMain;
    if (!window.location.pathname.includes('/doctor/')) {
      return;
    }

    if (!app?.state?.user) {
      app?.logout(false);
      return;
    }

    if (!app.requireRole('doctor')) {
      return;
    }

    hydrateSidebar();
    bindRegisterForm();
    await loadDoctorSummary();
  }

  function hydrateSidebar() {
    const app = window.MediAlertMain;
    const name = document.getElementById('patient-name');
    const extra = document.getElementById('patient-curp');

    if (name) {
      name.textContent = app.state.user.name;
    }

    if (extra) {
      extra.textContent = 'Panel del doctor';
    }
  }

  async function loadDoctorSummary() {
    const profileBox = document.getElementById('doctor-profile');
    const patientsBox = document.getElementById('doctor-patient-list');
    const appointmentsBox = document.getElementById('doctor-appointments');
    const requestBox = document.getElementById('doctor-request-list');

    try {
      const app = window.MediAlertMain;
      const [profile, patients, appointments, requests] = await Promise.all([
        window.MediAlertAPI.getDoctorProfile(),
        window.MediAlertAPI.getPatients(),
        window.MediAlertAPI.getDoctorAppointments(app.state.user.id),
        window.MediAlertAPI.getDoctorAppointmentRequests(app.state.user.id)
      ]);

      if (profileBox) {
        profileBox.innerHTML = `
          <div class="info-card">
            <strong>${profile.doctor.name}</strong>
            <p>${profile.doctor.specialty || 'Especialidad no definida'}</p>
            <div class="med-meta">Cedula: ${profile.doctor.license || 'N/D'}</div>
          </div>
        `;
      }

      if (patientsBox) {
        patientsBox.innerHTML = (patients.patients || []).length
          ? patients.patients.map((patient) => `
              <article class="med-card">
                <div>
                  <strong>${patient.name}</strong>
                  <div class="med-meta">${patient.curp}</div>
                </div>
              </article>
            `).join('')
          : '<div class="empty-state">Todavia no hay pacientes registrados.</div>';
      }

      if (appointmentsBox) {
        appointmentsBox.innerHTML = (appointments.appointments || []).length
          ? appointments.appointments.map((item) => `
              <article class="appointment-card">
                <div>
                  <strong>${item.patient_name}</strong>
                  <div class="appointment-meta">${item.date} ${String(item.time).slice(0, 5)}</div>
                </div>
                <span class="status-badge pending">${item.status}</span>
              </article>
            `).join('')
          : '<div class="empty-state">No hay citas programadas.</div>';
      }

      if (requestBox) {
        requestBox.innerHTML = (requests.requests || []).length
          ? requests.requests.map((item) => `
              <article class="appointment-card">
                <div>
                  <strong>${item.patient_name}</strong>
                  <div class="appointment-meta">${item.curp} · ${formatDate(item.requested_date)} ${String(item.requested_time).slice(0, 5)}</div>
                  <p>${item.reason || 'Sin motivo especificado'}</p>
                  ${item.doctor_response ? `<p><strong>Respuesta:</strong> ${item.doctor_response}</p>` : ''}
                </div>
                <div class="request-actions">
                  <span class="status-badge ${item.status}">${formatRequestStatus(item.status)}</span>
                  ${item.status === 'pending' ? `
                    <button class="btn btn-primary btn-small" data-request-action="approve" data-request-id="${item.id}" data-request-date="${item.requested_date}" data-request-time="${String(item.requested_time).slice(0, 5)}">Aprobar</button>
                    <button class="btn btn-secondary btn-small" data-request-action="reject" data-request-id="${item.id}">Rechazar</button>
                  ` : ''}
                </div>
              </article>
            `).join('')
          : '<div class="empty-state">No hay solicitudes de cita.</div>';
      }
    } catch (error) {
      window.MediAlertMain.showToast(error.message, 'error');
    }
  }

  function bindRegisterForm() {
    const form = document.getElementById('register-patient-form');
    if (!form || form.dataset.bound === 'true') {
      return;
    }

    form.dataset.bound = 'true';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const curp = document.getElementById('patient-curp-input').value.trim().toUpperCase();
      const name = document.getElementById('patient-name-input').value.trim();
      const password = document.getElementById('patient-password').value.trim();
      const result = document.getElementById('register-result');
      const submitButton = form.querySelector('button[type="submit"]');

      result.textContent = '';
      result.className = 'form-message';
      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        await window.MediAlertAPI.registerPatient(curp, name, password);
        result.textContent = 'Paciente registrado correctamente.';
        result.className = 'form-message success';
        window.MediAlertMain.showToast('Paciente registrado correctamente.', 'success');
        form.reset();
        await loadDoctorSummary();
      } catch (error) {
        result.textContent = error.message;
        result.className = 'form-message error';
        window.MediAlertMain.showToast(error.message, 'error');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  function bindRequestActions() {
    const requestContainer = document.getElementById('doctor-request-list');
    if (!requestContainer || requestContainer.dataset.bound === 'true') {
      return;
    }

    requestContainer.dataset.bound = 'true';
    requestContainer.addEventListener('click', async (event) => {
      const actionButton = event.target.closest('[data-request-action]');
      if (!actionButton) {
        return;
      }

      const requestId = actionButton.dataset.requestId;
      const action = actionButton.dataset.requestAction;

      try {
        actionButton.disabled = true;

        if (action === 'approve') {
          const scheduledDate = window.prompt('Fecha final para la cita (YYYY-MM-DD):', actionButton.dataset.requestDate || '');
          if (!scheduledDate) {
            return;
          }

          const scheduledTime = window.prompt('Hora final para la cita (HH:MM):', actionButton.dataset.requestTime || '');
          if (!scheduledTime) {
            return;
          }

          const response = window.prompt('Mensaje para el paciente (opcional):', 'Solicitud aprobada');
          await window.MediAlertAPI.reviewAppointmentRequest(requestId, {
            action: 'approve',
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            response: response || ''
          });
          window.MediAlertMain.showToast('Solicitud aprobada', 'success');
        } else {
          const response = window.prompt('Motivo del rechazo (opcional):', 'Horario no disponible');
          await window.MediAlertAPI.reviewAppointmentRequest(requestId, {
            action: 'reject',
            response: response || ''
          });
          window.MediAlertMain.showToast('Solicitud rechazada', 'info');
        }

        await loadDoctorSummary();
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
      } finally {
        actionButton.disabled = false;
      }
    });
  }

  function formatDate(value) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatRequestStatus(status) {
    const labels = {
      pending: 'Pendiente',
      approved: 'Aprobada',
      rejected: 'Rechazada'
    };

    return labels[status] || status || 'Pendiente';
  }

  function bootstrapDoctorPage() {
    const app = window.MediAlertMain;
    if (app?.isReady) {
      bindRequestActions();
      initDoctorPage();
      return;
    }

    document.addEventListener('medialert:ready', () => {
      bindRequestActions();
      initDoctorPage();
    }, { once: true });
  }

  document.addEventListener('DOMContentLoaded', bootstrapDoctorPage);
})();
