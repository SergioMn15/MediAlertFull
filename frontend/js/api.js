const API_BASE = `${window.location.origin}/api`;

function authHeaders(includeJson = true) {
  const headers = {};
  const token = localStorage.getItem('medialert_token');

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      ...options
    });
  } catch (networkError) {
    throw new Error('Sin conexion al servidor. Verifica tu red e intenta de nuevo.');
  }
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Error de servidor');
  }

  return data;
}

window.MediAlertAPI = {
  login(credential, password) {
    return request(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ credential, password })
    });
  },

  verifyToken() {
    return request(`${API_BASE}/auth/verify`, {
      headers: authHeaders(false)
    });
  },

  getPatientData(curp) {
    return request(`${API_BASE}/patients/${curp}`, {
      headers: authHeaders(false)
    });
  },

  getReminderOverview(curp) {
    return request(`${API_BASE}/patients/${curp}/reminders/overview`, {
      headers: authHeaders(false)
    });
  },

  bookAppointment(curp, date, time) {
    return request(`${API_BASE}/patients/${curp}/appointments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ date, time })
    });
  },

  recordMedicationTake(curp, itemId, action) {
    return request(`${API_BASE}/patients/${curp}/medication-takes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prescription_item_id: itemId, action })
    });
  },

  requestAppointment(curp, date, time, reason) {
    return request(`${API_BASE}/patients/${curp}/appointment-requests`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ date, time, reason })
    });
  },

  getPatients() {
    return request(`${API_BASE}/patients`, {
      headers: authHeaders(false)
    });
  },

  registerPatient(payload) {
    return request(`${API_BASE}/patients`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
  },

  getDoctorProfile() {
    return request(`${API_BASE}/doctors/profile`, {
      headers: authHeaders(false)
    });
  },

  getDoctorAppointments(doctorId) {
    return request(`${API_BASE}/doctors/${doctorId}/appointments`, {
      headers: authHeaders(false)
    });
  },

  getDoctorAppointmentRequests(doctorId) {
    return request(`${API_BASE}/doctors/${doctorId}/appointment-requests`, {
      headers: authHeaders(false)
    });
  },

  reviewAppointmentRequest(requestId, payload) {
    return request(`${API_BASE}/doctors/appointment-requests/${requestId}/review`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
  },

  createPrescription(payload) {
    return request(`${API_BASE}/doctors/prescriptions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
  },

  assignMedication(curp, medicationData) {
    return request(`${API_BASE}/patients/${curp}/medications`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(medicationData)
    });
  },

  updateClinicalProfile(curp, payload) {
    return request(`${API_BASE}/patients/${curp}/clinical-profile`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
  },

  healthCheck() {
    return request(`${API_BASE}/health`);
  }
};
