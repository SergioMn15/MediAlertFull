/**
 * MediAlertV3 - Frontend Application
 * Conecta con la API REST del servidor Node.js
 */

// ===== Configuración =====
const API_BASE = window.location.origin + '/api';

// ===== Estado de la App =====
const state = {
  user: null,
  token: localStorage.getItem('medialert_token'),
  patientData: null
};

// ===== Elementos del DOM =====
const elements = {
  loadingScreen: document.getElementById('loading-screen'),
  toastContainer: document.getElementById('toast-container'),
  
  // Vistas
  loginView: document.getElementById('login-view'),
  patientView: document.getElementById('patient-view'),
  doctorView: document.getElementById('doctor-view'),
  
  // Header
  userInfo: document.getElementById('user-info'),
  logoutBtn: document.getElementById('logout-btn'),
  
  // Login
  loginForm: document.getElementById('login-form'),
  credential: document.getElementById('credential'),
  password: document.getElementById('password'),
  togglePassword: document.getElementById('toggle-password'),
  
  // Doctor
  doctorName: document.getElementById('doctor-name'),
  doctorLicense: document.getElementById('doctor-license'),
  registerPatientForm: document.getElementById('register-patient-form'),
  assignMedForm: document.getElementById('assign-med-form'),
  doctorPatientList: document.getElementById('doctor-patient-list'),
  registerResult: document.getElementById('register-result'),
  assignResult: document.getElementById('assign-result'),
  
  // Doctor Profile
  profileDoctorName: document.getElementById('profile-doctor-name'),
  profileDoctorSpecialty: document.getElementById('profile-doctor-specialty'),
  profileDoctorLicense: document.getElementById('profile-doctor-license'),
  profileDoctorEmail: document.getElementById('profile-doctor-email'),
  profilePatientCount: document.getElementById('profile-patient-count'),
  
  // Doctor Appointments
  doctorAppointmentsList: document.getElementById('doctor-appointments-list'),
  
  // Patient
  patientName: document.getElementById('patient-name'),
  patientCurp: document.getElementById('patient-curp'),
  nextMedication: document.getElementById('next-medication'),
  medicationList: document.getElementById('medication-list'),
  recipeDoctor: document.getElementById('recipe-doctor'),
  recipeDate: document.getElementById('recipe-date'),
  medCount: document.getElementById('med-count'),
  aptCount: document.getElementById('apt-count'),
  wearableStatus: document.getElementById('wearable-status'),
  testAlertBtn: document.getElementById('test-alert'),
  downloadPdfBtn: document.getElementById('download-pdf'),
  
  // Patient Profile
  profilePatientName: document.getElementById('profile-patient-name'),
  profilePatientCurp: document.getElementById('profile-patient-curp'),
  memberSince: document.getElementById('member-since'),
  assignedDoctor: document.getElementById('assigned-doctor'),
  
  // Appointments
  appointmentForm: document.getElementById('appointment-form'),
  appointmentDate: document.getElementById('appointment-date'),
  appointmentTime: document.getElementById('appointment-time'),
  appointmentResult: document.getElementById('appointment-result'),
  appointmentsList: document.getElementById('appointments-list')
};

// ===== Inicialización =====
document.addEventListener('DOMContentLoaded', init);

function init() {
  setupEventListeners();
  checkAuth();
  hideLoading();
}

// ===== Event Listeners =====
function setupEventListeners() {
  // Login
  elements.loginForm.addEventListener('submit', handleLogin);
  
  // Toggle password visibility
  elements.togglePassword.addEventListener('click', () => {
    const type = elements.password.type === 'password' ? 'text' : 'password';
    elements.password.type = type;
    elements.togglePassword.innerHTML = type === 'password' 
      ? '<i class="fa-solid fa-eye"></i>' 
      : '<i class="fa-solid fa-eye-slash"></i>';
  });
  
  // Logout
  elements.logoutBtn.addEventListener('click', handleLogout);
  
  // Patient
  elements.appointmentForm.addEventListener('submit', handleBookAppointment);
  elements.testAlertBtn.addEventListener('click', handleTestAlert);
  elements.downloadPdfBtn.addEventListener('click', handleDownloadPdf);
  
  // Doctor
  elements.registerPatientForm.addEventListener('submit', handleRegisterPatient);
  elements.assignMedForm.addEventListener('submit', handleAssignMedication);
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => handleNavigation(btn));
  });
}

