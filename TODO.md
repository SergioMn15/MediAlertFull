# TODO: Mover toggles de notificaciones a recetas.html

## Pasos

- [x] 1. Editar `frontend/doctor/recetas.html`: Agregar panel de notificaciones oculto y botón "Control de notificaciones" en cada tarjeta de receta activa.
- [x] 2. Editar `frontend/js/doctor-dashboard.js`:
  - [x] 2a. Crear función reutilizable `renderNotificationControls(prescription, medications, container, curp)`.
  - [x] 2b. En `bindRecetasPage()`, agregar handler para abrir el panel y cargar toggles vía `getPatientData(curp)`.
  - [x] 2c. En `loadSelectedPatientPrescription()`, eliminar toggles de `#doctor-medication-list` (dejar solo visualización de medicamentos).
- [x] 3. Verificar que `frontend/doctor/prescriptions.html` no requiera cambios estructurales (el cambio es en JS).
- [x] 4. Probar flujo completo.

