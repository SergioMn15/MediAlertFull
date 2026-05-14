(function () {
  function getGoPath(page) {
    const base = window.location.pathname.includes('/doctor/') ? '/doctor/' : '/';
    return `${base}${page}`;
  }

  async function loadDashboardMetrics() {
    const app = window.MediAlertMain;
    if (!app?.state?.user) return;

    const activePatientsEl = document.getElementById('dashboard-active-patients');
    const activePrescriptionsEl = document.getElementById('dashboard-active-prescriptions');
    const pendingRequestsEl = document.getElementById('dashboard-pending-requests');

    try {
      const [patientsResp, prescriptionsResp, requestsResp] = await Promise.all([
        window.MediAlertAPI.getPatients(),
        window.MediAlertAPI.getDoctorPrescriptions(app.state.user.id, { page: 1, limit: 100, status: 'active' }),
        window.MediAlertAPI.getDoctorAppointmentRequests(app.state.user.id)
      ]);

      const patients = patientsResp?.patients || [];
      const prescriptions = prescriptionsResp?.prescriptions || [];
      const requests = requestsResp?.requests || [];

      if (activePatientsEl) activePatientsEl.textContent = String(patients.filter(p => !p.deleted_at).length || patients.length || 0);
      if (activePrescriptionsEl) activePrescriptionsEl.textContent = String(prescriptions.length || 0);
      if (pendingRequestsEl) pendingRequestsEl.textContent = String(requests.filter(r => r.status === 'pending').length || 0);

      return { patients, prescriptions, requests };
    } catch (e) {
      // Mantener UI sin romper
      if (activePatientsEl) activePatientsEl.textContent = '0';
      if (activePrescriptionsEl) activePrescriptionsEl.textContent = '0';
      if (pendingRequestsEl) pendingRequestsEl.textContent = '0';
      return null;
    }
  }

  async function loadRecentActivity() {
    const box = document.getElementById('doctor-recent-activity');
    if (!box) return;

    const app = window.MediAlertMain;
    if (!app?.state?.user) {
      box.innerHTML = '<div class="empty-state">Inicia sesión para ver actividad.</div>';
      return;
    }

    box.innerHTML = '<div class="empty-state">Cargando actividad...</div>';

    try {
      const [patientsResp, appointmentsResp, requestsResp] = await Promise.all([
        window.MediAlertAPI.getPatients(),
        window.MediAlertAPI.getDoctorAppointments(app.state.user.id),
        window.MediAlertAPI.getDoctorAppointmentRequests(app.state.user.id)
      ]);

      const appointments = appointmentsResp?.appointments || [];
      const requests = requestsResp?.requests || [];

      const upcoming = appointments
        .slice()
        .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`))
        .slice(0, 3);

      const pendingReq = requests
        .filter(r => r.status === 'pending')
        .slice(0, 3);

      const formatDate = (d) => {
        if (!d) return '';
        const normalized = String(d).includes('T') ? d : `${d}T00:00:00`;
        const parsed = new Date(normalized);
        if (Number.isNaN(parsed.getTime())) return String(d);
        return parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
      };

      const formatTime = (t) => String(t || '').slice(0, 5);

      const items = [
        ...upcoming.map(a => ({
          title: a.patient_name || 'Paciente',
          meta: `${formatDate(a.date)} a las ${formatTime(a.time)}`,
          body: 'Cita programada',
          badge: 'Programada'
        })),
        ...pendingReq.map(r => ({
          title: r.patient_name || 'Paciente',
          meta: `${formatDate(r.requested_date)} a las ${formatTime(r.requested_time)}`,
          body: r.reason || 'Solicitud de cita pendiente',
          badge: 'Pendiente'
        }))
      ].slice(0, 5);

      box.innerHTML = items.length
        ? items.map(it => `
            <article class="compact-item">
              <div>
                <strong>${it.title}</strong>
                <div class="appointment-meta">${it.meta}</div>
                <p>${it.body}</p>
              </div>
              <span class="status-badge scheduled">${it.badge}</span>
            </article>
          `).join('')
        : '<div class="empty-state">Aún no hay actividad reciente.</div>';
    } catch (e) {
      box.innerHTML = '<div class="empty-state">No se pudo cargar la actividad.</div>';
    }
  }

  function bindQuickNav() {
    document.querySelectorAll('[data-go]').forEach(card => {
      const page = card.getAttribute('data-go');
      if (!page) return;
      const go = () => {
        window.location.href = getGoPath(page);
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') go();
      });
    });
  }

  async function init() {
    const app = window.MediAlertMain;
    await app.init?.();

    if (!app?.state?.user) return;
    if (!app?.state?.user?.role || app.state.user.role !== 'doctor') return;

    bindQuickNav();
    await loadDashboardMetrics();
    await loadRecentActivity();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