// ===== Autenticación =====
async function checkAuth() {
  if (!state.token) {
    showView('login');
    return;
  }

  try {
    const response = await fetch(API_BASE + '/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + state.token }
    });
    
    if (response.ok) {
      const data = await response.json();
      state.user = data.user;
      state.token = localStorage.getItem('medialert_token');
      
      if (state.user.role === 'doctor') {
        showView('doctor');
        loadDoctorData();
      } else {
        showView('patient');
        loadPatientData();
      }
    } else {
      // Token expirado o inválido
      logout();
    }
  } catch (error) {
    console.error('Error verificando auth:', error);
    // Si no hay conexión, usar modo demo
    showToast('Modo offline - conectando al servidor...', 'warning');
    showView('login');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const credential = elements.credential.value.trim();
  const password = elements.password.value.trim();
  
  if (!credential || !password) {
    showToast('Por favor ingresa tus credenciales', 'error');
    return;
  }

  try {
    const response = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      state.user = data.user;
      state.token = data.token;
      localStorage.setItem('medialert_token', data.token);
      
      showToast('¡Bienvenido ' + data.user.name + '!', 'success');
      
      if (data.user.role === 'doctor') {
        showView('doctor');
        loadDoctorData();
      } else {
        showView('patient');
        loadPatientData();
      }
      
      elements.loginForm.reset();
    } else {
      showToast(data.error || 'Credenciales incorrectas', 'error');
    }
  } catch (error) {
    console.error('Error en login:', error);
    showToast('Error de conexión. ¿El servidor está funcionando?', 'error');
  }
}

function handleLogout() {
  logout();
  showToast('Sesión cerrada correctamente', 'success');
}

function logout() {
  state.user = null;
  state.token = null;
  state.patientData = null;
  localStorage.removeItem('medialert_token');
  showView('login');
}

// ===== Navegación =====
function handleNavigation(btn) {
  const tab = btn.dataset.tab;
  const view = btn.closest('.view-container');
  
  // Actualizar botones activos
  view.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item === btn);
  });
  
  // Mostrar contenido
  view.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('hidden', content.id !== tab);
    content.classList.toggle('active', content.id === tab);
  });
  
  // Cargar datos específicos de la pestaña
  if (tab === 'patient-recipe' || tab === 'patient-appointments') {
    loadPatientData();
  }
  if (tab === 'doctor-list' || tab === 'doctor-appointments') {
    loadDoctorData();
  }
}

function showView(view) {
  elements.loginView.classList.add('hidden');
  elements.patientView.classList.add('hidden');
  elements.doctorView.classList.add('hidden');
  
  if (view === 'login') {
    elements.loginView.classList.remove('hidden');
    elements.logoutBtn.classList.add('hidden');
    elements.userInfo.textContent = '';
  } else if (view === 'patient') {
    elements.patientView.classList.remove('hidden');
    elements.logoutBtn.classList.remove('hidden');
    elements.userInfo.textContent = state.user.name;
  } else if (view === 'doctor') {
    elements.doctorView.classList.remove('hidden');
    elements.logoutBtn.classList.remove('hidden');
    elements.userInfo.textContent = state.user.name;
  }
}

// ===== Datos del Doctor =====
async function loadDoctorData() {
  if (!state.user || state.user.role !== 'doctor') return;
  
  try {
    // Cargar pacientes
    const patientsRes = await fetch(API_BASE + '/patients', {
      headers: { 'Authorization': 'Bearer ' + state.token }
    });
    const patientsData = await patientsRes.json();
    
    if (patientsData.success) {
      renderDoctorPatients(patientsData.patients);
    }
    
    // Cargar citas
    const appointmentsRes = await fetch(API_BASE + '/doctors/' + state.user.id + '/appointments', {
      headers: { 'Authorization': 'Bearer ' + state.token }
    });
    const appointmentsData = await appointmentsRes.json();
    
    if (appointmentsData.success) {
      renderDoctorAppointments(appointmentsData.appointments);
    }
    
    // Cargar perfil
    const profileRes = await fetch(API_BASE + '/doctors/profile', {
      headers: { 'Authorization': 'Bearer ' + state.token }
    });
    const profileData = await profileRes.json();
    
    if (profileData.success) {
      renderDoctorProfile(profileData.doctor);
    }
    
  } catch (error) {
    console.error('Error cargando datos del doctor:', error);
    showToast('Error al cargar datos', 'error');
  }
}

