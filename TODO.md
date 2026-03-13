# TODO - Mejoras Recetas Múltiples MediAlertV3

## Estado: ✅ En progreso (3/5 completado)

### 1. [ ] Crear TODO.md ✅ **(Completado)**
   - Seguimiento de pasos.

### 2. [✅] Optimizar frontend/js/doctor.js (Draft UI)
   - Persistir draft en localStorage.
   - Contador items, validaciones visuales.
   - Refresh auto post-submit.

### 3. [✅] Editar backend/src/routes/doctors.js (Logs + Reporte)
   - Console.log items recibidos.
   - Nueva ruta GET /reports/prescriptions para futuro.

### 4. [ ] Test manual
   - `npm start`
   - Crear receta con 3 medicamentos.
   - Verificar DB: 1 prescription + 3 items.
   - Ver lista paciente.

### 5. [ ] Limpiar TODO.md y completar ✅

**Notas:** 
- Backend ya soporta múltiples (array items → loop insert).
- Focus: UI draft + persistencia para UX doctor.
- Futuro: Notificaciones (Cron job medicamentos por time).

