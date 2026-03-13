(function () {
  async function initDoctorPage() {
    // Fix timing: Esperar main.js y user válido
    await new Promise(resolve => setTimeout(resolve, 100));
    const app = window.MediAlertMain;
    if (!window.location.pathname.includes('/doctor/')) {
      return;
    }

    if (!app?.state?.user || !app.requireRole('doctor')) {
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

    try {
      const app = window.MediAlertMain;
      const [profile, patients, appointments] = await Promise.all([
        window.MediAlertAPI.getDoctorProfile(),
        window.MediAlertAPI.getPatients(),
        window.MediAlertAPI.getDoctorAppointments(app.state.user.id)
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
    } catch (error) {
      window.MediAlertMain.showToast(error.message, 'error');
    }
  }

  function bindRegisterForm() {
    const form = document.getElementById('register-patient-form');
    if (!form) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const curp = document.getElementById('patient-curp-input').value.trim().toUpperCase();
      const name = document.getElementById('patient-name-input').value.trim();
      const password = document.getElementById('patient-password').value.trim();
      const result = document.getElementById('register-result');

      try {
        await window.MediAlertAPI.registerPatient(curp, name, password);
        result.textContent = 'Paciente registrado correctamente.';
        result.className = 'form-message success';
        form.reset();
        loadDoctorSummary();
      } catch (error) {
        result.textContent = error.message;
        result.className = 'form-message error';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initDoctorPage);
})();
