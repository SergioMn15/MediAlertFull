(function () {
  // La sección de notificaciones del panel del doctor fue eliminada.
  // Este archivo se conserva para evitar errores si alguna vista lo carga.
  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('/doctor/notifications.html')) {
      const subtitle = document.getElementById('notif-subtitle');
      if (subtitle) subtitle.textContent = 'No disponible';
    }
  });
})();

