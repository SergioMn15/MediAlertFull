-- Tabla para auditar cambios de estatus en recetas y medicamentos
CREATE TABLE IF NOT EXISTS status_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL, -- 'prescription' o 'item'
    entity_id INTEGER NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    changed_by INTEGER REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);