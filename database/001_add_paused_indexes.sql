-- Migración para asegurar columna notifications_paused y agregar índices para scheduler

-- Verificar/agregar columna notifications_paused si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prescription_items' 
    AND column_name = 'notifications_paused'
  ) THEN
    ALTER TABLE prescription_items 
    ADD COLUMN notifications_paused BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Índice para optimizar scheduler query
CREATE INDEX IF NOT EXISTS idx_prescriptions_active_items_notpaused 
ON prescription_items (prescription_id) 
WHERE notifications_paused = false;

CREATE INDEX IF NOT EXISTS idx_prescriptions_status 
ON prescriptions (status) 
WHERE status = 'active';

-- Actualizar datos existentes si necesario
UPDATE prescription_items SET notifications_paused = FALSE WHERE notifications_paused IS NULL;

VACUUM ANALYZE prescription_items;
VACUUM ANALYZE prescriptions;
