-- Migración: Agregar campos para sesiones de WhatsApp
-- Fecha: 2026-04-28
-- Descripción: Agrega campos para almacenar sesiones de WhatsApp de los doctores

-- Agregar columna para saber si el doctor tiene WhatsApp conectado
ALTER TABLE doctors 
ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT FALSE;

-- Agregar columna para guardar la sesión de WhatsApp (credenciales)
ALTER TABLE doctors 
ADD COLUMN IF NOT EXISTS whatsapp_session JSONB;

-- Comentario opcional para documentación
COMMENT ON COLUMN doctors.whatsapp_connected IS 'Indica si el doctor tiene una sesión de WhatsApp activa';
COMMENT ON COLUMN doctors.whatsapp_session IS 'Datos de sesión de WhatsApp (credenciales Baileys) en formato JSON';