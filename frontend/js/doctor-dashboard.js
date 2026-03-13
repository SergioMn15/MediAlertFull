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
    restoreDraft();
    bindRegisterForm();
    bindRequestActions();
    bindPatientSelector();
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
    const profileBox = document.getElementById('doctor-profile');
    const patientsBox = document.getElementById('doctor-patient-list');
    const patientSelect = document.getElementById('prescription-patient-select');

    try {
      const [profile, patients] = await Promise.all([
        window.MediAlertAPI.getDoctorProfile(),
        window.MediAlertAPI.getPatients()
      ]);

      cachedPatients = patients.patients || [];

      if (patientSelect) {
        populatePatientSelect(patientSelect, cachedPatients, selectedCurp || patientSelect.value);
      }

      if (profileBox) {
        profileBox.innerHTML = `
          <div class="info-card">
            <strong>${escapeHtml(profile.doctor.name)}</strong>
            <p>${escapeHtml(profile.doctor.specialty || 'Sin especialidad registrada')}</p>
          </div>
        `;
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
    } catch (error) {
      console.error('Load summary error:', error);
    }
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
        await loadDoctorSummary();
      } catch (error) {
        window.MediAlertMain.showToast(error.message, 'error');
      }
    });
  }

  function bindRequestActions() {
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
    const meta = document.getElementById('prescription-patient-meta');
    const patientCard = document.getElementById('selected-patient-card');
    const medicationList = document.getElementById('doctor-medication-list');

    if (!curp) {
      if (meta) {
        meta.textContent = 'Selecciona un paciente para ver su receta actual.';
      }
      if (patientCard) {
        patientCard.innerHTML = '<div class="empty-state">Aun no hay paciente seleccionado.</div>';
      }
      if (medicationList) {
        medicationList.innerHTML = '<div class="empty-state">Sin receta activa.</div>';
      }
      return;
    }

    try {
      const response = await window.MediAlertAPI.getPatientData(curp);
      const patient = response.patient;
      const activePrescription = patient.active_prescription;
      const medications = patient.medications || [];

      if (meta) {
        meta.textContent = activePrescription
          ? `Receta activa actualizada el ${formatDateTime(activePrescription.issued_at)}.`
          : 'El paciente aun no tiene receta activa.';
      }

      if (patientCard) {
        patientCard.innerHTML = `
          <strong>${escapeHtml(patient.name)}</strong>
          <p>CURP: ${escapeHtml(patient.curp)}</p>
          <p>Diagnostico actual: ${escapeHtml(activePrescription?.diagnosis || 'Sin diagnostico')}</p>
          <p>Indicaciones generales: ${escapeHtml(activePrescription?.general_instructions || 'Sin indicaciones')}</p>
        `;
      }

      if (medicationList) {
        medicationList.innerHTML = medications.length
          ? medications.map((medication) => `
              <article class="med-card">
                <div>
                  <strong>${medication.emoji || '💊'} ${escapeHtml(medication.name)}</strong>
                  <div class="med-meta">${medication.dose_mg} mg · ${escapeHtml(medication.frequency || 'Frecuencia por definir')} · ${formatTime(medication.time)}</div>
                  <p>${escapeHtml(medication.notes || 'Sin observaciones')}</p>
                </div>
                <span class="status-badge scheduled">${medication.duration_days ? `${medication.duration_days} dias` : 'Activa'}</span>
              </article>
            `).join('')
          : '<div class="empty-state">Sin medicamentos activos para este paciente.</div>';
      }
    } catch (error) {
      if (meta) {
        meta.textContent = 'No fue posible cargar la receta del paciente.';
      }
      if (patientCard) {
        patientCard.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      }
      if (medicationList) {
        medicationList.innerHTML = '<div class="empty-state">No se pudieron cargar los medicamentos.</div>';
      }
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
