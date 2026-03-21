-- 1. Seed Industry Lookups
INSERT INTO industries_lookup (id, name, industry_keywords) VALUES 
(1, 'Construction', '["site", "concrete", "beam", "steel", "scaffold", "plaster", "granite"]'), 
(2, 'Manufacturing', '["assembly", "factory", "machinery", "assembly line", "quality control"]'), 
(3, 'Farming', '["crop", "harvest", "field", "tractor", "irrigation", "pipe", "fertilizer", "water"]') 
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('industries_lookup', 'id'), 3);

-- 2. Seed Task Statuses
INSERT INTO task_statuses_lookup (id, label) VALUES 
(1, 'Pending'), (2, 'In Progress'), (3, 'Review'), (4, 'Completed'), (5, 'Failed') 
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('task_statuses_lookup', 'id'), 5);

-- 3. Seed Task Severity
INSERT INTO task_severity_lookup (id, label) VALUES 
(1, 'Severe'), (2, 'Regular'), (3, 'Low') 
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('task_severity_lookup', 'id'), 3);

-- 4. Seed Task Types
INSERT INTO task_type_lookup (id, label) VALUES 
(1, 'Install'), (2, 'Repair'), (3, 'Verify'), (4, 'Clear') 
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('task_type_lookup', 'id'), 4);

-- 5. Seed Initial Master Data (Company)
INSERT INTO companies (name, industry_id) VALUES 
('Neev Constructions', 1) 
ON CONFLICT (id) DO NOTHING;

-- 6. Seed Site
INSERT INTO sites (company_id, industry_id, site_name, address) VALUES 
(1, 1, 'Site 1', 'Neev Site 1 Address, Pune') 
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Inspector
INSERT INTO inspectors (company_id, full_name, email) VALUES 
(1, 'Inspector A', 'inspectorA@neev.com') 
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- Adding new company and site for Interior Design industry

INSERT INTO industries_lookup (id, name, industry_keywords) VALUES 
(4, 'Interior Design', '["granite", "bathroom", "kitchen", "plywood", "electric point", "paint", "pop", "curtain", "wall cladding", "false ceiling", "handle", "door", "window", "flooring", "wallpaper", "tile", "cabinet", "countertop", "lighting", "sofa", "chair"]')
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('industries_lookup', 'id'), 4);

INSERT INTO companies (name, industry_id) VALUES 
('Magic Interiors', 4) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO sites (company_id, industry_id, site_name, address) VALUES 
(4, 4, 'Site 1', 'Magic Interiors Site 1 Address, Pune') 
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Inspector
INSERT INTO inspectors (company_id, full_name, email) VALUES 
(4, 'Inspector A', 'inspectorA@magicinteriors.com') 
ON CONFLICT (id) DO NOTHING;