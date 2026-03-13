const MediAlert = {
  state: {
    user: null,
    token: localStorage.getItem('medialert_token')
  },
  isReady: false,

  async init() {
    await this.loadSharedComponents();
    this.updateHeader();
    this.bindCommonEvents();
    await this.restoreSession();
    this.isReady = true;
    document.dispatchEvent(new CustomEvent('medialert:ready', {
      detail: {
        user: this.state.user
      }
    }));
    this.hideLoading();
  },

  async loadSharedComponents() {
    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
      const response = await fetch(this.resolveSharedPath('shared/header.html'));
      headerContainer.innerHTML = await response.text();
    }

    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
      const isDoctor = window.location.pathname.includes('/doctor/');
      const file = isDoctor ? 'shared/sidebar-doctor.html' : 'shared/sidebar-patient.html';
      const response = await fetch(this.resolveSharedPath(file));
      sidebarContainer.innerHTML = await response.text();
      this.activateCurrentNav();
    }
  },

  resolveSharedPath(relativePath) {
    const depth = window.location.pathname.includes('/patient/') || window.location.pathname.includes('/doctor/') ? '../' : '';
    return `${depth}${relativePath}`;
  },

  bindCommonEvents() {
    document.getElementById('toggle-password')?.addEventListener('click', this.togglePasswordVisibility);
    document.getElementById('login-form')?.addEventListener('submit', (event) => this.handleLogin(event));
    document.addEventListener('click', (event) => {
      if (event.target.closest('#logout-btn')) {
        this.logout();
      }
    });

    document.addEventListener('click', (event) => {
      const navItem = event.target.closest('.nav-item');
      if (!navItem) {
        return;
      }

      const page = navItem.dataset.page;
      const base = window.location.pathname.includes('/doctor/') ? '/doctor/' : '/patient/';
      window.location.href = `${base}${page}`;
    });
  },

  async restoreSession() {
    if (!this.state.token) {
      return;
    }

    try {
      const data = await window.MediAlertAPI.verifyToken();
      const user = data.user || null;
      if (!user) {
        this.logout(false);
        return;
      }

      this.state.user = user;
      this.updateHeader();
    } catch (error) {
      this.logout(false);
    }
  },

  async handleLogin(event) {
    event.preventDefault();

    const credential = document.getElementById('credential').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      const data = await window.MediAlertAPI.login(credential, password);
      this.state.user = data.user;
      this.state.token = data.token;
      localStorage.setItem('medialert_token', data.token);
      this.showToast('Sesion iniciada', 'success');
      this.redirectByRole(data.user.role);
    } catch (error) {
      this.showToast(error.message, 'error');
    }
  },

  redirectByRole(role) {
    window.location.href = role === 'doctor' ? '/doctor/register.html' : '/patient/dashboard.html';
  },

  updateHeader() {
    const userInfo = document.getElementById('user-info');
    const logoutButton = document.getElementById('logout-btn');
    if (userInfo && this.state.user) {
      userInfo.textContent = this.state.user.name;
    }
    if (userInfo && !this.state.user) {
      userInfo.textContent = 'Acceso demo';
    }
    if (logoutButton) {
      logoutButton.style.display = this.state.user ? 'inline-flex' : 'none';
    }
  },

  activateCurrentNav() {
    const current = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.page === current);
    });
  },

  requireRole(role) {
    if (!this.state.user || this.state.user.role !== role) {
      this.logout(false);
      return false;
    }
    return true;
  },

  logout(showMessage = true) {
    localStorage.removeItem('medialert_token');
    this.state.user = null;
    this.state.token = null;
    if (showMessage) {
      this.showToast('Sesion cerrada', 'info');
    }
    window.location.href = '/';
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  },

  togglePasswordVisibility() {
    const input = document.getElementById('password');
    const icon = document.querySelector('#toggle-password i');
    if (!input || !icon) {
      return;
    }

    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  },

  hideLoading() {
    document.getElementById('loading-screen')?.classList.add('hidden');
  }
};

window.MediAlertMain = MediAlert;

document.addEventListener('DOMContentLoaded', () => {
  MediAlert.init();
});
