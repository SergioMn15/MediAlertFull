(function () {
  let cachedPatients = [];
  let prescriptionDraft = [];
  let requestModalState = null;
  let selectedPatientCurp = '';
  let expedientDetailState = {
    patientName: '',
    prescriptions: [],
    appointments: [],
    requests: []
  };

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
    restoreDraft();
    bindRegisterForm();
    bindCurpPreview();
    bindRequestModal();
    bindRequestActions();
    bindExpedientDetailModal();
    bindPatientSelector();
    bindClinicalProfileForm();
    bindPrescriptionDraftActions();
    bindPrescriptionForm();
    renderPrescriptionDraft();
    await loadDoctorSummary();
  }

  function restoreDraft() {
    try {
      const savedDraft = localStorage.getItem('medialert_doctor_draft');
      prescriptionDraft = savedDraft ? JSON.parse(savedDraft) : [];
      if (!Array.isArray(prescriptionDraft)) {
        prescriptionDraft = [];
      }
    } catch (error) {
      prescriptionDraft = [];
    }
  }

  function saveDraft() {
    localStorage.setItem('medialert_doctor_draft', JSON.stringify(prescriptionDraft));
  }

  function renderPrescriptionDraft() {
    const draftList = document.getElementById('prescription-draft-list');
    if (!draftList) {
      return;
    }

    if (!prescriptionDraft.length) {
      draftList.innerHTML = '<div class="empty-state">Agrega medicamentos al borrador.</div>';
      return;
    }

    draftList.innerHTML = prescriptionDraft.map((item, index) => `
      <article class="med-card">
        <div>
          <strong>${item.emoji || '💊'} ${escapeHtml(item.name)}</strong>
          <div class="med-meta">${item.dose_mg} mg · ${item.frequency || 'Frecuencia por definir'} · ${formatTime(item.time)}</div>
          <p>${item.notes || 'Sin indicaciones adicionales'}</p>
          ${item.duration_days ? `<p>Duracion: ${item.duration_days} dias</p>` : ''}
        </div>
        <button class="btn btn-secondary btn-small" type="button" data-remove-draft-index="${index}">Quitar</button>
      </article>
    `).join('');
  }

  function addMedicationToDraft() {
    const medication = getMedicationFormData();
    const result = document.getElementById('prescription-result');

    if (!medication) {
      if (result) {
        result.textContent = 'Completa nombre, dosis y horario antes de agregar el medicamento.';
      }
      return;
    }

    prescriptionDraft.push(medication);
    saveDraft();
    renderPrescriptionDraft();
    clearMedicationFields();

    if (result) {
      result.textContent = `Medicamento agregado. Total en borrador: ${prescriptionDraft.length}.`;
    }
  }

  function getMedicationFormData() {
    const name = document.getElementById('medication-name-input')?.value.trim();
    const dose_mg = Number(document.getElementById('medication-dose-input')?.value);
    const frequency = document.getElementById('medication-frequency-input')?.value.trim() || '';
    const durationValue = document.getElementById('medication-duration-input')?.value;
    const time = document.getElementById('medication-time-input')?.value;
    const emoji = document.getElementById('medication-emoji-input')?.value.trim() || '💊';
    const notes = document.getElementById('medication-notes-input')?.value.trim() || '';

    if (!name || !dose_mg || !time) {
      return null;
    }

    return {
      name,
      dose_mg,
      frequency,
      duration_days: durationValue ? Number(durationValue) : null,
      time,
      emoji,
      notes
    };
  }

  function clearMedicationFields() {
    [
      'medication-name-input',
      'medication-dose-input',
      'medication-frequency-input',
      'medication-duration-input',
      'medication-time-input',
      'medication-emoji-input',
      'medication-notes-input'
    ].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = '';
      }
    });
  }

  function bindPrescriptionDraftActions() {
    const addBtn = document.getElementById('add-medication-item');
    if (addBtn) {
      addBtn.addEventListener('click', addMedicationToDraft);
    }

    const draftList = document.getElementById('prescription-draft-list');
    if (draftList) {
      draftList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-draft-index]');
        if (!button) {
          return;
        }

        const index = Number(button.dataset.removeDraftIndex);
        if (Number.isNaN(index)) {
          return;
        }

        prescriptionDraft.splice(index, 1);
        saveDraft();
        renderPrescriptionDraft();
      });
    }
  }

  function bindPrescriptionForm() {
    const form = document.getElementById('prescription-form');
    if (!form) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const curp = document.getElementById('prescription-patient-select')?.value;
      const diagnosis = document.getElementById('prescription-diagnosis-input')?.value.trim() || '';
      const instructions = document.getElementById('prescription-general-notes-input')?.value.trim() || '';
      const result = document.getElementById('prescription-result');

      if (!curp) {
        if (result) {
          result.textContent = 'Selecciona un paciente antes de guardar la receta.';
        }
        return;
      }

      if (!prescriptionDraft.length) {
        if (result) {
          result.textContent = 'Agrega al menos un medicamento al borrador.';
        }
        return;
      }

      try {
        const totalItems = prescriptionDraft.length;
        await window.MediAlertAPI.createPrescription({
          curp,
          diagnosis,
          general_instructions: instructions,
          items: prescriptionDraft
        });

        prescriptionDraft = [];
        localStorage.removeItem('medialert_doctor_draft');
        renderPrescriptionDraft();
        form.reset();

        if (result) {
          result.textContent = `Receta guardada correctamente con ${totalItems} medicamento(s).`;
        }

        window.MediAlertMain.showToast(`Receta guardada con ${totalItems} medicamento(s).`, 'success');
        await loadDoctorSummary(curp);
        await loadSelectedPatientPrescription(curp);
      } catch (error) {
        if (result) {
          result.textContent = error.message;
        }
        window.MediAlertMain.showToast(error.message, 'error');
      }
    });
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

  async function loadDoctorSummary(selectedCurp = '') {
    const patientSummaryBox = document.getElementById('patient-curp-summary');
    const patientsBox = document.getElementById('doctor-patient-list');
    const patientSelect = document.getElementById('prescription-patient-select');
    const agendaStats = document.getElementById('doctor-agenda-stats');
    const appointmentsBox = document.getElementById('doctor-appointments');
    const requestBox = document.getElementById('doctor-request-list');

    try {
      const app = window.MediAlertMain;
      const [patients, appointments, requests] = await Promise.all([
        window.MediAlertAPI.getPatients(),
        window.MediAlertAPI.getDoctorAppointments(app.state.user.id),
        window.MediAlertAPI.getDoctorAppointmentRequests(app.state.user.id)
      ]);

      cachedPatients = patients.patients || [];

      if (patientSelect) {
        populatePatientSelect(patientSelect, cachedPatients, selectedCurp || patientSelect.value);
      }

      if (patientSummaryBox && !patientSummaryBox.innerHTML.trim()) {
        renderCurpSummary('');
      }

      if (patientsBox) {
        patientsBox.innerHTML = cachedPatients.length
          ? cachedPatients.map((patient) => `
              <article class="med-card">
                <div>
                  <strong>${escapeHtml(patient.name)}</strong>
                  <div class="med-meta">${escapeHtml(patient.curp)}</div>
                </div>
                <span class="status-badge scheduled">${patient.medication_count || 0} meds</span>
              </article>
            `).join('')
          : '<div class="empty-state">No hay pacientes registrados.</div>';
      }

      if (appointmentsBox) {
        const doctorAppointments = getUpcomingAppointments(appointments.appointments || []);
        if (agendaStats) {
          agendaStats.innerHTML = renderAgendaStats(
            countTodayAppointments(doctorAppointments),
            doctorAppointments.length,
            countPendingRequests(requests.requests || [])
          );
        }
        appointmentsBox.innerHTML = doctorAppointments.length
          ? doctorAppointments.map((appointment) => `
              <article class="appointment-card">
                <div>
                  <strong>${escapeHtml(appointment.patient_name || 'Paciente')}</strong>
                  <div class="appointment-meta">${escapeHtml(appointment.curp || '')}</div>
                  <p>${formatDate(appointment.date)} a las ${formatTime(appointment.time)}</p>
                </div>
                <span class="status-badge scheduled">${escapeHtml(appointment.status || 'scheduled')}</span>
              </article>
            `).join('')
          : '<div class="empty-state">No hay citas programadas.</div>';
      }

      if (requestBox) {
        const doctorRequests = sortDoctorRequests(requests.requests || []);
        requestBox.innerHTML = doctorRequests.length
          ? doctorRequests.map((request) => `
              <article class="appointment-card">
                <div>
                  <strong>${escapeHtml(request.patient_name || 'Paciente')}</strong>
                  <div class="appointment-meta">${escapeHtml(request.curp || '')}</div>
                  <p>${formatDate(request.requested_date)} a las ${formatTime(request.requested_time)}</p>
                  <p>${escapeHtml(request.reason || 'Sin motivo especificado')}</p>
                  ${request.doctor_response ? `<p><strong>Respuesta:</strong> ${escapeHtml(request.doctor_response)}</p>` : ''}
                </div>
                <div class="request-actions">
                  <span class="status-badge ${request.status || 'pending'}">${formatRequestStatus(request.status)}</span>
                  ${request.status === 'pending'
                    ? `
                      <button class="btn btn-primary btn-small" type="button" data-request-action="approve" data-request-id="${request.id}" data-request-patient="${escapeHtml(request.patient_name || 'Paciente')}" data-request-date="${request.requested_date}" data-request-time="${formatTime(request.requested_time)}">
                        Aprobar
                      </button>
                      <button class="btn btn-secondary btn-small" type="button" data-request-action="reject" data-request-id="${request.id}" data-request-patient="${escapeHtml(request.patient_name || 'Paciente')}" data-request-date="${request.requested_date}" data-request-time="${formatTime(request.requested_time)}">
                        Rechazar
                      </button>
                    `
                    : ''
                  }
                </div>
              </article>
            `).join('')
          : '<div class="empty-state">No hay solicitudes de cita vigentes.</div>';
      }
    } catch (error) {
      console.error('Load summary error:', error);
    }
  }

  function renderAgendaStats(todayAppointments = 0, upcomingAppointments = 0, pendingRequests = 0) {
    return `
      <article class="stat-card">
        <span>Citas de hoy</span>
        <strong>${todayAppointments}</strong>
      </article>
      <article class="stat-card">
        <span>Proximas citas</span>
        <strong>${upcomingAppointments}</strong>
      </article>
      <article class="stat-card">
        <span>Solicitudes pendientes</span>
        <strong>${pendingRequests}</strong>
      </article>
    `;
  }

  function getUpcomingAppointments(appointments) {
    const now = new Date();

    return appointments
      .filter((appointment) => {
        const appointmentDate = parseScheduleDateTime(appointment.date, appointment.time);
        return !Number.isNaN(appointmentDate.getTime()) && appointmentDate >= now;
      })
      .sort((left, right) => {
        const leftDate = parseScheduleDateTime(left.date, left.time);
        const rightDate = parseScheduleDateTime(right.date, right.time);
        return leftDate - rightDate;
      });
  }

  function countTodayAppointments(appointments) {
    const today = new Date().toISOString().slice(0, 10);
    return appointments.filter((appointment) => String(appointment.date || '').slice(0, 10) === today).length;
  }

  function countPendingRequests(requests) {
    return requests.filter((request) => request.status === 'pending').length;
  }

  function sortDoctorRequests(requests) {
    const now = new Date();
    const statusOrder = { pending: 0, approved: 1, rejected: 2 };

    return requests
      .filter((request) => {
        if (request.status === 'pending') {
          return true;
        }

        const requestDate = parseScheduleDateTime(request.requested_date, request.requested_time);
        return !Number.isNaN(requestDate.getTime()) && requestDate >= now;
      })
      .sort((left, right) => {
        const leftStatus = statusOrder[left.status] ?? 3;
        const rightStatus = statusOrder[right.status] ?? 3;

        if (leftStatus !== rightStatus) {
          return leftStatus - rightStatus;
        }

        const leftDate = parseScheduleDateTime(left.requested_date, left.requested_time);
        const rightDate = parseScheduleDateTime(right.requested_date, right.requested_time);
        return leftDate - rightDate;
      });
  }

  function parseScheduleDateTime(dateValue, timeValue) {
    const normalizedDate = String(dateValue || '').slice(0, 10);
    const normalizedTime = String(timeValue || '').slice(0, 8) || '00:00:00';
    return new Date(`${normalizedDate}T${normalizedTime}`);
  }

  function bindRegisterForm() {
    const form = document.getElementById('register-patient-form');
    if (!form) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const curp = document.getElementById('patient-curp-input')?.value.toUpperCase().trim();
      const name = document.getElementById('patient-name-input')?.value.trim();
      const password = document.getElementById('patient-password')?.value;

      try {
        await window.MediAlertAPI.registerPatient(curp, name, password);
        window.MediAlertMain.showToast('Paciente registrado', 'success');
        form.reset();
        renderCurpSummary('');
        await loadDoctorSummary();
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
      }
    });
  }

  function bindCurpPreview() {
    const curpInput = document.getElementById('patient-curp-input');
    if (!curpInput || curpInput.dataset.bound === 'true') {
      return;
    }

    curpInput.dataset.bound = 'true';
    renderCurpSummary(curpInput.value);

    curpInput.addEventListener('input', (event) => {
      renderCurpSummary(event.target.value);
    });
  }

  function renderCurpSummary(curpValue) {
    const summaryBox = document.getElementById('patient-curp-summary');
    if (!summaryBox) {
      return;
    }

    const curp = String(curpValue || '').toUpperCase().trim();
    if (!curp) {
      summaryBox.innerHTML = '<div class="empty-state">Captura una CURP para ver fecha de nacimiento, sexo, entidad y edad estimada del paciente.</div>';
      return;
    }

    const summary = parseCurp(curp);
    if (!summary.isValid) {
      summaryBox.innerHTML = `
        <div class="info-card">
          <strong>CURP en captura</strong>
          <p>${escapeHtml(curp)}</p>
          <p>${escapeHtml(summary.error || 'La CURP aun no tiene un formato valido.')}</p>
        </div>
      `;
      return;
    }

    summaryBox.innerHTML = `
      <article class="info-card">
        <strong>CURP: ${escapeHtml(curp)}</strong>
        <p>Fecha de nacimiento: ${escapeHtml(summary.birthDateLabel)}</p>
        <p>Edad estimada: ${escapeHtml(String(summary.age))} anos</p>
        <p>Sexo: ${escapeHtml(summary.genderLabel)}</p>
        <p>Entidad: ${escapeHtml(summary.stateLabel)}</p>
        <p>Homoclave: ${escapeHtml(summary.homoclave)}</p>
      </article>
    `;
  }

  function bindRequestActions() {
    const requestList = document.getElementById('doctor-request-list');
    if (!requestList || requestList.dataset.bound === 'true') {
      return;
    }

    requestList.dataset.bound = 'true';
    requestList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-request-action]');
      if (!button) {
        return;
      }

      const action = button.dataset.requestAction;
      const requestId = button.dataset.requestId;
      if (!requestId) {
        return;
      }

      try {
        if (action === 'approve') {
          openRequestModal({
            action: 'approve',
            requestId,
            patientName: button.dataset.requestPatient || 'Paciente',
            date: button.dataset.requestDate || '',
            time: button.dataset.requestTime || '',
            response: 'Solicitud aprobada'
          });
        }

        if (action === 'reject') {
          openRequestModal({
            action: 'reject',
            requestId,
            patientName: button.dataset.requestPatient || 'Paciente',
            date: button.dataset.requestDate || '',
            time: button.dataset.requestTime || '',
            response: 'Por favor selecciona otra fecha u horario'
          });
        }
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
      }
    });
  }

  function bindRequestModal() {
    const modal = document.getElementById('request-modal');
    const form = document.getElementById('request-modal-form');
    const closeButton = document.getElementById('request-modal-close');
    const cancelButton = document.getElementById('request-modal-cancel');

    if (!modal || !form || form.dataset.bound === 'true') {
      return;
    }

    form.dataset.bound = 'true';

    closeButton?.addEventListener('click', closeRequestModal);
    cancelButton?.addEventListener('click', closeRequestModal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeRequestModal();
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const requestId = document.getElementById('request-modal-id')?.value;
      const action = document.getElementById('request-modal-action')?.value;
      const date = document.getElementById('request-modal-date')?.value;
      const time = document.getElementById('request-modal-time')?.value;
      const response = document.getElementById('request-modal-response')?.value.trim() || '';
      const message = document.getElementById('request-modal-message');

      if (!requestId || !action) {
        return;
      }

      if (action === 'approve' && (!date || !time)) {
        if (message) {
          message.textContent = 'Captura fecha y hora para aprobar la solicitud.';
          message.className = 'form-message error';
        }
        return;
      }

      if (action === 'approve' && !isFutureSchedule(date, time)) {
        if (message) {
          message.textContent = 'La fecha y hora aprobadas deben ser futuras.';
          message.className = 'form-message error';
        }
        return;
      }

      try {
        const payload = action === 'approve'
          ? {
              action,
              scheduled_date: date,
              scheduled_time: time,
              response
            }
          : {
              action,
              response
            };

        await window.MediAlertAPI.reviewAppointmentRequest(requestId, payload);
        closeRequestModal();
        window.MediAlertMain.showToast(
          action === 'approve' ? 'Solicitud aprobada y cita creada' : 'Solicitud rechazada',
          action === 'approve' ? 'success' : 'info'
        );
        await loadDoctorSummary();
      } catch (error) {
        if (message) {
          message.textContent = error.message;
          message.className = 'form-message error';
        }
      }
    });
  }

  function openRequestModal(config) {
    requestModalState = config;
    const modal = document.getElementById('request-modal');
    const title = document.getElementById('request-modal-title');
    const subtitle = document.getElementById('request-modal-subtitle');
    const requestId = document.getElementById('request-modal-id');
    const action = document.getElementById('request-modal-action');
    const patient = document.getElementById('request-modal-patient');
    const date = document.getElementById('request-modal-date');
    const time = document.getElementById('request-modal-time');
    const response = document.getElementById('request-modal-response');
    const submit = document.getElementById('request-modal-submit');
    const message = document.getElementById('request-modal-message');
    const suggestedSchedule = getSuggestedFutureSchedule(config.date, config.time);

    if (!modal) {
      return;
    }

    if (title) {
      title.textContent = config.action === 'approve' ? 'Aprobar solicitud' : 'Rechazar solicitud';
    }
    if (subtitle) {
      subtitle.textContent = config.action === 'approve'
        ? 'Confirma la fecha, hora y mensaje para el paciente.'
        : 'Escribe el motivo del rechazo para informar al paciente.';
    }
    if (requestId) {
      requestId.value = config.requestId;
    }
    if (action) {
      action.value = config.action;
    }
    if (patient) {
      patient.value = config.patientName;
    }
    if (date) {
      date.value = config.action === 'approve' ? suggestedSchedule.date : (config.date || '');
      date.disabled = config.action !== 'approve';
      date.min = config.action === 'approve' ? suggestedSchedule.minDate : '';
    }
    if (time) {
      time.value = config.action === 'approve' ? suggestedSchedule.time : (config.time || '');
      time.disabled = config.action !== 'approve';
    }
    if (response) {
      response.value = config.response || '';
      response.placeholder = config.action === 'approve'
        ? 'Mensaje opcional para confirmar la cita'
        : 'Motivo del rechazo';
    }
    if (submit) {
      submit.textContent = config.action === 'approve' ? 'Aprobar solicitud' : 'Confirmar rechazo';
      submit.className = `btn ${config.action === 'approve' ? 'btn-primary' : 'btn-secondary'}`;
    }
    if (message) {
      message.textContent = '';
      message.className = 'form-message';
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeRequestModal() {
    requestModalState = null;
    const modal = document.getElementById('request-modal');
    const form = document.getElementById('request-modal-form');
    const message = document.getElementById('request-modal-message');

    if (form) {
      form.reset();
    }
    if (message) {
      message.textContent = '';
      message.className = 'form-message';
    }
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function getSuggestedFutureSchedule(date, time) {
    const now = new Date();
    const candidate = date && time ? new Date(`${date}T${time}`) : null;
    const isCandidateValid = candidate && !Number.isNaN(candidate.getTime()) && candidate > now;
    const fallback = new Date(now.getTime() + 60 * 60 * 1000);

    const selected = isCandidateValid ? candidate : fallback;

    return {
      date: selected.toISOString().slice(0, 10),
      time: `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`,
      minDate: now.toISOString().slice(0, 10)
    };
  }

  function isFutureSchedule(date, time) {
    if (!date || !time) {
      return false;
    }

    const selectedDate = new Date(`${date}T${time}`);
    return !Number.isNaN(selectedDate.getTime()) && selectedDate > new Date();
  }

  function bindPatientSelector() {
    const selector = document.getElementById('prescription-patient-select');
    if (!selector) {
      return;
    }

    selector.addEventListener('change', async (event) => {
      const curp = event.target.value;
      await loadSelectedPatientPrescription(curp);
    });
  }

  async function loadSelectedPatientPrescription(curp) {
    selectedPatientCurp = curp || '';
    const meta = document.getElementById('prescription-patient-meta');
    const patientCard = document.getElementById('selected-patient-card');
    const patientStats = document.getElementById('patient-summary-stats');
    const medicationList = document.getElementById('doctor-medication-list');
    const historyPreview = document.getElementById('doctor-prescription-history-preview');
    const appointmentsPreview = document.getElementById('doctor-patient-appointments-preview');
    const requestsPreview = document.getElementById('doctor-patient-requests-preview');

    if (!curp) {
      if (meta) {
        meta.textContent = 'Selecciona un paciente para abrir su expediente clinico.';
      }
      if (patientCard) {
        patientCard.innerHTML = '<div class="empty-state">Aun no hay paciente seleccionado.</div>';
      }
      if (patientStats) {
        patientStats.innerHTML = renderPatientSummaryStats();
      }
      if (medicationList) {
        medicationList.innerHTML = '<div class="empty-state">Sin receta activa.</div>';
      }
      if (historyPreview) {
        historyPreview.innerHTML = '<div class="empty-state">Sin historial de recetas.</div>';
      }
      if (appointmentsPreview) {
        appointmentsPreview.innerHTML = '<div class="empty-state">Sin citas registradas.</div>';
      }
      if (requestsPreview) {
        requestsPreview.innerHTML = '<div class="empty-state">Sin solicitudes registradas.</div>';
      }
      fillClinicalProfileForm();
      expedientDetailState = { patientName: '', prescriptions: [], appointments: [], requests: [] };
      return;
    }

    try {
      const response = await window.MediAlertAPI.getPatientData(curp);
      const patient = response.patient;
      const activePrescription = patient.active_prescription;
      const medications = patient.medications || [];
      const prescriptionsHistory = patient.prescriptions_history || [];
      const appointments = patient.appointments || [];
      const requests = patient.appointment_requests || [];
      const nextAppointment = appointments
        .slice()
        .sort((left, right) => new Date(`${left.date}T${left.time}`) - new Date(`${right.date}T${right.time}`))[0];
      const latestRequest = requests[0] || null;
      const curpSummary = parseCurp(patient.curp);

      expedientDetailState = {
        patientName: patient.name,
        prescriptions: prescriptionsHistory,
        appointments,
        requests
      };

      if (meta) {
        meta.textContent = activePrescription
          ? `Expediente activo. Receta actualizada el ${formatDateTime(activePrescription.issued_at)}.`
          : 'Expediente activo sin receta medica actual.';
      }

      if (patientCard) {
        const birthDateLabel = curpSummary.isValid ? curpSummary.birthDateLabel : 'No disponible';
        const ageLabel = curpSummary.isValid ? `${curpSummary.age} anos` : 'Sin validar';
        const genderLabel = curpSummary.isValid ? curpSummary.genderLabel : 'Sin validar';
        const stateLabel = curpSummary.isValid ? curpSummary.stateLabel : 'Sin validar';
        patientCard.innerHTML = `
          <strong>${escapeHtml(patient.name)}</strong>
          <p>CURP: ${escapeHtml(patient.curp)}</p>
          <p>Diagnostico actual: ${escapeHtml(activePrescription?.diagnosis || 'Sin diagnostico')}</p>
          <p>Indicaciones generales: ${escapeHtml(activePrescription?.general_instructions || 'Sin indicaciones')}</p>
          <div class="summary-grid">
            <article class="summary-item">
              <span>Registro</span>
              <strong>${escapeHtml(formatDateTime(patient.created_at))}</strong>
            </article>
            <article class="summary-item">
              <span>Nacimiento</span>
              <strong>${escapeHtml(birthDateLabel)}</strong>
            </article>
            <article class="summary-item">
              <span>Edad estimada</span>
              <strong>${escapeHtml(ageLabel)}</strong>
            </article>
            <article class="summary-item">
              <span>Sexo / entidad</span>
              <strong>${escapeHtml(`${genderLabel} ? ${stateLabel}`)}</strong>
            </article>
          </div>
        `;
      }

      if (patientStats) {
        patientStats.innerHTML = renderPatientSummaryStats(
          prescriptionsHistory.length,
          appointments.length,
          requests.length
        );
      }

      fillClinicalProfileForm(patient);

      if (medicationList) {
        medicationList.innerHTML = medications.length
          ? medications.map((medication) => `
              <article class="med-card">
                <div>
                  <strong>${medication.emoji || '??'} ${escapeHtml(medication.name)}</strong>
                  <div class="med-meta">${medication.dose_mg} mg ? ${escapeHtml(medication.frequency || 'Frecuencia por definir')} ? ${formatTime(medication.time)}</div>
                  <p>${escapeHtml(medication.notes || 'Sin observaciones')}</p>
                </div>
                <span class="status-badge scheduled">${medication.duration_days ? `${medication.duration_days} dias` : 'Activa'}</span>
              </article>
            `).join('')
          : '<div class="empty-state">Sin medicamentos activos para este paciente.</div>';
      }

      if (historyPreview) {
        historyPreview.innerHTML = prescriptionsHistory.length
          ? renderCompactPreview(
              prescriptionsHistory.slice(0, 2).map((prescription) => ({
                title: `Receta #${prescription.id}`,
                meta: formatDateTime(prescription.issued_at),
                body: prescription.diagnosis || 'Sin diagnostico',
                badgeLabel: prescription.status === 'active' ? 'Activa' : 'Historica',
                badgeClass: prescription.status === 'active' ? 'scheduled' : 'pending'
              }))
            )
          : '<div class="empty-state">Este paciente aun no tiene recetas registradas.</div>';
      }

      if (appointmentsPreview) {
        appointmentsPreview.innerHTML = appointments.length
          ? renderCompactPreview(
              appointments.slice(0, 2).map((appointment) => ({
                title: formatDate(appointment.date),
                meta: formatTime(appointment.time),
                body: nextAppointment && appointment.id === nextAppointment.id
                  ? 'Proxima cita programada.'
                  : 'Cita registrada en el expediente.',
                badgeLabel: formatRequestStatus(appointment.status || 'scheduled'),
                badgeClass: 'scheduled'
              }))
            )
          : '<div class="empty-state">No hay citas registradas para este paciente.</div>';
      }

      if (requestsPreview) {
        requestsPreview.innerHTML = requests.length
          ? renderCompactPreview(
              requests.slice(0, 2).map((request) => ({
                title: formatDate(request.requested_date),
                meta: formatTime(request.requested_time),
                body: request.reason || 'Sin motivo especificado',
                badgeLabel: request === latestRequest
                  ? `${formatRequestStatus(request.status)} ? reciente`
                  : formatRequestStatus(request.status),
                badgeClass: request.status || 'pending'
              }))
            )
          : '<div class="empty-state">No hay solicitudes de cita para este paciente.</div>';
      }
    } catch (error) {
      if (meta) {
        meta.textContent = 'No fue posible cargar el expediente del paciente.';
      }
      if (patientCard) {
        patientCard.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      }
      if (patientStats) {
        patientStats.innerHTML = renderPatientSummaryStats();
      }
      if (medicationList) {
        medicationList.innerHTML = '<div class="empty-state">No se pudieron cargar los medicamentos.</div>';
      }
      if (historyPreview) {
        historyPreview.innerHTML = '<div class="empty-state">No se pudo cargar el historial de recetas.</div>';
      }
      if (appointmentsPreview) {
        appointmentsPreview.innerHTML = '<div class="empty-state">No se pudieron cargar las citas.</div>';
      }
      if (requestsPreview) {
        requestsPreview.innerHTML = '<div class="empty-state">No se pudieron cargar las solicitudes.</div>';
      }
      fillClinicalProfileForm();
      expedientDetailState = { patientName: '', prescriptions: [], appointments: [], requests: [] };
    }
  }

  function renderPatientSummaryStats(prescriptions = 0, appointments = 0, requests = 0) {
    return `
      <article class="stat-card">
        <span>Recetas</span>
        <strong>${prescriptions}</strong>
      </article>
      <article class="stat-card">
        <span>Citas</span>
        <strong>${appointments}</strong>
      </article>
      <article class="stat-card">
        <span>Solicitudes</span>
        <strong>${requests}</strong>
      </article>
    `;
  }

  function renderCompactPreview(items) {
    return items.map((item) => `
      <article class="compact-item">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <div class="appointment-meta">${escapeHtml(item.meta)}</div>
          <p>${escapeHtml(item.body)}</p>
        </div>
        <span class="status-badge ${item.badgeClass || 'scheduled'}">${escapeHtml(item.badgeLabel)}</span>
      </article>
    `).join('');
  }

  function bindExpedientDetailModal() {
    const modal = document.getElementById('expedient-detail-modal');
    const closeButton = document.getElementById('expedient-detail-close');
    const historyButton = document.getElementById('open-prescription-history');
    const appointmentsButton = document.getElementById('open-appointments-detail');
    const requestsButton = document.getElementById('open-requests-detail');

    if (!modal || modal.dataset.bound === 'true') {
      return;
    }

    modal.dataset.bound = 'true';

    closeButton?.addEventListener('click', closeExpedientDetailModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeExpedientDetailModal();
      }
    });

    historyButton?.addEventListener('click', () => openExpedientDetailModal('history'));
    appointmentsButton?.addEventListener('click', () => openExpedientDetailModal('appointments'));
    requestsButton?.addEventListener('click', () => openExpedientDetailModal('requests'));
  }

  function openExpedientDetailModal(type) {
    const modal = document.getElementById('expedient-detail-modal');
    const title = document.getElementById('expedient-detail-title');
    const subtitle = document.getElementById('expedient-detail-subtitle');
    const body = document.getElementById('expedient-detail-body');

    if (!modal || !body) {
      return;
    }

    if (type === 'history') {
      if (title) {
        title.textContent = 'Historial de recetas';
      }
      if (subtitle) {
        subtitle.textContent = expedientDetailState.patientName
          ? `Detalle completo de recetas para ${expedientDetailState.patientName}.`
          : 'Selecciona un paciente para ver el detalle.';
      }
      body.innerHTML = expedientDetailState.prescriptions.length
        ? expedientDetailState.prescriptions.map((prescription) => `
            <article class="appointment-card">
              <div>
                <strong>Receta #${prescription.id}</strong>
                <div class="appointment-meta">${formatDateTime(prescription.issued_at)}</div>
                <p>${escapeHtml(prescription.diagnosis || 'Sin diagnostico')}</p>
                <p>${escapeHtml(prescription.general_instructions || 'Sin indicaciones')}</p>
                <p>${prescription.items?.length || 0} medicamento(s)</p>
              </div>
              <span class="status-badge ${prescription.status === 'active' ? 'scheduled' : 'pending'}">
                ${prescription.status === 'active' ? 'Activa' : 'Historica'}
              </span>
            </article>
          `).join('')
        : '<div class="empty-state">No hay recetas registradas.</div>';
    }

    if (type === 'appointments') {
      if (title) {
        title.textContent = 'Detalle de citas';
      }
      if (subtitle) {
        subtitle.textContent = expedientDetailState.patientName
          ? `Citas registradas para ${expedientDetailState.patientName}.`
          : 'Selecciona un paciente para ver el detalle.';
      }
      body.innerHTML = expedientDetailState.appointments.length
        ? expedientDetailState.appointments.map((appointment) => `
            <article class="appointment-card">
              <div>
                <strong>${formatDate(appointment.date)}</strong>
                <div class="appointment-meta">${formatTime(appointment.time)}</div>
                <p>Cita registrada en el expediente del paciente.</p>
              </div>
              <span class="status-badge scheduled">${escapeHtml(formatRequestStatus(appointment.status || 'scheduled'))}</span>
            </article>
          `).join('')
        : '<div class="empty-state">No hay citas registradas.</div>';
    }

    if (type === 'requests') {
      if (title) {
        title.textContent = 'Detalle de solicitudes';
      }
      if (subtitle) {
        subtitle.textContent = expedientDetailState.patientName
          ? `Solicitudes de cita para ${expedientDetailState.patientName}.`
          : 'Selecciona un paciente para ver el detalle.';
      }
      body.innerHTML = expedientDetailState.requests.length
        ? expedientDetailState.requests.map((request) => `
            <article class="appointment-card">
              <div>
                <strong>${formatDate(request.requested_date)}</strong>
                <div class="appointment-meta">${formatTime(request.requested_time)}</div>
                <p>${escapeHtml(request.reason || 'Sin motivo especificado')}</p>
                ${request.doctor_response ? `<p><strong>Respuesta:</strong> ${escapeHtml(request.doctor_response)}</p>` : ''}
              </div>
              <span class="status-badge ${request.status || 'pending'}">${escapeHtml(formatRequestStatus(request.status))}</span>
            </article>
          `).join('')
        : '<div class="empty-state">No hay solicitudes registradas.</div>';
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeExpedientDetailModal() {
    const modal = document.getElementById('expedient-detail-modal');
    if (!modal) {
      return;
    }

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function bindClinicalProfileForm() {
    const form = document.getElementById('clinical-profile-form');
    if (!form || form.dataset.bound === 'true') {
      return;
    }

    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const result = document.getElementById('clinical-profile-result');
      if (!selectedPatientCurp) {
        if (result) {
          result.textContent = 'Selecciona un paciente antes de guardar el perfil clinico.';
          result.className = 'form-message error';
        }
        return;
      }

      try {
        await window.MediAlertAPI.updateClinicalProfile(selectedPatientCurp, {
          allergies: document.getElementById('clinical-allergies')?.value || '',
          medical_history: document.getElementById('clinical-history')?.value || '',
          doctor_notes: document.getElementById('clinical-notes')?.value || ''
        });

        if (result) {
          result.textContent = 'Perfil clinico guardado correctamente.';
          result.className = 'form-message success';
        }

        window.MediAlertMain.showToast('Perfil clinico actualizado', 'success');
        await loadSelectedPatientPrescription(selectedPatientCurp);
      } catch (error) {
        if (result) {
          result.textContent = error.message;
          result.className = 'form-message error';
        }
      }
    });
  }

  function fillClinicalProfileForm(patient = null) {
    const allergies = document.getElementById('clinical-allergies');
    const history = document.getElementById('clinical-history');
    const notes = document.getElementById('clinical-notes');
    const result = document.getElementById('clinical-profile-result');

    if (allergies) {
      allergies.value = patient?.allergies || '';
    }
    if (history) {
      history.value = patient?.medical_history || '';
    }
    if (notes) {
      notes.value = patient?.doctor_notes || '';
    }
    if (result) {
      result.textContent = '';
      result.className = 'form-message';
    }
  }

  function populatePatientSelect(select, patients, selectedCurp = '') {
    select.innerHTML = '<option value="">Selecciona un paciente</option>' + patients.map((patient) => `
      <option value="${patient.curp}" ${patient.curp === selectedCurp ? 'selected' : ''}>
        ${escapeHtml(patient.name)} · ${escapeHtml(patient.curp)}
      </option>
    `).join('');
  }

  function formatTime(value) {
    return String(value || '').slice(0, 5);
  }

  function formatDateTime(value) {
    if (!value) {
      return 'sin fecha';
    }

    return new Date(value).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDate(value) {
    if (!value) {
      return 'sin fecha';
    }

    const normalizedValue = String(value).includes('T') ? value : `${value}T00:00:00`;
    const parsedDate = new Date(normalizedValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return String(value);
    }

    return parsedDate.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseCurp(curp) {
    const cleanCurp = String(curp || '').toUpperCase().trim();
    const curpPattern = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
    if (!curpPattern.test(cleanCurp)) {
      return {
        isValid: false,
        error: 'La CURP debe tener 18 caracteres y una estructura valida.'
      };
    }

    const year = Number(cleanCurp.slice(4, 6));
    const month = Number(cleanCurp.slice(6, 8));
    const day = Number(cleanCurp.slice(8, 10));
    const genderCode = cleanCurp.charAt(10);
    const stateCode = cleanCurp.slice(11, 13);
    const birthYear = year <= getTwoDigitCurrentYear() ? 2000 + year : 1900 + year;
    const birthDate = new Date(birthYear, month - 1, day);

    if (
      birthDate.getFullYear() !== birthYear ||
      birthDate.getMonth() !== month - 1 ||
      birthDate.getDate() !== day
    ) {
      return {
        isValid: false,
        error: 'La fecha contenida en la CURP no es valida.'
      };
    }

    return {
      isValid: true,
      birthDateLabel: birthDate.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }),
      age: calculateAge(birthDate),
      genderLabel: genderCode === 'H' ? 'Hombre' : 'Mujer',
      stateLabel: CURP_STATE_NAMES[stateCode] || stateCode,
      homoclave: cleanCurp.slice(16),
      birthDate
    };
  }

  function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age -= 1;
    }

    return age;
  }

  function getTwoDigitCurrentYear() {
    return Number(String(new Date().getFullYear()).slice(-2));
  }

  const CURP_STATE_NAMES = {
    AS: 'Aguascalientes',
    BC: 'Baja California',
    BS: 'Baja California Sur',
    CC: 'Campeche',
    CL: 'Coahuila',
    CM: 'Colima',
    CS: 'Chiapas',
    CH: 'Chihuahua',
    DF: 'Ciudad de Mexico',
    DG: 'Durango',
    GT: 'Guanajuato',
    GR: 'Guerrero',
    HG: 'Hidalgo',
    JC: 'Jalisco',
    MC: 'Mexico',
    MN: 'Michoacan',
    MS: 'Morelos',
    NT: 'Nayarit',
    NL: 'Nuevo Leon',
    OC: 'Oaxaca',
    PL: 'Puebla',
    QT: 'Queretaro',
    QR: 'Quintana Roo',
    SP: 'San Luis Potosi',
    SL: 'Sinaloa',
    SR: 'Sonora',
    TC: 'Tabasco',
    TS: 'Tamaulipas',
    TL: 'Tlaxcala',
    VZ: 'Veracruz',
    YN: 'Yucatan',
    ZS: 'Zacatecas',
    NE: 'Nacido en el extranjero'
  };

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
