-- Friday Admin Dashboard Database Schema
-- This schema supports the complete message management workflow

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Conversations table - stores guest conversation metadata
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_name VARCHAR(255) NOT NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(50),
    reservation_id VARCHAR(100) UNIQUE,
    property_name VARCHAR(255),
    check_in DATE,
    check_out DATE,
    conversation_summary TEXT,
    language_detected VARCHAR(10) DEFAULT 'en',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table - stores all messages in conversations
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content TEXT NOT NULL,
    content_translated TEXT,
    language VARCHAR(10) DEFAULT 'en',
    platform VARCHAR(50) DEFAULT 'guesty',
    status VARCHAR(50) DEFAULT 'received',
    ai_suggested_reply TEXT,
    ai_suggested_reply_translated TEXT,
    staff_comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT messages_direction_check CHECK (direction IN ('inbound', 'outbound')),
    CONSTRAINT messages_status_check CHECK (status IN ('received', 'approved', 'sent', 'failed'))
);

-- Message workflow tracking - tracks approval/edit/send actions
CREATE TABLE IF NOT EXISTS message_workflow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL CHECK (action IN ('pending', 'approved', 'edited', 'sent', 'rejected')),
    staff_member VARCHAR(100),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT workflow_action_check CHECK (action IN ('pending', 'approved', 'edited', 'sent', 'rejected'))
);

-- Staff members table (for future authentication)
CREATE TABLE IF NOT EXISTS staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'staff',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT staff_role_check CHECK (role IN ('admin', 'manager', 'staff'))
);

-- Message templates table (for future use)
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    content_en TEXT NOT NULL,
    content_fr TEXT,
    category VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES staff_members(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_reservation_id ON conversations(reservation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_guest_name ON conversations(guest_name);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

CREATE INDEX IF NOT EXISTS idx_workflow_message_id ON message_workflow(message_id);
CREATE INDEX IF NOT EXISTS idx_workflow_created_at ON message_workflow(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_action ON message_workflow(action);

-- Insert default staff members (adjust as needed)
INSERT INTO staff_members (name, email, role) VALUES 
    ('Ishant Ayadassen', 'ishant@friday.mu', 'admin'),
    ('Franny Henri', 'franny@friday.mu', 'manager'),
    ('Mathias Duval', 'mathias@friday.mu', 'staff'),
    ('Mary Oladimeji', 'mary@friday.mu', 'staff'),
    ('Bryan Henri', 'bryan@friday.mu', 'staff'),
    ('Catherine Henri', 'catherine@friday.mu', 'staff')
ON CONFLICT (email) DO NOTHING;

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES 
    ('auto_translate', 'true', 'Enable automatic message translation'),
    ('ai_replies', 'true', 'Enable AI suggested replies'),
    ('slack_notifications', 'true', 'Send Slack notifications for new messages'),
    ('default_language', 'en', 'Default language for staff interface'),
    ('max_concurrent_conversations', '50', 'Maximum concurrent conversations to display')
ON CONFLICT (key) DO NOTHING;

-- Create triggers to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing (uncomment if needed)
/*
INSERT INTO conversations (guest_name, guest_email, reservation_id, property_name, check_in, check_out, language_detected) VALUES 
    ('Marie Dubois', 'marie@example.com', 'RES001', 'Villa Sunset', '2024-03-25', '2024-03-30', 'fr'),
    ('John Smith', 'john@example.com', 'RES002', 'Beach House', '2024-03-28', '2024-04-02', 'en'),
    ('Carlos García', 'carlos@example.com', 'RES003', 'Mountain Lodge', '2024-04-01', '2024-04-05', 'es');

INSERT INTO messages (conversation_id, direction, content, content_translated, language, ai_suggested_reply, ai_suggested_reply_translated) VALUES 
    ((SELECT id FROM conversations WHERE reservation_id = 'RES001'), 'inbound', 'Bonjour, j''ai une question sur le check-in.', 'Hello, I have a question about check-in.', 'fr', 'Hello Marie! I''d be happy to help with your check-in question. What would you like to know?', 'Bonjour Marie ! Je serais ravi de vous aider avec votre question de check-in. Que souhaiteriez-vous savoir ?'),
    ((SELECT id FROM conversations WHERE reservation_id = 'RES002'), 'inbound', 'Hi, when can we access the pool?', 'Hi, when can we access the pool?', 'en', 'Hello John! The pool is available 24/7 for your convenience. Enjoy your stay!', 'Hello John! The pool is available 24/7 for your convenience. Enjoy your stay!'),
    ((SELECT id FROM conversations WHERE reservation_id = 'RES003'), 'inbound', '¿Hay wifi en la propiedad?', 'Is there wifi in the property?', 'es', 'Yes, there is complimentary WiFi throughout the property. The password is provided in your welcome book.', 'Sí, hay WiFi gratuito en toda la propiedad. La contraseña se proporciona en su libro de bienvenida.');
*/
