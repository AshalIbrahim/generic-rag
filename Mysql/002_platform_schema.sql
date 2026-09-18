USE zameen;

CREATE TABLE IF NOT EXISTS tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    plan VARCHAR(40) NOT NULL DEFAULT 'trial',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    logo_url TEXT,
    primary_color VARCHAR(20) DEFAULT '#0f766e',
    contact_email VARCHAR(255),
    contact_phone VARCHAR(80),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO tenants (id, name, slug, plan, status)
VALUES (1, 'Demo Agency', 'demo-agency', 'trial', 'active');

CREATE TABLE IF NOT EXISTS accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    tenant_id INT NOT NULL DEFAULT 1,
    role VARCHAR(30) NOT NULL DEFAULT 'agent',
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(80),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_accounts_email_tenant (tenant_id, email),
    INDEX idx_accounts_tenant (tenant_id),
    CONSTRAINT fk_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

INSERT IGNORE INTO accounts (user_id, tenant_id, role, full_name, email, is_active)
SELECT id, 1, 'owner', COALESCE(email, CONCAT('User ', id)), email, TRUE
FROM users;

ALTER TABLE property_data
    ADD COLUMN IF NOT EXISTS tenant_id INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS agent_id INT NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS property_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    tenant_id INT NOT NULL DEFAULT 1,
    storage_path TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    uploaded_by INT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_property_images_property (property_id)
);

CREATE TABLE IF NOT EXISTS leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    assigned_agent_id INT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(80),
    source_channel VARCHAR(80) DEFAULT 'manual',
    status VARCHAR(40) NOT NULL DEFAULT 'new',
    budget_min DECIMAL(14,2),
    budget_max DECIMAL(14,2),
    preferred_location VARCHAR(255),
    preferences TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_leads_tenant_agent (tenant_id, assigned_agent_id),
    CONSTRAINT fk_leads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    property_id INT NOT NULL,
    lead_id INT NULL,
    agent_id INT NULL,
    buyer_name VARCHAR(255) NOT NULL,
    buyer_email VARCHAR(255),
    buyer_phone VARCHAR(80),
    sold_price DECIMAL(14,2) NOT NULL,
    commission_rate DECIMAL(8,4),
    commission_amount DECIMAL(14,2),
    closing_date DATE NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sales_tenant_agent (tenant_id, agent_id),
    CONSTRAINT fk_sales_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    lead_id INT NULL,
    assigned_agent_id INT NULL,
    session_id VARCHAR(255),
    channel VARCHAR(80) DEFAULT 'web_widget',
    bot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    unread_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_conversations_tenant_agent (tenant_id, assigned_agent_id),
    CONSTRAINT fk_conversations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    role VARCHAR(40) NOT NULL,
    content TEXT NOT NULL,
    shown_properties_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_messages_conversation (conversation_id),
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS follow_ups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    lead_id INT NOT NULL,
    assigned_agent_id INT NULL,
    title VARCHAR(255) NOT NULL,
    notes TEXT,
    due_at DATETIME NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    completed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_followups_tenant_agent (tenant_id, assigned_agent_id),
    CONSTRAINT fk_followups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS shares (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    resource_type VARCHAR(40) NOT NULL,
    resource_id INT NOT NULL,
    shared_with_account_id INT NOT NULL,
    shared_by_account_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_share (tenant_id, resource_type, resource_id, shared_with_account_id),
    INDEX idx_shares_lookup (resource_type, resource_id, shared_with_account_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    actor_account_id INT NULL,
    action VARCHAR(120) NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id INT NULL,
    metadata_json JSON NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_audit_tenant_time (tenant_id, created_at)
);

