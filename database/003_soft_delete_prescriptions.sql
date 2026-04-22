-- Migración 003: Soft-delete para prescriptions y index por status/deleted

-- Agregar columnas soft-delete si no existen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'prescriptions' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE prescriptions ADD COLUMN deleted_at TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'prescriptions' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE prescriptions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Indexes para performance (listar active/no-deleted)
CREATE INDEX IF NOT EXISTS idx_prescriptions_status_deleted 
ON prescriptions (status, deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_status 
ON prescriptions (patient_id, status) WHERE deleted_at IS NULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_prescriptions_updated_at ON prescriptions;
CREATE TRIGGER update_prescriptions_updated_at
    BEFORE UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verificar migración
SELECT 
    status, 
    COUNT(*) as count,
    COUNT(deleted_at) FILTER (WHERE deleted_at IS NOT NULL) as deleted_count
FROM prescriptions 
GROUP BY status;

VACUUM ANALYZE prescriptions;