function renderDoctorPatients(patients) {
  elements.doctorName.textContent = state.user.name;
  elements.doctorLicense.textContent = state.user.license;
  
  if (!patients || patients.length === 0) {
    elements.doctorPatientList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-users-slash"></i>
        <p>No hay pacientes registrados</p>
      </div>
    `;
    return;
  }
  
  elements.doctorPatientList.innerHTML = patients.map(p => `
    <div class="patient-card">
      <div class="patient-card-header">
        <div class="patient-card-avatar">
          <i class="fa-solid fa-user"></i>
        </div>
        <div class="patient-card-info">
          <h4>${p.name}</h4>
          <p>${p.curp}</p>
        </div>
      </div>
      <div class="patient-card-stats">
        <div class="patient-stat">
          <strong>${p.medication_count}</strong>
          <span>Medicamentos</span>
        </div>
        <div class="patient-stat">
          <strong>${p.appointment_count}</strong>
          <span>Citas</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderDoctorAppointments(appointments) {
  if (!appointments || appointments.length === 0) {
    elements.doctorAppointmentsList.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-calendar-xmark"></i>
        <p>No hay citas agendadas</p>
      </div>
    `;
    return;
  }
  
  elements.doctorAppointmentsList.innerHTML = appointments.map(apt => {
    const date = new Date(apt.date);
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `
      <div class="appointment-card">
        <div class="appointment-card-date">
          <span class="day">${date.getDate()}</span>
          <span class="month">${months[date.getMonth()]}</span>
        </div>
        <div class="appointment-card-info">
          <h4>${apt.patient_name}</h4>
          <p>${apt.time.substring(0, 5)} hrs</p>
        </div>
      </div>
    `;
  }).join('');
}

function renderDoctorProfile(doctor) {
  elements.profileDoctorName.textContent = doctor.name;
  elements.profileDoctorSpecialty.textContent = doctor.specialty;
  elements.profileDoctorLicense.textContent = doctor.license;
  elements.profileDoctorEmail.textContent = doctor.email;
  elements.profilePatientCount.textContent = doctor.patient_count || 0;
}

async function handleRegisterPatient(e) {
  e.preventDefault();
  
  const curp = document.getElementById('patient-curp').value.trim().toUpperCase();
  const name = document.getElementById('patient-name').value.trim();
  const password = document.getElementById('patient-password').value.trim();
  
  if (!/^[A-Z0-9]{18}$/.test(curp)) {
    elements.registerResult.textContent = 'CURP inválida. Debe tener 18 caracteres.';
    elements.registerResult.className = 'form-message error';
    return;
  }
  
  if (password.length < 6) {
    elements.registerResult.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    elements.registerResult.className = 'form-message error';
    return;
  }
  
  try {
    const response = await fetch(API_BASE + '/patients', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ curp, name, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      elements.registerResult.textContent = data.message;
      elements.registerResult.className = 'form-message success';
      elements.registerPatientForm.reset();
      loadDoctorData(); // Recargar lista
    } else {
      elements.registerResult.textContent = data.error;
      elements.registerResult.className = 'form-message error';
    }
  } catch (error) {
    elements.registerResult.textContent = 'Error de conexión';
    elements.registerResult.className = 'form-message error';
  }
}

async function handleAssignMedication(e) {
  e.preventDefault();
  
  const curp = document.getElementById('assign-curp').value.trim().toUpperCase();
  const name = document.getElementById('med-name').value.trim();
  const dose_mg = parseInt(document.getElementById('med-dose').value);
  const time = document.getElementById('med-time').value;
  const notes = document.getElementById('med-notes').value.trim();
  const emoji = document.getElementById('med-emoji').value;
  
  if (!name || !dose_mg || !time) {
    elements.assignResult.textContent = 'Por favor completa todos los campos requeridos';
    elements.assignResult.className = 'form-message error';
    return;
  }
  
  try {
    const response = await fetch(API_BASE + '/patients/' + curp + '/medications', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ name, dose_mg, time, notes, emoji })
    });
    
    const data = await response.json();
    
    if (data.success) {
      elements.assignResult.textContent = data.message;
      elements.assignResult.className = 'form-message success';
      elements.assignMedForm.reset();
    } else {
      elements.assignResult.textContent = data.error;
      elements.assignResult.className = 'form-message error';
    }
  } catch (error) {
    elements.assignResult.textContent = 'Error de conexión';
    elements.assignResult.className = 'form-message error';
  }
}

// ===== Datos del Paciente =====
async function loadPatientData() {
  if (!state.user || state.user.role !== 'patient') return;
  
  try {
    const response = await fetch(API_BASE + '/patients/' + state.user.curp, {
      headers: { 'Authorization': 'Bearer ' + state.token }
    });
    
    const data = await response.json();
    
    if (data.success) {
      state.patientData = data.patient;
      renderPatientPanel(data.patient);
    }
  } catch (error) {
    console.error('Error cargando datos del paciente:', error);
    showToast('Error al cargar datos', 'error');
  }
}

function renderPatientPanel(patient) {
  elements.patientName.textContent = patient.name;
  elements.patientCurp.textContent = patient.curp;
  
  // Profile
  elements.profilePatientName.textContent = patient.name;
  elements.profilePatientCurp.textContent = patient.curp;
  elements.memberSince.textContent = formatDate(patient.created_at);
  
  // Medications
  const meds = patient.medications || [];
  elements.medCount.textContent = meds.length;
  
  // Next medication
  const nearest = getNearestMedication(meds);
  if (nearest) {
    elements.nextMedication.innerHTML = `
      <div class="med-info">
        <span class="med-emoji">${nearest.emoji}</span>
        <div class="med-details">
          <h4>${nearest.name} ${nearest.dose_mg} mg</h4>
          <p>Horario: ${nearest.time.substring(0, 5)} hrs</p>
          <p>${nearest.notes || 'Sin indicaciones'}</p>
        </div>
      </div>
    `;
    elements.wearableStatus.textContent = `Próxima: ${nearest.name} a las ${nearest.time.substring(0, 5)}`;
  } else {
    elements.nextMedication.innerHTML = `
      <div class="med-empty">
        <i class="fa-solid fa-check-circle"></i>
        <p>No hay medicamentos asignados</p>
      </div>
    `;
    elements.wearableStatus.textContent = 'Sin conexión';
  }
  
  // Recipe
  if (meds.length > 0) {
    const firstMed = meds[0];
    elements.recipeDoctor.innerHTML = `Doctor: <strong>${firstMed.prescribed_by || 'Por asignar'}</strong>`;
    elements.recipeDate.innerHTML = `Última actualización: <strong>${formatDate(patient.medications[0].prescribed_at)}</strong>`;
    
    elements.medicationList.innerHTML = meds.map(med => `
      <div class="med-item">
        <div class="med-item-icon">${med.emoji}</div>
        <div class="med-item-info">
          <h4>${med.name} - ${med.dose_mg} mg</h4>
          <p>
            <i class="fa-solid fa-clock"></i>
            ${med.time.substring(0, 5)} hrs
            ${med.notes ? `<span>• ${med.notes}</span>` : ''}
          </p>
        </div>
      </div>
    `).join('');
  } else {
    elements.recipeDoctor.innerHTML = 'Doctor: <span class="loading-text">Sin asignar</span>';
    elements.recipeDate.innerHTML = 'Última actualización: <span class="loading-text">N/A</span>';
    elements.medicationList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-pills"></i>
        <p>Aún no tienes medicamentos asignados</p>
      </div>
    `;
  }
  
  // Appointments
  const apts = patient.appointments || [];
  elements.aptCount.textContent = apts.length;
  
  if (apts.length > 0) {
    elements.appointmentsList.innerHTML = apts.map(apt => {
      const date = new Date(apt.date);
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `
        <div class="appointment-item">
          <div class="appointment-date">
            <span class="day">${date.getDate()}</span>
            <span class="month">${months[date.getMonth()]}</span>
          </div>
          <div class="appointment-info">
            <h4>Cita Médica</h4>
            <p>${apt.time.substring(0, 5)} hrs</p>
          </div>
        </div>
      `;
    }).join('');
  } else {
    elements.appointmentsList.innerHTML = `
      <div class="empty-state">
        <i class="fa-regular fa-calendar-xmark"></i>
        <p>No tienes citas agendadas</p>
      </div>
    `;
  }
}

async function handleBookAppointment(e) {
  e.preventDefault();
  
  const date = elements.appointmentDate.value;
  const time = elements.appointmentTime.value;
  
  if (!date || !time) {
    elements.appointmentResult.textContent = 'Por favor selecciona fecha y hora';
    elements.appointmentResult.className = 'form-message error';
    return;
  }
  
  try {
    const response = await fetch(API_BASE + '/patients/' + state.user.curp + '/appointments', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ date, time })
    });
    
    const data = await response.json();
    
    if (data.success) {
      elements.appointmentResult.textContent = data.message;
      elements.appointmentResult.className = 'form-message success';
      elements.appointmentForm.reset();
      loadPatientData(); // Recargar citas
    } else {
      elements.appointmentResult.textContent = data.error;
      elements.appointmentResult.className = 'form-message error';
    }
  } catch (error) {
    elements.appointmentResult.textContent = 'Error de conexión';
    elements.appointmentResult.className = 'form-message error';
  }
}

