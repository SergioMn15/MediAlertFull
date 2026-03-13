(function () {
  let cachedPatients = [];
  let prescriptionDraft = [];

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
    bindRequestActions();
    bindPatientSelector();
    bindPrescriptionDraftActions();
    bindPrescriptionForm();
    renderPrescriptionDraft();
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
    const patientSelect = document.getElementById('prescription-patient-select');

    try {
      const app = window.MediAlertMain;
      const [profile, patients, appointments, requests] = await Promise.all([
        window.MediAlertAPI.getDoctorProfile(),
        window.MediAlertAPI.getPatients(),
        window.MediAlertAPI.getDoctorAppointments(app.state.user.id),
        window.MediAlertAPI.getDoctorAppointmentRequests(app.state.user.id)
      ]);

      cachedPatients = patients.patients || [];
      if (patientSelect) {
        populatePatientSelect(patientSelect, cachedPatients);
      }

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
        patientsBox.innerHTML = cachedPatients.length
          ? cachedPatients.map((patient) => `
              <article class="med-card">
                <div>
                  <strong>${patient.name}</strong>
                  <div class="med-meta">${patient.curp}</div>
                  <p>${patient.medication_count || 0} medicamentos activos</p>
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
                  <div class="appointment-meta">${formatDate(item.date)} ${formatTime(item.time)}</div>
                </div>
                <span class="status-badge scheduled">${item.status}</span>
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
                  <div class="appointment-meta">${item.curp} · ${formatDate(item.requested_date)} ${formatTime(item.requested_time)}</div>
                  <p>${item.reason || 'Sin motivo especificado'}</p>
                  ${item.doctor_response ? `<p><strong>Respuesta:</strong> ${item.doctor_response}</p>` : ''}
                </div>
                <div class="request-actions">
                  <span class="status-badge ${item.status}">${formatRequestStatus(item.status)}</span>
                  ${item.status === 'pending' ? `
                    <button class="btn btn-primary btn-small" data-request-action="approve" data-request-id="${item.id}" data-request-date="${item.requested_date}" data-request-time="${formatTime(item.requested_time)}">Aprobar</button>
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

      try {
        if (submitButton) {
          submitButton.disabled = true;
        }

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

  function bindPatientSelector() {
    const patientSelect = document.getElementById('prescription-patient-select');
    if (!patientSelect || patientSelect.dataset.bound === 'true') {
      return;
    }

    patientSelect.dataset.bound = 'true';
    patientSelect.addEventListener('change', async () => {
      await loadSelectedPatientPrescription(patientSelect.value);
    });
  }

  function bindPrescriptionDraftActions() {
    const addButton = document.getElementById('add-medication-item');
    if (addButton && addButton.dataset.bound !== 'true') {
      addButton.dataset.bound = 'true';
      addButton.addEventListener('click', addMedicationToDraft);
    }

    const draftList = document.getElementById('prescription-draft-list');
    if (!draftList || draftList.dataset.bound === 'true') {
      return;
    }

    draftList.dataset.bound = 'true';
    draftList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-draft-index]');
      if (!removeButton) {
        return;
      }

      const index = Number(removeButton.dataset.removeDraftIndex);
      prescriptionDraft.splice(index, 1);
      renderPrescriptionDraft();
    });
  }

  function addMedicationToDraft() {
    const name = document.getElementById('medication-name-input')?.value.trim();
    const dose = Number(document.getElementById('medication-dose-input')?.value);
    const frequency = document.getElementById('medication-frequency-input')?.value.trim();
    const durationDays = Number(document.getElementById('medication-duration-input')?.value || 0);
    const time = document.getElementById('medication-time-input')?.value;
    const emoji = document.getElementById('medication-emoji-input')?.value.trim() || '💊';
    const notes = document.getElementById('medication-notes-input')?.value.trim();
    const result = document.getElementById('prescription-result');

    if (!name || !dose || !time) {
      if (result) {
        result.textContent = 'Cada medicamento necesita nombre, dosis y horario.';
        result.className = 'form-message error';
      }
      return;
    }

    prescriptionDraft.push({
      name,
      dose_mg: dose,
      frequency: frequency || '',
      duration_days: durationDays || null,
      time,
      emoji,
      notes: notes || ''
    });

    clearMedicationFields();
    renderPrescriptionDraft();
    if (result) {
      result.textContent = 'Medicamento agregado al borrador.';
      result.className = 'form-message success';
    }
  }

  function clearMedicationFields() {
    const fields = [
      'medication-name-input',
      'medication-dose-input',
      'medication-frequency-input',
      'medication-duration-input',
      'medication-time-input',
      'medication-emoji-input',
      'medication-notes-input'
    ];

    fields.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = '';
      }
    });
  }

  function renderPrescriptionDraft() {
    const draftList = document.getElementById('prescription-draft-list');
    if (!draftList) {
      return;
    }

    draftList.innerHTML = prescriptionDraft.length
      ? prescriptionDraft.map((item, index) => `
          <article class="med-card">
            <div>
              <strong>${item.emoji || '💊'} ${item.name}</strong>
              <div class="med-meta">${item.dose_mg} mg · ${item.frequency || 'Frecuencia por definir'} · ${formatTime(item.time)}</div>
              <p>${item.notes || 'Sin indicaciones particulares'}</p>
            </div>
            <button type="button" class="btn btn-secondary btn-small" data-remove-draft-index="${index}">Quitar</button>
          </article>
        `).join('')
      : '<div class="empty-state">Aun no agregas medicamentos al borrador de receta.</div>';
  }

  function bindPrescriptionForm() {
    const form = document.getElementById('prescription-form');
    if (!form || form.dataset.bound === 'true') {
      return;
    }

    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const patientCurp = document.getElementById('prescription-patient-select')?.value;
      const diagnosis = document.getElementById('prescription-diagnosis-input')?.value.trim() || '';
      const generalInstructions = document.getElementById('prescription-general-notes-input')?.value.trim() || '';
      const result = document.getElementById('prescription-result');
      const submitButton = form.querySelector('button[type="submit"]');

      result.textContent = '';
      result.className = 'form-message';

      if (!patientCurp) {
        result.textContent = 'Selecciona un paciente.';
        result.className = 'form-message error';
        return;
      }

      if (prescriptionDraft.length === 0) {
        result.textContent = 'Agrega al menos un medicamento al borrador.';
        result.className = 'form-message error';
        return;
      }

      try {
        if (submitButton) {
          submitButton.disabled = true;
        }

        await window.MediAlertAPI.createPrescription({
          curp: patientCurp,
          diagnosis,
          general_instructions: generalInstructions,
          items: prescriptionDraft
        });

        result.textContent = 'Receta medica guardada correctamente.';
        result.className = 'form-message success';
        window.MediAlertMain.showToast('Receta medica guardada correctamente.', 'success');

        prescriptionDraft = [];
        renderPrescriptionDraft();
        clearMedicationFields();
        const diagnosisField = document.getElementById('prescription-diagnosis-input');
        const notesField = document.getElementById('prescription-general-notes-input');
        if (diagnosisField) diagnosisField.value = '';
        if (notesField) notesField.value = '';

        await loadDoctorSummary();
        await loadSelectedPatientPrescription(patientCurp);
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

  async function loadSelectedPatientPrescription(curp) {
    const patientCard = document.getElementById('selected-patient-card');
    const medicationList = document.getElementById('doctor-medication-list');
    const patientMeta = document.getElementById('prescription-patient-meta');

    if (!patientCard || !medicationList || !patientMeta) {
      return;
    }

    if (!curp) {
      patientMeta.textContent = 'Selecciona un paciente para ver su receta actual.';
      patientCard.innerHTML = '<div class="empty-state">Aun no hay paciente seleccionado.</div>';
      medicationList.innerHTML = '<div class="empty-state">Selecciona un paciente para ver medicamentos.</div>';
      return;
    }

    try {
      const response = await window.MediAlertAPI.getPatientData(curp);
      const patient = response.patient;
      const activePrescription = patient.active_prescription;
      const medications = patient.medications || [];

      patientMeta.textContent = `${patient.name} · ${patient.curp}`;
      patientCard.innerHTML = `
        <div>
          <strong>${patient.name}</strong>
          <div class="med-meta">${patient.curp}</div>
          <p><strong>Diagnostico:</strong> ${activePrescription?.diagnosis || 'Sin diagnostico capturado'}</p>
          <p><strong>Indicaciones generales:</strong> ${activePrescription?.general_instructions || 'Sin indicaciones generales'}</p>
        </div>
      `;

      medicationList.innerHTML = medications.length
        ? medications.map((medication) => `
            <article class="med-card">
              <div>
                <strong>${medication.emoji || '💊'} ${medication.name}</strong>
                <div class="med-meta">${medication.dose_mg} mg · ${medication.frequency || 'Frecuencia por definir'} · ${formatTime(medication.time)}</div>
                <p>${medication.notes || 'Sin indicaciones'}</p>
              </div>
              <span class="status-badge scheduled">${medication.duration_days ? `${medication.duration_days} dias` : 'Activa'}</span>
            </article>
          `).join('')
        : '<div class="empty-state">Este paciente aun no tiene receta activa.</div>';
    } catch (error) {
      patientMeta.textContent = 'No fue posible cargar la receta actual.';
      patientCard.innerHTML = `<div class="empty-state">${error.message}</div>`;
      medicationList.innerHTML = '<div class="empty-state">No se pudo cargar la receta.</div>';
    }
  }

  function populatePatientSelect(select, patients) {
    const selectedValue = select.value;
    select.innerHTML = '<option value="">Selecciona un paciente</option>';

    patients.forEach((patient) => {
      const option = document.createElement('option');
      option.value = patient.curp;
      option.textContent = `${patient.name} · ${patient.curp}`;
      select.appendChild(option);
    });

    if (selectedValue && patients.some((patient) => patient.curp === selectedValue)) {
      select.value = selectedValue;
    }
  }

  function formatDate(value) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatTime(value) {
    return String(value || '').slice(0, 5);
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
      initDoctorPage();
      return;
    }

    document.addEventListener('medialert:ready', initDoctorPage, { once: true });
  }

  document.addEventListener('DOMContentLoaded', bootstrapDoctorPage);
})();
