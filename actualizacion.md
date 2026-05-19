# Plan de Actualización — MediAlertV3

> Última revisión: 2026-05-12  
> Estado general: **En progreso**

---

## Fase 0 — Pulido visual inicial *(completado)*

> Nota: `actualizacion.md` está guardado con codificación que puede verse como “mojibake” (caracteres raros) si tu editor no interpreta UTF-8. Si pasa en VSCode, verifica **Guardar con codificación: UTF-8**.

Mejoras aplicadas al frontend sin cambiar funcionalidad.

- [x] **CSS — Nav activo mejorado**: left-border teal + gradiente sutil (antes fondo verde plano)
- [x] **CSS — Stat cards**: números más grandes (`2.1rem / 800 weight`) y etiquetas refinadas
- [x] **CSS — Feature cards**: ícono en contenedor `46×46px` redondeado con hover scale
- [x] **CSS — Toast notifications**: animación slide-in desde la derecha + layout flex
- [x] **CSS — Empty states**: más padding, fondo semitransparente, mejor tipografía
- [x] **CSS — Hover en cards**: `translateY(-2px)` + sombra suave en stat/feature cards
- [x] **CSS — Íconos del nav**: color gris → teal en hover/active con transición
- [x] **CSS — Scrollbar personalizado**: fino (5px), teal semitransparente
- [x] **CSS — `.content-actions`**: estilos para barra de búsqueda + filtro de recetas
- [x] **Sidebar doctor**: eyebrow pills eliminadas, reemplazadas por subtítulo pequeño limpio
- [x] **index.html**: tildes corregidas (`Contraseña`, `sesión`, `clínico`, `rápida`)

---

## 🔄 Fase 1 — Reorganización de módulos existentes *(pendiente)*

Reestructurar lo que ya existe para que sea más intuitivo.

### 1.1 Doctor — Página de inicio real
- [x] Crear `frontend/doctor/dashboard.html` como landing del doctor al hacer login
- [x] Cambiar el redirect post-login de `register.html` → `dashboard.html` en `main.js`
- [x] Mostrar métricas clave: pacientes activos, recetas vigentes, solicitudes pendientes
- [x] Mostrar accesos rápidos a las secciones más usadas


### 1.2 Doctor — Lista de pacientes independiente
- [x] Crear `frontend/doctor/patients.html` con tabla/grid de todos los pacientes
- [x] Búsqueda por nombre/CURP, filtro por estado
- [x ] Acceso directo al expediente desde cada fila
- [x ] Enlazar desde el sidebar y desde el dashboard


### 1.3 Recetas — Fusionar dos páginas en una
- [x] Unificar `prescriptions.html` (crear) y `recetas.html` (gestionar) en una sola página con pestañas
- [x] Pestaña "Nueva receta" = formulario actual de `prescriptions.html`
- [x] Pestaña "Gestionar recetas" = tabla/lista actual de `recetas.html`
- [ ] Actualizar sidebar y nav para apuntar a la página unificada


### 1.4 Sidebar doctor — Reorganizar y agrupar
- [ ] Agregar `Dashboard` como primer ítem
- [ ] Agregar `Mis pacientes` (nueva página)
- [ ] Ascender `Expediente clínico` (ítem 2 en lugar de 4)
- [ ] Fusionar recetas en un solo ítem
- [ ] Mover `WhatsApp` a dentro de `Configuración`
- [ ] Agregar separadores visuales entre grupos

### 1.5 Paciente — Perfil editable
- [ ] Hacer editables en `profile.html`: email, teléfono, canal preferido (WhatsApp/SMS/email)
- [ ] Añadir endpoint `PUT /api/patients/:curp/profile` en el backend si no existe
- [ ] Mostrar confirmación con toast al guardar

---

## 🆕 Fase 2 — Módulos nuevos para el Doctor *(pendiente)*