function handleTestAlert() {
  const testMed = {
    name: 'Paracetamol',
    dose_mg: 500,
    time: new Date().toTimeString().substring(0, 5),
    emoji: '💊'
  };
  
  showToast(`⏰ Hora de ${testMed.name} ${testMed.dose_mg}mg`, 'info');
  elements.wearableStatus.textContent = `Alerta: ${testMed.name} ${testMed.dose_mg}mg`;
}

function handleDownloadPdf() {
  if (!state.patientData) return;
  
  if (!window.jspdf) {
    showToast('Error al cargar librería PDF', 'error');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const patient = state.patientData;
  const meds = patient.medications || [];
  
  // Header
  doc.setFillColor(15, 123, 108);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('Receta Médica - MediAlert', 14, 18);
  
  // Info
  doc.setTextColor(30, 40, 40);
  doc.setFontSize(11);
  doc.text(`Fecha: ${formatDate(new Date().toISOString())}`, 14, 45);
  doc.text(`Paciente: ${patient.name}`, 14, 52);
  doc.text(`CURP: ${patient.curp}`, 14, 59);
  
  if (meds.length > 0) {
    doc.text(`Doctor: ${meds[0].prescribed_by || 'Por asignar'}`, 14, 70);
  }
  
  doc.setDrawColor(15, 123, 108);
  doc.line(14, 75, 196, 75);
  
  // Medications
  let y = 85;
  doc.setFontSize(12);
  doc.text('Medicamentos:', 14, y);
  y += 8;
  
  if (meds.length === 0) {
    doc.setFontSize(11);
    doc.text('No hay medicamentos en la receta.', 14, y);
  } else {
    meds.forEach((med, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.text(`${idx + 1}. ${med.name} - ${med.dose_mg} mg`, 18, y);
      doc.text(`   Horario: ${med.time.substring(0, 5)} hrs`, 18, y + 5);
      if (med.notes) {
        doc.text(`   Indicaciones: ${med.notes}`, 18, y + 10);
      }
      y += 18;
    });
  }
  
  doc.save(`receta-${patient.curp}.pdf`);
  showToast('Receta descargada correctamente', 'success');
}

// ===== Utilidades =====
function getNearestMedication(meds) {
  if (!meds || meds.length === 0) return null;
  
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  
  const parsed = meds.map(med => {
    const [h, m] = med.time.split(':').map(Number);
    let total = (h * 60 + m) - nowMinutes;
    if (total < 0) total += 24 * 60;
    return { ...med, remaining: total };
  });
  
  parsed.sort((a, b) => a.remaining - b.remaining);
  return parsed[0];
}

function formatDate(iso) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('es-MX', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function hideLoading() {
  setTimeout(() => {
    elements.loadingScreen.classList.add('hidden');
  }, 500);
}

// ===== Recordatorios (Intervalo) =====
setInterval(() => {
  if (state.user && state.user.role === 'patient' && state.patientData) {
    const meds = state.patientData.medications || [];
    const nearest = getNearestMedication(meds);
    
    if (nearest && nearest.remaining <= 1) {
      showToast(`⏰ Hora de ${nearest.name} ${nearest.dose_mg}mg`, 'warning');
    }
  }
}, 30000); // Revisar cada 30 segundos

