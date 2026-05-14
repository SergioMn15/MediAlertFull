(function () {
  let allPatients = [];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(v) {
    return String(v ?? '').toLowerCase().trim();
  }

  function getFilters() {
    const search = document.getElementById('patients-search')?.value || '';
    const status = document.getElementById('patients-status')?.value || 'all';
    return { search, status };
  }

  function patientMatches(patient, { search, status }) {
    const name = normalizeText(patient.name);
    const curp = normalizeText(patient.curp);
    const q = normalizeText(search);

    const matchSearch = !q || name.includes(q) || curp.includes(q);

    let matchStatus = true;
    if (status === 'active') matchStatus = Number(patient.medication_count || 0) > 0;
    if (status === 'none') matchStatus = Number(patient.medication_count || 0) === 0;

    return matchSearch && matchStatus;
  }

  function renderPatients(patients) {
    const list = document.getElementById('doctor-patients-list');
    const totalTag = document.getElementById('patients-total-tag');

    if (totalTag) totalTag.textContent = `${patients.length} pacientes`;
    if (!list) return;

    list.innerHTML = patients.length
      ? patients.map((p) => {
          const hasActive = Number(p.medication_count || 0) > 0;
          const statusLabel = hasActive ? 'Con receta activa' : 'Sin receta activa';
          const statusClass = hasActive ? 'scheduled' : 'pending';

          return `
            <article class="patient-card">
              <div class="patient-card-main">
                <div class="patient-title">
                  <strong>${escapeHtml(p.name)}</strong>
                </div>
                <div class="patient-meta">CURP: ${escapeHtml(p.curp)}</div>
                <div class="patient-meta">${escapeHtml(statusLabel)} · ${escapeHtml(String(p.medication_count || 0))} meds</div>
              </div>

              <div class="patient-card-actions">
                <span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
                <button class="btn btn-outline btn-small" type="button" data-action="edit-patient" data-curp="${escapeHtml(p.curp)}" title="Editar paciente">
                  <i class="fa-solid fa-pen-to-square"></i> Editar
                </button>
                <button class="btn btn-outline btn-small" type="button" data-action="open-expedient" data-curp="${escapeHtml(p.curp)}" title="Abrir expediente">
                  <i class="fa-solid fa-notes-medical"></i> Expediente
                </button>
                <button class="btn btn-danger btn-small" type="button" data-action="delete-patient" data-curp="${escapeHtml(p.curp)}" title="Eliminar paciente">
                  <i class="fa-solid fa-trash"></i> Eliminar
                </button>
              </div>
            </article>
          `;
        }).join('')
      : '<div class="empty-state">No hay pacientes que coincidan con los filtros.</div>';

    // Bind actions
    list.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const curp = btn.dataset.curp;
        if (!action || !curp) return;

        if (action === 'open-expedient') {
          // Intento de deep-link usando localStorage; el expediente conserva compatibilidad
          try {
            localStorage.setItem('medialert_expedient_curp', curp);
          } catch (_) {}
          window.location.href = 'expedient.html';
          return;
        }

        if (action === 'edit-patient') {
          await openEditModal(curp);
          return;
        }

        if (action === 'delete-patient') {
          if (!confirm(`¿Eliminar al paciente ${curp}?`)) return;
          try {
            await window.MediAlertAPI.deletePatient(curp);
            window.MediAlertMain.showToast('Paciente eliminado', 'success');
            await loadPatients();
          } catch (e) {
            window.MediAlertMain.showToast(e.message || 'No se pudo eliminar el paciente', 'error');
          }
        }
      });
    });
  }

  async function loadPatients() {
    const patientsResp = await window.MediAlertAPI.getPatients();
    allPatients = patientsResp?.patients || [];

    const filters = getFilters();
    const filtered = allPatients.filter((p) => patientMatches(p, filters));
    renderPatients(filtered);
  }

  function bindFilters() {
    const searchInput = document.getElementById('patients-search');
    const statusSelect = document.getElementById('patients-status');

    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
          const { search, status } = getFilters();
          const filtered = allPatients.filter((p) => patientMatches(p, { search, status }));
          renderPatients(filtered);
        }, 250);
      });
    }

    statusSelect?.addEventListener('change', () => {
      const { search, status } = getFilters();
      const filtered = allPatients.filter((p) => patientMatches(p, { search, status }));
      renderPatients(filtered);
    });
  }

  function getEditModalEls() {
    return {
      modal: document.getElementById('edit-patient-modal'),
      closeBtn: document.getElementById('edit-patient-modal-close'),
      form: document.getElementById('edit-patient-form'),
      message: document.getElementById('edit-patient-message'),
      curp: document.getElementById('edit-patient-curp'),
      name: document.getElementById('edit-patient-name'),
      email: document.getElementById('edit-patient-email'),
      phone: document.getElementById('edit-patient-phone'),
      channel: document.getElementById('edit-patient-channel'),
      cancel: document.getElementById('edit-patient-cancel'),
      submit: document.getElementById('edit-patient-save')
    };
  }

  function closeEditModal() {
    const els = getEditModalEls();
    if (!els.modal) return;

    els.modal.classList.add('hidden');
    els.modal.setAttribute('aria-hidden', 'true');
    els.form?.reset?.();

    if (els.message) {
      els.message.textContent = '';
      els.message.className = 'form-message';
    }
  }

  async function openEditModal(curp) {
    const els = getEditModalEls();
    if (!els.modal || !els.form) return;

    let patientData;
    try {
      const resp = await window.MediAlertAPI.getPatientData(curp);
      patientData = resp?.patient;
    } catch (e) {
      window.MediAlertMain.showToast(e.message || 'No se pudo cargar el paciente', 'error');
      return;
    }

    els.curp.value = curp;
    els.name.value = patientData?.name || '';
    els.email.value = patientData?.email || '';
    els.phone.value = patientData?.phone || '';
    els.channel.value = patientData?.reminder_channel || 'email';

    if (els.message) {
      els.message.textContent = '';
      els.message.className = 'form-message';
    }

    els.modal.classList.remove('hidden');
    els.modal.setAttribute('aria-hidden', 'false');

    els.closeBtn.onclick = closeEditModal;
    els.cancel.onclick = closeEditModal;

    els.form.onsubmit = async (ev) => {
      ev.preventDefault();
      els.submit.disabled = true;

      try {
        const payload = {
          name: els.name.value.trim(),
          email: els.email.value.trim(),
          phone: els.phone.value.trim(),
          reminder_channel: els.channel.value
        };

        await window.MediAlertAPI.updatePatientProfile(els.curp.value, payload);
        window.MediAlertMain.showToast('Paciente actualizado', 'success');
        closeEditModal();
        await loadPatients();
      } catch (e) {
        const msg = e.message || 'No se pudo actualizar el paciente';
        if (els.message) {
          els.message.textContent = msg;
          els.message.className = 'form-message error';
        }
      } finally {
        els.submit.disabled = false;
      }
    };
  }

  function bindModalEscClose() {
    const els = getEditModalEls();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEditModal();
    });
  }

  async function initDoctorPatients() {
    const app = window.MediAlertMain;
    if (!window.location.pathname.includes('/doctor/')) return;
    if (!app?.state?.user) return;
    if (!app?.state?.user?.role || app.state.user.role !== 'doctor') return;

    bindFilters();
    await loadPatients();
    bindModalEscClose();
  }

  function bootstrap() {
    const path = window.location.pathname;
    if (!path.includes('patients.html')) return;

    const app = window.MediAlertMain;
    if (app?.state?.user && app?.state?.user.role === 'doctor') {
      initDoctorPatients();
      return;
    }

    document.addEventListener('medialert:ready', () => {
      initDoctorPatients();
    }, { once: true });
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();

