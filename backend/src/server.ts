import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const server = createServer(app);

// Socket.IO setup for real-time updates
const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/friday_admin',
});

// GMS API configuration
const GMS_API_BASE = process.env.GMS_API_BASE || 'http://localhost:8080';
const GMS_API_KEY = process.env.GMS_API_KEY || '';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guest_name VARCHAR(255) NOT NULL,
        guest_email VARCHAR(255),
        guest_phone VARCHAR(50),
        reservation_id VARCHAR(100),
        property_name VARCHAR(255),
        check_in DATE,
        check_out DATE,
        conversation_summary TEXT,
        language_detected VARCHAR(10) DEFAULT 'en',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
        content TEXT NOT NULL,
        content_translated TEXT,
        language VARCHAR(10) DEFAULT 'en',
        platform VARCHAR(50) DEFAULT 'guesty',
        status VARCHAR(50) DEFAULT 'received',
        ai_suggested_reply TEXT,
        ai_suggested_reply_translated TEXT,
        staff_comment TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_workflow (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL CHECK (action IN ('pending', 'approved', 'edited', 'sent', 'rejected')),
        staff_member VARCHAR(100),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// API Endpoints

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get all conversations with latest message
app.get('/api/conversations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        m.content as latest_message,
        m.direction as latest_direction,
        m.created_at as latest_message_time,
        COUNT(CASE WHEN m.direction = 'inbound' AND m.status = 'received' THEN 1 END) as unread_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE m.id = (
        SELECT id FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC LIMIT 1
      )
      OR m.id IS NULL
      ORDER BY COALESCE(m.created_at, c.created_at) DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get conversation details with all messages
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    // Get conversation details
    const conversationResult = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [conversationId]
    );
    
    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Get all messages for this conversation
    const messagesResult = await pool.query(`
      SELECT 
        m.*,
        w.action as workflow_status,
        w.staff_member,
        w.comment as workflow_comment,
        w.created_at as workflow_timestamp
      FROM messages m
      LEFT JOIN message_workflow w ON m.id = w.message_id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `, [conversationId]);
    
    const conversation = conversationResult.rows[0];
    conversation.messages = messagesResult.rows;
    
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Create new conversation (typically from webhook)
app.post('/api/conversations', async (req, res) => {
  try {
    const {
      guest_name,
      guest_email,
      guest_phone,
      reservation_id,
      property_name,
      check_in,
      check_out,
      language_detected = 'en'
    } = req.body;

    const result = await pool.query(`
      INSERT INTO conversations 
      (guest_name, guest_email, guest_phone, reservation_id, property_name, check_in, check_out, language_detected)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [guest_name, guest_email, guest_phone, reservation_id, property_name, check_in, check_out, language_detected]);

    const conversation = result.rows[0];
    
    // Broadcast new conversation to connected clients
    io.emit('new_conversation', conversation);
    
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Add message to conversation
app.post('/api/conversations/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const {
      direction,
      content,
      content_translated,
      language = 'en',
      platform = 'guesty',
      ai_suggested_reply,
      ai_suggested_reply_translated
    } = req.body;

    // Insert message
    const result = await pool.query(`
      INSERT INTO messages 
      (conversation_id, direction, content, content_translated, language, platform, ai_suggested_reply, ai_suggested_reply_translated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [conversationId, direction, content, content_translated, language, platform, ai_suggested_reply, ai_suggested_reply_translated]);

    const message = result.rows[0];

    // Update conversation updated_at
    await pool.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

    // Broadcast new message to clients in this conversation
    io.to(`conversation_${conversationId}`).emit('new_message', message);
    
    // Also broadcast to general dashboard for unread counts
    io.emit('conversation_updated', { conversationId, message });
    
    res.status(201).json(message);
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

// Generate AI reply for a message
app.post('/api/messages/:id/generate-reply', async (req, res) => {
  try {
    const messageId = req.params.id;
    const { language_override } = req.body;

    // Get message and conversation context
    const result = await pool.query(`
      SELECT m.*, c.guest_name, c.property_name, c.reservation_id, c.conversation_summary
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.id = $1
    `, [messageId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = result.rows[0];
    
    // Call GMS API to generate reply
    try {
      const gmsResponse = await axios.post(`${GMS_API_BASE}/api/generate-reply`, {
        message_content: message.content,
        guest_name: message.guest_name,
        property_name: message.property_name,
        reservation_id: message.reservation_id,
        conversation_summary: message.conversation_summary,
        target_language: language_override || message.language
      }, {
        headers: {
          'Authorization': `Bearer ${GMS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const { ai_reply_en, ai_reply_translated } = gmsResponse.data;

      // Update message with AI suggestions
      await pool.query(`
        UPDATE messages 
        SET ai_suggested_reply = $1, ai_suggested_reply_translated = $2
        WHERE id = $3
      `, [ai_reply_en, ai_reply_translated, messageId]);

      // Broadcast update
      io.to(`conversation_${message.conversation_id}`).emit('ai_reply_generated', {
        messageId,
        ai_suggested_reply: ai_reply_en,
        ai_suggested_reply_translated: ai_reply_translated
      });

      res.json({
        ai_suggested_reply: ai_reply_en,
        ai_suggested_reply_translated: ai_reply_translated
      });

    } catch (gmsError) {
      console.error('GMS API error:', gmsError);
      res.status(502).json({ error: 'Failed to generate AI reply' });
    }
  } catch (error) {
    console.error('Error generating reply:', error);
    res.status(500).json({ error: 'Failed to generate reply' });
  }
});

// Message workflow actions (approve, edit, send)
app.post('/api/messages/:id/workflow', async (req, res) => {
  try {
    const messageId = req.params.id;
    const { action, staff_member, comment, edited_content } = req.body;

    // Validate action
    const validActions = ['approved', 'edited', 'sent', 'rejected'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid workflow action' });
    }

    // Insert workflow record
    await pool.query(`
      INSERT INTO message_workflow (message_id, action, staff_member, comment)
      VALUES ($1, $2, $3, $4)
    `, [messageId, action, staff_member, comment]);

    // Handle specific actions
    if (action === 'edited' && edited_content) {
      await pool.query(`
        UPDATE messages 
        SET ai_suggested_reply = $1, staff_comment = $2
        WHERE id = $3
      `, [edited_content, comment, messageId]);
    }

    if (action === 'sent') {
      // Get the message to send
      const messageResult = await pool.query(`
        SELECT m.*, c.guest_phone, c.guest_email, c.reservation_id
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE m.id = $1
      `, [messageId]);

      const message = messageResult.rows[0];
      const replyContent = edited_content || message.ai_suggested_reply_translated || message.ai_suggested_reply;

      // Send via GMS
      try {
        await axios.post(`${GMS_API_BASE}/api/send-message`, {
          reservation_id: message.reservation_id,
          content: replyContent,
          platform: message.platform || 'guesty'
        }, {
          headers: {
            'Authorization': `Bearer ${GMS_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        // Update message status
        await pool.query(`
          UPDATE messages 
          SET status = 'sent', sent_at = NOW()
          WHERE id = $1
        `, [messageId]);

      } catch (gmsError) {
        console.error('Failed to send message via GMS:', gmsError);
        return res.status(502).json({ error: 'Failed to send message' });
      }
    }

    // Broadcast workflow update
    const updatedMessage = await pool.query(`
      SELECT m.*, w.action as workflow_status, w.staff_member, w.comment as workflow_comment
      FROM messages m
      LEFT JOIN message_workflow w ON m.id = w.message_id
      WHERE m.id = $1
      ORDER BY w.created_at DESC
      LIMIT 1
    `, [messageId]);

    io.emit('message_workflow_updated', updatedMessage.rows[0]);

    res.json({ success: true, action });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// Webhook endpoint for GMS to send new messages
app.post('/api/webhook/message', async (req, res) => {
  try {
    const {
      guest_name,
      guest_email,
      guest_phone,
      reservation_id,
      property_name,
      check_in,
      check_out,
      message_content,
      message_content_translated,
      language_detected,
      ai_suggested_reply,
      ai_suggested_reply_translated,
      platform = 'guesty'
    } = req.body;

    // Find or create conversation
    let conversation;
    const existingConv = await pool.query(
      'SELECT * FROM conversations WHERE reservation_id = $1',
      [reservation_id]
    );

    if (existingConv.rows.length > 0) {
      conversation = existingConv.rows[0];
    } else {
      const newConv = await pool.query(`
        INSERT INTO conversations 
        (guest_name, guest_email, guest_phone, reservation_id, property_name, check_in, check_out, language_detected)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [guest_name, guest_email, guest_phone, reservation_id, property_name, check_in, check_out, language_detected]);
      
      conversation = newConv.rows[0];
      io.emit('new_conversation', conversation);
    }

    // Add the message
    const messageResult = await pool.query(`
      INSERT INTO messages 
      (conversation_id, direction, content, content_translated, language, platform, ai_suggested_reply, ai_suggested_reply_translated)
      VALUES ($1, 'inbound', $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [conversation.id, message_content, message_content_translated, language_detected, platform, ai_suggested_reply, ai_suggested_reply_translated]);

    const message = messageResult.rows[0];

    // Broadcast new message
    io.to(`conversation_${conversation.id}`).emit('new_message', message);
    io.emit('conversation_updated', { conversationId: conversation.id, message });

    res.json({ success: true, conversation_id: conversation.id, message_id: message.id });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(CASE WHEN m.direction = 'inbound' AND m.status = 'received' THEN 1 END) as unread_messages,
        COUNT(CASE WHEN w.action = 'approved' THEN 1 END) as approved_pending,
        COUNT(CASE WHEN DATE(c.created_at) = CURRENT_DATE THEN 1 END) as today_conversations
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      LEFT JOIN message_workflow w ON m.id = w.message_id
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Initialize database and start server
async function startServer() {
  await initializeDatabase();
  
  server.listen(port, () => {
    console.log(`🚀 Friday Admin Backend running on port ${port}`);
    console.log(`📊 Dashboard API: http://localhost:${port}/api`);
    console.log(`🔌 WebSocket: ws://localhost:${port}`);
    console.log(`📨 GMS Integration: ${GMS_API_BASE}`);
  });
}

startServer().catch(console.error);
