-- Migración: Agregar status a prescription_items para control de pausa
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Migrar existentes a active
UPDATE prescription_items SET status = 'active' WHERE status IS NULL;

-- Index para performance
CREATE INDEX IF NOT EXISTS idx_prescription_items_status ON prescription_items(status);

-- Verificar migración
SELECT status, notifications_paused, COUNT(*) FROM prescription_items GROUP BY status, notifications_paused;