### 2.1 Doctor — Estadísticas de adherencia
- [ ] Crear `frontend/doctor/stats.html`
- [ ] Gráfica de barras: recordatorios enviados vs. tomas registradas por paciente
- [ ] Selector de paciente y rango de fechas
- [ ] Integrar librería de gráficas ligera (Chart.js o similar)
- [ ] API: reutilizar `/api/patients/:curp/reminders/overview` + nueva si falta

### 2.2 Doctor — Centro de notificaciones
- [ ] Crear `frontend/doctor/notifications.html`
- [ ] Tabla de todos los mensajes enviados (WhatsApp/SMS/email) con estado
- [ ] Filtrar por paciente, canal, fecha, estado (enviado/fallido)
- [ ] Mostrar conteo de fallos para alertar al doctor
- [ ] API: necesita nuevo endpoint `GET /api/doctors/:id/notification-logs`

### 2.3 Doctor — Configuración unificada
- [ ] Crear `frontend/doctor/settings.html`
- [ ] Sección "Perfil": nombre, especialidad, email, teléfono del doctor
- [ ] Sección "WhatsApp": absorber todo el contenido de `whatsapp-setup.html`
- [ ] Sección "Cambiar contraseña"
- [ ] Deprecar `whatsapp-setup.html` como página separada

---

## 🆕 Fase 3 — Módulos nuevos para el Paciente *(pendiente)*

### 3.1 Paciente — Registrar toma manualmente
- [ ] Agregar botón "Marcar como tomado" en cada ítem en `reminders.html`
- [ ] Llamar al API existente `POST /api/patients/:curp/medication-takes`
- [ ] Actualizar el conteo de adherencia en tiempo real sin recargar
- [ ] Mostrar feedback visual (ícono ✓, color verde) tras marcar

### 3.2 Paciente — Historial de tomas
- [ ] Crear sección dentro de `reminders.html` o página separada `history.html`
- [ ] Mostrar línea de tiempo o calendario de tomas pasadas
- [ ] Colorear: tomado (verde) / omitido (rojo) / pendiente (gris)
- [ ] API: necesita endpoint `GET /api/patients/:curp/medication-takes/history`

---

## 🔒 Fase 4 — Seguridad y calidad *(pendiente)*

- [ ] Agregar rate limiting al endpoint `/api/auth/login` (ej. `express-rate-limit`)
- [ ] Mover credenciales demo del HTML a variables de entorno o config separada
- [ ] Extraer rutas de `server.js` (642 líneas) a controllers en `backend/src/`
- [ ] Agregar paginación real en la lista de recetas del doctor (hoy está `page=1` fijo)
- [ ] Validación de entradas en backend con `joi` o `zod`
- [ ] Agregar `favicon.ico` al proyecto

---

## 🐛 Bugs conocidos / deuda técnica *(pendiente)*

- [ ] `whatsapp-setup.html` tiene estilos inline hardcodeados, fuera del sistema de diseño
- [ ] Jerarquía de headings rota: `h2` anidados dentro de secciones que ya usan `h2`
- [ ] Acento faltante en varias páginas: "Próximas citas", "Próxima toma", "Clínico", etc.
- [ ] `profile.html` paciente muestra "Proxima toma" sin tilde
- [ ] `agenda.html` muestra "proximas citas" sin tildes en el contenido dinámico
- [ ] Redirect post-login del doctor apunta a `register.html` en vez de un dashboard

---

## 📌 Resumen de progreso

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Pulido visual inicial | Completado |
| 1 | Reorganización de módulos | ⬜ Pendiente |
| 2 | Nuevos módulos — Doctor | ⬜ Pendiente |
| 3 | Nuevos módulos — Paciente | ⬜ Pendiente |
| 4 | Seguridad y calidad | ⬜ Pendiente |

---

> 💡 **Instrucciones de uso**: marcar cada ítem con `[x]` conforme se vaya completando.  
> Actualizar la tabla de resumen al terminar cada fase.
