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
    bindRecetasPage(); // Nueva logica para /recetas.html
    await loadDoctorSummary();
  }

  function bindRecetasPage() {
    const path = window.location.pathname;
    if (!path.includes('recetas.html')) return;

    const listContainer = document.getElementById('prescription-list');
    const statsContainer = document.querySelector('.stats-grid');
    const searchInput = document.getElementById('search-prescriptions');
    const statusFilter = document.getElementById('status-filter');
    const totalStat = document.getElementById('total-prescriptions');
    const activeStat = document.getElementById('active-prescriptions');
    const pausedStat = document.getElementById('paused-prescriptions');
    const pendingStat = document.getElementById('pending-requests');

    if (!listContainer) return;

    // Bind search/filter
    const bindFilters = () => {
      let timeout;
      searchInput?.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => loadDoctorPrescriptions(e.target.value, statusFilter?.value), 300);
      });
      statusFilter?.addEventListener('change', (e) => {
        loadDoctorPrescriptions(searchInput?.value || '', e.target.value);
      });
    };

    bindFilters();

    async function loadDoctorPrescriptions(search = '', status = '') {
      listContainer.innerHTML = '<div class="loading">Cargando recetas...</div>';
      try {
        const app = window.MediAlertMain;
        const response = await window.MediAlertAPI.getDoctorPrescriptions(app.state.user.id, {
          page: 1,
          limit: 20,
          status,
          search
        });
        
        renderPrescriptionList(response.prescriptions);
        renderPrescriptionStats(response);
      } catch (error) {
        listContainer.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'No se pudieron cargar las recetas.')}</div>`;
      }
    }

    function renderPrescriptionStats(response) {
      if (totalStat) totalStat.textContent = response.pagination?.total || 0;
      if (activeStat) activeStat.textContent = response.prescriptions?.filter(p => p.status === 'active').length || 0;
      if (pendingStat) pendingStat.textContent = response.prescriptions?.filter(p => p.status === 'requested').length || 0;
      // Paused requiere query aparte o count items paused
      if (pausedStat) pausedStat.textContent = '0'; // TODO: calcular paused
    }

    function renderPrescriptionList(prescriptions) {
      listContainer.innerHTML = prescriptions.length
        ? prescriptions.map(pres => `
            <article class="prescription-card" data-prescription-id="${pres.id}">
              <div>
                <div class="flex gap-2 items-center">
                  <strong>Receta #${pres.id}</strong>
                  <span class="status-badge ${getStatusClass(pres.status)}">${getStatusLabel(pres.status)}</span>
                </div>
                <div class="prescription-meta">
                  Paciente: ${escapeHtml(pres.patient_name)} (${escapeHtml(pres.patient_curp)})
                </div>
                <div class="prescription-meta">
                  ${formatDateTime(pres.issued_at)}
                </div>
                ${pres.diagnosis ? `<p>${escapeHtml(pres.diagnosis)}</p>` : ''}
                <p>${pres.total_items || 0} medicamentos (${pres.active_items || 0} activos)</p>
              </div>
              <div class="prescription-actions">
                ${pres.status !== 'deleted' ? `
                  <button class="btn btn-outline btn-small" data-action="edit" title="Editar receta">
                    <i class="fa-solid fa-edit"></i>
                  </button>
                  <button class="btn btn-outline btn-small" data-action="pause" title="Pausar notificaciones">
                    <i class="fa-solid fa-pause"></i>
                  </button>
                  <button class="btn btn-outline btn-small" data-action="notify" data-patient-curp="${escapeHtml(pres.patient_curp)}" title="Control de notificaciones">
                    <i class="fa-solid fa-bell"></i>
                  </button>
                  <button class="btn btn-danger btn-small" data-action="delete" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : '<span class="text-muted">Eliminada</span>'}
              </div>
            </article>
          `).join('')
        : '<div class="empty-state">No hay recetas que coincidan con el filtro.</div>';

      // Bind actions
      listContainer.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async e => {
          const action = btn.dataset.action;
          const presId = btn.closest('[data-prescription-id]')?.dataset.prescriptionId;
          const patientCurp = btn.dataset.patientCurp;
          if (!action) return;
          if (action !== 'notify' && !presId) return;

          btn.disabled = true;
          try {
            if (action === 'pause') {
              const response = await window.MediAlertAPI.pauseTogglePrescription(presId);
              window.MediAlertMain.showToast(response.message, response.paused ? 'warning' : 'success');
            } else if (action === 'delete') {
              if (confirm('¿Eliminar esta receta permanentemente?')) {
                await window.MediAlertAPI.deletePrescription(presId);
                window.MediAlertMain.showToast('Receta eliminada', 'success');
              }
            } else if (action === 'edit') {
              await openEditModal(presId);
            } else if (action === 'notify') {
              await openNotificationPanel(patientCurp);
            }
            if (action !== 'notify') {
              await loadDoctorPrescriptions(searchInput?.value || '', statusFilter?.value);
            }
          } catch (err) {
            window.MediAlertMain.showToast(err.message, 'error');
          }
          btn.disabled = false;
        });
      });
    }

    async function openEditModal(presId) {
      const modal = document.getElementById('edit-prescription-modal');
      const form = document.getElementById('edit-prescription-form');
      const medicationsList = document.getElementById('edit-medications-list');

      if (!modal || !form) return;

      try {
        const response = await window.MediAlertAPI.getPrescription(presId);
        const prescription = response.prescription;

        // Guardar valores originales para comparacion al cerrar
        const originalValues = {
          diagnosis: prescription.diagnosis || '',
          generalInstructions: prescription.general_instructions || '',
          medications: (prescription.items || []).map(item => ({
            id: item.id,
            name: item.name || '',
            dose_mg: item.dose_mg || '',
            interval_hours: item.interval_hours || 24,
            time: item.time ? String(item.time).slice(0, 5) : '',
            duration_days: item.duration_days || '',
            notes: item.notes || ''
          }))
        };

        // Poblar campos basicos
        document.getElementById('edit-prescription-id').value = prescription.id;
        document.getElementById('edit-patient-name').value = `${escapeHtml(prescription.patient_name)} (${escapeHtml(prescription.patient_curp)})`;
        document.getElementById('edit-diagnosis').value = originalValues.diagnosis;
        document.getElementById('edit-general-instructions').value = originalValues.generalInstructions;

        // Estado local de medicamentos para edicion
        let editMedications = originalValues.medications.map(item => ({...item}));

        function renderEditMedications() {
          if (editMedications.length === 0) {
            medicationsList.innerHTML = '<div class="empty-state">Sin medicamentos. Agrega al menos uno.</div>';
            return;
          }

          medicationsList.innerHTML = editMedications.map((med, index) => `
            <div class="edit-medication-row" data-index="${index}" data-item-id="${med.id || ''}">
              <div class="edit-medication-header">
                <span class="edit-medication-title"><i class="fa-solid fa-pills"></i> Medicamento #${index + 1}</span>
                <button type="button" class="btn btn-danger btn-small remove-edit-medication" data-index="${index}" title="Eliminar medicamento">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
              <div class="edit-medication-grid">
                <div class="form-group">
                  <label>Nombre</label>
                  <input type="text" class="form-control edit-med-name" value="${escapeHtml(med.name)}" placeholder="Ej. Paracetamol" required>
                </div>
                <div class="form-group">
                  <label>Dosis (mg)</label>
                  <input type="number" class="form-control edit-med-dose" value="${med.dose_mg}" placeholder="500" required>
                </div>
                <div class="form-group">
                  <label>Intervalo (hrs)</label>
                  <input type="number" class="form-control edit-med-interval" value="${med.interval_hours}" placeholder="8" required>
                </div>
                <div class="form-group">
                  <label>Hora</label>
                  <input type="time" class="form-control edit-med-time" value="${med.time}" required>
                </div>
                <div class="form-group">
                  <label>Duracion (dias)</label>
                  <input type="number" class="form-control edit-med-duration" value="${med.duration_days}" placeholder="Opcional">
                </div>
              </div>
              <div class="form-group">
                <label>Notas</label>
                <textarea class="form-control edit-med-notes" rows="2" placeholder="Indicaciones adicionales">${escapeHtml(med.notes)}</textarea>
              </div>
            </div>
          `).join('');
        }

        renderEditMedications();

        // Delegacion de eventos para eliminar medicamentos
        medicationsList.onclick = (e) => {
          const btn = e.target.closest('.remove-edit-medication');
          if (!btn) return;
          const idx = Number(btn.closest('.edit-medication-row').dataset.index);
          editMedications.splice(idx, 1);
          renderEditMedications();
        };

        // Boton agregar medicamento
        const addBtn = document.getElementById('add-edit-medication');
        addBtn.onclick = () => {
          editMedications.push({
            id: null,
            name: '',
            dose_mg: '',
            interval_hours: 24,
            time: '',
            duration_days: '',
            notes: ''
          });
          renderEditMedications();
        };

        // Función para obtener los valores actuales del formulario
        function getCurrentEditValues() {
          const currentMeds = [];
          const rows = medicationsList.querySelectorAll('.edit-medication-row');
          rows.forEach(row => {
            currentMeds.push({
              id: row.dataset.itemId || null,
              name: row.querySelector('.edit-med-name')?.value.trim() || '',
              dose_mg: Number(row.querySelector('.edit-med-dose')?.value) || 0,
              interval_hours: Number(row.querySelector('.edit-med-interval')?.value) || 0,
              time: row.querySelector('.edit-med-time')?.value || '',
              duration_days: row.querySelector('.edit-med-duration')?.value || '',
              notes: row.querySelector('.edit-med-notes')?.value.trim() || ''
            });
          });
          return {
            diagnosis: document.getElementById('edit-diagnosis')?.value.trim() || '',
            generalInstructions: document.getElementById('edit-general-instructions')?.value.trim() || '',
            medications: currentMeds
          };
        }

        // Función para comparar si hay cambios reales
        function hasUnsavedChanges() {
          const current = getCurrentEditValues();
          
          // Comparar diagnóstico
          if (current.diagnosis !== originalValues.diagnosis) return true;
          
          // Comparar indicaciones generales
          if (current.generalInstructions !== originalValues.generalInstructions) return true;
          
          // Comparar número de medicamentos
          if (current.medications.length !== originalValues.medications.length) return true;
          
          // Comparar cada medicamento
          for (let i = 0; i < current.medications.length; i++) {
            const curr = current.medications[i];
            const orig = originalValues.medications[i];
            if (!orig) return true;
            if (curr.name !== orig.name || 
                curr.dose_mg !== orig.dose_mg || 
                curr.interval_hours !== orig.interval_hours ||
                curr.time !== orig.time || 
                curr.duration_days !== orig.duration_days || 
                curr.notes !== orig.notes) {
              return true;
            }
          }
          
          return false;
        }

        // Cerrar modal
        const closeModal = (force = false) => {
          // Verificar si hay cambios sin guardar
          if (!force && hasUnsavedChanges()) {
            if (!confirm('Confirmas en guardar los cambios?')) {
              return; // No cerrar si el usuario cancela
            }
          }
          
          modal.style.display = 'none';
          form.reset();
          medicationsList.innerHTML = '';
          // Limpiar handlers
          form.onsubmit = null;
          addBtn.onclick = null;
          medicationsList.onclick = null;
          modal.onclick = null;
        };

        // Botones cerrar - solo con botón explícito
        const closeButtons = modal.querySelectorAll('.close-modal, .close-modal-btn');
        closeButtons.forEach(btn => {
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal(false);
          };
        });

        // NO cerrar al hacer click en backdrop - el usuario debe usar los botones
        // Esto previene cierres accidentales mientras se edita
        modal.onclick = null;

        // Submit del form
        form.onsubmit = async (e) => {
          e.preventDefault();

          const rows = medicationsList.querySelectorAll('.edit-medication-row');
          const items = [];
          let hasError = false;

          rows.forEach(row => {
            const name = row.querySelector('.edit-med-name')?.value.trim();
            const dose_mg = Number(row.querySelector('.edit-med-dose')?.value);
            const interval_hours = Number(row.querySelector('.edit-med-interval')?.value);
            const time = row.querySelector('.edit-med-time')?.value;
            const duration_days = row.querySelector('.edit-med-duration')?.value;
            const notes = row.querySelector('.edit-med-notes')?.value.trim() || '';
            const itemId = row.dataset.itemId || null;

            if (!name || !dose_mg || !time || !interval_hours) {
              hasError = true;
              return;
            }

            items.push({
              id: itemId,
              name,
              dose_mg,
              frequency: `Cada ${interval_hours} horas`,
              interval_hours,
              time,
              duration_days: duration_days ? Number(duration_days) : null,
              notes
            });
          });

          if (hasError) {
            window.MediAlertMain.showToast('Completa nombre, dosis, intervalo y hora para todos los medicamentos.', 'error');
            return;
          }

          if (items.length === 0) {
            window.MediAlertMain.showToast('Agrega al menos un medicamento.', 'error');
            return;
          }

          // Guardar el CURP del paciente antes de cerrar el modal
          const patientCurp = prescription.patient_curp;

          try {
            await window.MediAlertAPI.updatePrescription(presId, {
              diagnosis: document.getElementById('edit-diagnosis').value.trim(),
              general_instructions: document.getElementById('edit-general-instructions').value.trim(),
              items
            });

            window.MediAlertMain.showToast('Receta actualizada correctamente.', 'success');
            closeModal();
            // Forzar recarga de la lista
            await loadDoctorPrescriptions(searchInput?.value || '', statusFilter?.value);
            
            // Actualizar panel de notificaciones si está abierto para este paciente
            if (currentNotificationPanelCurp === patientCurp) {
              await openNotificationPanel(patientCurp);
            }
          } catch (err) {
            window.MediAlertMain.showToast(err.message || 'Error al actualizar receta.', 'error');
          }
        };

        // Mostrar modal
        modal.style.display = 'flex';

      } catch (err) {
        console.error('Error abriendo modal edit:', err);
        window.MediAlertMain.showToast('No se pudo cargar la receta para editar.', 'error');
      }
    }

    function getStatusClass(status) {
      const classes = {
        'active': 'scheduled',
        'requested': 'pending', 
        'completed': 'approved',
        'paused': 'paused',
        'deleted': 'rejected'
      };
      return classes[status] || 'pending';
    }

    function getStatusLabel(status) {
      const labels = {
        'active': 'Activa',
        'requested': 'Solicitud pendiente',
        'completed': 'Completada',
        'paused': 'Pausada',
        'deleted': 'Eliminada'
      };
      return labels[status] || status;
    }

    // Inicial load
    loadDoctorPrescriptions();
  }

  // Variable para rastrear el panel de notificaciones abierto
  let currentNotificationPanelCurp = null;

  async function openNotificationPanel(curp) {
    const panel = document.getElementById('notification-panel');
    const content = document.getElementById('notification-panel-content');
    const meta = document.getElementById('notification-panel-meta');
    const closeBtn = document.getElementById('close-notification-panel');

    if (!panel || !content) return;

    // Guardar el CURP actual del panel
    currentNotificationPanelCurp = curp;

    panel.classList.remove('hidden');
    content.innerHTML = '<div class="loading">Cargando medicamentos...</div>';
    if (meta) meta.textContent = 'Paciente: ' + escapeHtml(curp);

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = 'true';
      closeBtn.addEventListener('click', () => {
        panel.classList.add('hidden');
        currentNotificationPanelCurp = null;
      });
    }

    try {
      const response = await window.MediAlertAPI.getPatientData(curp);
      const patient = response.patient;
      const activePrescription = patient.active_prescription;
      const medications = patient.medications || [];

      if (meta) {
        meta.textContent = activePrescription
          ? `Paciente: ${escapeHtml(patient.name)} · Receta #${activePrescription.id}`
          : `Paciente: ${escapeHtml(patient.name)} · Sin receta activa`;
      }

      renderNotificationControls(activePrescription, medications, content, curp);
    } catch (error) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'No se pudo cargar el control de notificaciones.')}</div>`;
    }
  }

  function renderNotificationControls(activePrescription, medications, container, curp) {
    if (!container) return;
    const allPaused = medications.length > 0 && medications.every(med => med.notifications_paused);
    container.innerHTML = medications.length
      ? [
          `<label class="switch-toggle" style="margin-bottom:10px;display:inline-flex;align-items:center;gap:0.5rem;">
            <input type="checkbox" id="pause-prescription-toggle" ${allPaused ? '' : 'checked'}>
            <span class="slider"></span>
            <span>${allPaused ? 'Receta pausada' : 'Receta activa'}</span>
          </label>`
        ]
          .concat(
            medications.map((medication) => {
              const isPaused = medication.notifications_paused ?? false;
              return `
              <article class="med-card">
                <div>
                  <strong>${escapeHtml(medication.name)}</strong>
                  <div class="med-meta">${medication.dose_mg} mg · ${escapeHtml(medication.frequency || 'Frecuencia por definir')} · ${formatTime(medication.time)}</div>
                  <p>${escapeHtml(medication.notes || 'Sin observaciones')}</p>
                </div>
                <label class="switch-toggle" style="display:inline-flex;align-items:center;gap:0.5rem;">
                  <input type="checkbox" class="pause-medication-toggle" data-item-id="${medication.id}" ${isPaused ? '' : 'checked'} ${allPaused ? 'disabled' : ''}>
                  <span class="slider"></span>
                  <span>${isPaused ? 'Notificaciones pausadas' : 'Notificaciones activas'}</span>
                </label>
                <span class="status-badge ${isPaused ? 'paused' : 'scheduled'}">
                  ${isPaused ? 'Pausado' : (medication.duration_days ? `${medication.duration_days} dias` : 'Activo')}
                </span>
              </article>
              `;
            })
          )
          .join('')
      : '<div class="empty-state">Sin medicamentos activos para este paciente.</div>';

    const pausePrescriptionToggle = document.getElementById('pause-prescription-toggle');
    if (pausePrescriptionToggle && activePrescription) {
      pausePrescriptionToggle.addEventListener('change', async () => {
        pausePrescriptionToggle.disabled = true;
        try {
          const result = await window.MediAlertAPI.pauseTogglePrescription(activePrescription.id);
          window.MediAlertMain.showToast(result.message, result.paused ? 'warning' : 'success');
          await openNotificationPanel(curp);
        } catch (err) {
          window.MediAlertMain.showToast(err.message || 'Error toggle receta', 'error');
        }
        pausePrescriptionToggle.disabled = false;
      });
    }

    container.querySelectorAll('.pause-medication-toggle').forEach((toggle) => {
      toggle.addEventListener('change', async () => {
        if (allPaused) {
          toggle.checked = false;
          return;
        }
        const itemId = toggle.getAttribute('data-item-id');
        toggle.disabled = true;
        try {
          const result = await window.MediAlertAPI.pauseToggleMedication(itemId);
          window.MediAlertMain.showToast(result.message, result.paused ? 'warning' : 'success');
          await openNotificationPanel(curp);
        } catch (err) {
          window.MediAlertMain.showToast(err.message || 'Error toggle medicamento', 'error');
        }
        toggle.disabled = false;
      });
    });
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
          <strong>${escapeHtml(item.name)}</strong>
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
    const intervalValue = Number(document.getElementById('medication-interval-input')?.value);
    const durationValue = document.getElementById('medication-duration-input')?.value;
    const time = document.getElementById('medication-time-input')?.value;
    const notes = document.getElementById('medication-notes-input')?.value.trim() || '';

    if (!name || !dose_mg || !time || !intervalValue) {
      return null;
    }

    return {
      name,
      dose_mg,
      frequency: `Cada ${intervalValue} horas`,
      interval_hours: intervalValue,
      duration_days: durationValue ? Number(durationValue) : null,
      time,
      notes
    };
  }

  function clearMedicationFields() {
    [
      'medication-name-input',
      'medication-dose-input',
      'medication-interval-input',
      'medication-duration-input',
      'medication-time-input',
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
      const email = document.getElementById('patient-email-input')?.value.trim() || '';
      const phone = document.getElementById('patient-phone-input')?.value.trim() || '';
      const reminder_channel = document.getElementById('patient-reminder-channel-input')?.value || 'email';
      const password = document.getElementById('patient-password')?.value;

      try {
        await window.MediAlertAPI.registerPatient({ curp, name, email, phone, reminder_channel, password });
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
              <strong>${escapeHtml(`${genderLabel} · ${stateLabel}`)}</strong>
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
          ? medications.map((medication) => {
              const isPaused = medication.notifications_paused ?? false;
              return `
                <article class="med-card">
                  <div>
                    <strong>${escapeHtml(medication.name)}</strong>
                    <div class="med-meta">${medication.dose_mg} mg · ${escapeHtml(medication.frequency || 'Frecuencia por definir')} · ${formatTime(medication.time)}</div>
                    <p>${escapeHtml(medication.notes || 'Sin observaciones')}</p>
                  </div>
                  <span class="status-badge ${isPaused ? 'paused' : 'scheduled'}">
                    ${isPaused ? 'Pausado' : (medication.duration_days ? `${medication.duration_days} dias` : 'Activo')}
                  </span>
                </article>
              `;
            }).join('')
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
                  ? `${formatRequestStatus(request.status)} · reciente`
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
