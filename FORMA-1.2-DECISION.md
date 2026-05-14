# Decisión Fase 1.2 (Mis pacientes)

## Queremos
Edición “igual lógica actual” desde la lista/página de pacientes del doctor.

## Lo que existe en el backend
- `PUT /api/patients/:curp/clinical-profile` (perfil clínico)

## Lo que NO encontré
- Endpoint para editar perfil general (name/email/phone/reminder_channel/reminder_opt_in) con `PUT/PATCH /api/patients/:curp/...`

## Por eso
Para completar Fase 1.2 con (clínico + general), hay que crear un endpoint de perfil general.

Propuesta: `PUT /api/patients/:curp/profile`
- Body: `name, email, phone, reminder_channel, reminder_opt_in`
- Mantener misma validación/ACL que `clinical-profile`

