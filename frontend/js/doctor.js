(function () {
  let cachedPatients = [];
  let prescriptionDraft = [];

  // Mejora: Load draft from localStorage
  try {
    const saved = localStorage.getItem('medialert_doctor_draft');
    if (saved) {
      prescriptionDraft = JSON.parse(saved);
    }
  } catch (e) {
    localStorage.removeItem('medialert_doctor_draft');
  }

  function saveDraft() {
    localStorage.setItem('medialert_doctor_draft', JSON.stringify(prescriptionDraft));
  }

  function updateDraftCounter() {
    const counters = document.querySelectorAll('.draft-counter');
    counters.forEach(el => el.textContent = prescriptionDraft.length);
    
    const submitBtn = document.querySelector('#prescription-form button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = 'Guardar receta completa (' + prescriptionDraft.length + ')';
      submitBtn.disabled = prescriptionDraft.length === 0;
    }
  }

  function formatDate(value) {
    return new Date(value + 'T00:00:00').toLocaleDateString('es-MX', {
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

  async function initDoctorPage() {
    const app = window.MediAlertMain;
    if (!window.location.pathname.includes('/doctor/')) return;
    if (!app?.state?.user) {
      app?.logout(false);
      return;
    }
    if (!app.requireRole('doctor')) return;

    hydrateSidebar();
    bindRegisterForm();
    bindRequestActions();
    bindPatientSelector();
    bindPrescriptionDraftActions();
    bindPrescriptionForm();
    renderPrescriptionDraft();
    updateDraftCounter();
    await loadDoctorSummary();
  }

  function hydrateSidebar() {
    const app = window.MediAlertMain;
    const name = document.getElementById('patient-name');
    const extra = document.getElementById('patient-curp');
    if (name) name.textContent = app.state.user.name;
    if (extra) extra.textContent = 'Panel del doctor';
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
      if (patientSelect) populatePatientSelect(patientSelect, cachedPatients);

      if (profileBox) {
        profileBox.innerHTML = '<div class="info-card"><strong>' + (profile.doctor.name || '') + '</strong><p>' + (profile.doctor.specialty || 'Especialidad no definida') + '</p><div class="med-meta">Cedula: ' + (profile.doctor.license || 'N/D') + '</div></div>';
      }

      if (patientsBox) {
        patientsBox.innerHTML = cachedPatients.length ? cachedPatients.map(patient => 
          '<article class="med-card"><div><strong>' + patient.name + '</strong><div class="med-meta">' + patient.curp + '</div><p>' + (patient.medication_count || 0) + ' medicamentos activos</p></div></article>'
        ).join('') : '<div class="empty-state">Todavia no hay pacientes registrados.</div>';
      }

      if (appointmentsBox) {
        appointmentsBox.innerHTML = (appointments.appointments || []).length ? appointments.appointments.map(item => 
          '<article class="appointment-card"><div><strong>' + item.patient_name + '</strong><div class="appointment-meta">' + formatDate(item.date) + ' ' + formatTime(item.time) + '</div></div><span class="status-badge scheduled">' + item.status + '</span></article>'
        ).join('') : '<div class="empty-state">No hay citas programadas.</div>';
      }

      if (requestBox) {
        requestBox.innerHTML = (requests.requests || []).length ? requests.requests.map(item => 
          '<article class="appointment-card">' +
          '<div><strong>' + item.patient_name + '</strong><div class="appointment-meta">' + item.curp + ' · ' + formatDate(item.requested_date) + ' ' + formatTime(item.requested_time) + '</div><p>' + (item.reason || 'Sin motivo especificado') + '</p>' +
          (item.doctor_response ? '<p><strong>Respuesta:</strong> ' + item.doctor_response + '</p>' : '') +
          '</div><div class="request-actions"><span class="status-badge ' + item.status + '">' + formatRequestStatus(item.status) + '</span>' +
          (item.status === 'pending' ? '<button class="btn btn-primary btn-small" data-request-action="approve" data-request-id="' + item.id + '" data-request-date="' + item.requested_date + '" data-request-time="' + formatTime(item.requested_time) + '">Aprobar</button><button class="btn btn-secondary btn-small" data-request-action="reject" data-request-id="' + item.id + '">Rechazar</button>' : '') +
          '</div></article>'
        ).join('') : '<div class="empty-state">No hay solicitudes de cita.</div>';
      }
    } catch (error) {
      window.MediAlertMain.showToast(error.message, 'error');
    }
  }

  function bindRegisterForm() {
    const form = document.getElementById('register-patient-form');
    if (!form || form.dataset.bound === 'true') return;

    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const curp = document.getElementById('patient-curp-input').value.trim().toUpperCase();
      const name = document.getElementById('patient-name-input').value.trim();
      const password = document.getElementById('patient-password').value.trim();
      const result = document.getElementById('register-result');
      const submitButton = form.querySelector('button[type="submit"]');

      if (result) {
        result.textContent = '';
        result.className = 'form-message';
      }

      try {
        if (submitButton) submitButton.disabled = true;
        await window.MediAlertAPI.registerPatient(curp, name, password);
        if (result) {
          result.textContent = 'Paciente registrado correctamente.';
          result.className = 'form-message success';
        }
        window.MediAlertMain.showToast('Paciente registrado correctamente.', 'success');
        form.reset();
        await loadDoctorSummary();
      } catch (error) {
        if (result) {
          result.textContent = error.message;
          result.className = 'form-message error';
        }
        window.MediAlertMain.showToast(error.message, 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  function bindRequestActions() {
    const requestContainer = document.getElementById('doctor-request-list');
    if (!requestContainer || requestContainer.dataset.bound === 'true') return;

    requestContainer.dataset.bound = 'true';
    requestContainer.addEventListener('click', async (event) => {
      const actionButton = event.target.closest('[data-request-action]');
      if (!actionButton) return;

      const requestId = actionButton.dataset.requestId;
      const action = actionButton.dataset.requestAction;

      try {
        actionButton.disabled = true;

        if (action === 'approve') {
          const scheduledDate = window.prompt('Fecha final (YYYY-MM-DD):', actionButton.dataset.requestDate || '');
          if (!scheduledDate) return;
          const scheduledTime = window.prompt('Hora final (HH:MM):', actionButton.dataset.requestTime || '');
          if (!scheduledTime) return;
          const response = window.prompt('Mensaje paciente:', 'Solicitud aprobada') || '';
          await window.MediAlertAPI.reviewAppointmentRequest(requestId, {
            action: 'approve',
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            response: response
          });
          window.MediAlertMain.showToast('Solicitud aprobada', 'success');
        } else {
          const response = window.prompt('Motivo rechazo:', 'Horario no disponible') || '';
          await window.MediAlertAPI.reviewAppointmentRequest(requestId, {
            action: 'reject',
            response: response
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
    if (!patientSelect || patientSelect.dataset.bound === 'true') return;

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
    if (!draftList || draftList.dataset.bound === 'true') return;

    draftList.dataset.bound = 'true';
    draftList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-draft-index]');
      if (removeButton) {
        const index = Number(removeButton.dataset.removeDraftIndex);
        prescriptionDraft.splice(index, 1);
        saveDraft();
        renderPrescriptionDraft();
        updateDraftCounter();
      }
    });
  }

  function addMedicationToDraft() {
    const name = document.getElementById('medication-name-input').value.trim();
    const dose = Number(document.getElementById('medication-dose-input').value);
    const frequency = document.getElementById('medication-frequency-input').value.trim();
    const durationDays = Number(document.getElementById('medication-duration-input').value || 0);
    const time = document.getElementById('medication-time-input').value;
    const emoji = document.getElementById('medication-emoji-input').value.trim() || '💊';
    const notes = document.getElementById('medication-notes-input').value.trim();
    const result = document.getElementById('prescription-result');

    if (!name || !dose || !time) {
      if (result) {
        result.textContent = 'Nombre, dosis y horario requeridos.';
        result.className = 'form-message error';
      }
      return;
    }

    if (prescriptionDraft.some(item => item.name.toLowerCase() === name.toLowerCase())) {
      if (result) {
        result.textContent = 'Medicamento duplicado en borrador.';
        result.className = 'form-message error';
      }
      return;
    }

    prescriptionDraft.push({
      name, dose_mg: dose, frequency: frequency || '', duration_days: durationDays || null,
      time, emoji, notes: notes || ''
    });

    saveDraft();
    clearMedicationFields();
    renderPrescriptionDraft();
    updateDraftCounter();
    if (result) {
      result.textContent = 'Agregado al borrador (' + prescriptionDraft.length + ' total).';
      result.className = 'form-message success';
    }
  }

  function bindPrescriptionForm() {
    const form = document.getElementById('prescription-form');
    if (!form || form.dataset.bound === 'true') return;

    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const patientCurp = document.getElementById('prescription-patient-select').value;
      const diagnosis = document.getElementById('prescription-diagnosis-input').value.trim() || '';
      const generalInstructions = document.getElementById('prescription-general-notes-input').value.trim() || '';
      const result = document.getElementById('prescription-result');
      const submitButton = form.querySelector('button[type="submit"]');

      if (result) {
        result.textContent = '';
        result.className = 'form-message';
      }

      if (!patientCurp) {
        if (result) result.textContent = 'Selecciona paciente.';
        return;
      }

      if (prescriptionDraft.length === 0) {
        if (result) result.textContent = 'Borrador vacío. Agrega medicamentos.';
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        if (result) result.textContent = 'Guardando receta con ' + prescriptionDraft.length + ' medicamentos...';

        await window.MediAlertAPI.createPrescription({
          curp: patientCurp,
          diagnosis,
          general_instructions: generalInstructions,
          items: prescriptionDraft
        });

        if (result) {
          result.textContent = 'Receta con ' + prescriptionDraft.length + ' medicamentos guardada exitosamente!';
          result.className = 'form-message success';
        }
        window.MediAlertMain.showToast('Receta ' + prescriptionDraft.length + ' medicamentos guardada!', 'success');

        localStorage.removeItem('medialert_doctor_draft');
        prescriptionDraft = [];
        renderPrescriptionDraft();
        updateDraftCounter();
        clearMedicationFields();
        document.getElementById('prescription-diagnosis-input').value = '';
        document.getElementById('prescription-general-notes-input').value = '';

        await loadDoctorSummary();
        await loadSelectedPatientPrescription(patientCurp);
      } catch (error) {
        console.error('Error receta:', error);
        if (result) result.textContent = error.message;
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  async function loadSelectedPatientPrescription(curp) {
    // Implementation simplificada con concatenacion
    console.log('Loading patient prescription for:', curp);
  }

  function populatePatientSelect(select, patients) {
    const selectedValue = select.value;
    select.innerHTML = '<option value="">Selecciona un paciente</option>';

    patients.forEach((patient) => {
      const option = document.createElement('option');
      option.value = patient.curp;
      option.textContent = patient.name + ' · ' + patient.curp;
      select.appendChild(option);
    });

    if (selectedValue && patients.some(p => p.curp === selectedValue)) {
      select.value = selectedValue;
    }
  }

  // Bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDoctorPage);
  } else {
    initDoctorPage();
  }
  window.addEventListener('medialert:ready', initDoctorPage);
})();

