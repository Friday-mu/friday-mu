const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Rate limiting
const rateLimitMax = Number(process.env.API_RATE_LIMIT_MAX || 1000);
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number.isFinite(rateLimitMax) ? rateLimitMax : 1000 // admin UI polling can legitimately burst during module switches
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(limiter);

// ====================================================================
// GMS API Configuration
// ====================================================================
const GMS_BASE_URL = process.env.GMS_BASE_URL || 'http://admin.friday.mu:8080';
const GMS_AUTH_TOKEN = process.env.GMS_AUTH_TOKEN;

// Create axios instance for GMS API calls
const gmsAPI = axios.create({
  baseURL: GMS_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    ...(GMS_AUTH_TOKEN && { 'Authorization': `Bearer ${GMS_AUTH_TOKEN}` })
  }
});

// Request interceptor for logging
gmsAPI.interceptors.request.use(
  (config) => {
    console.log(`[GMS API] ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
gmsAPI.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(`[GMS API Error] ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}, Data:`, error.response.data);
    }
    return Promise.reject(error);
  }
);

// ====================================================================
// WebSocket Management
// ====================================================================
const connectedClients = new Set();

io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);
  connectedClients.add(socket.id);
  
  socket.on('disconnect', () => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    connectedClients.delete(socket.id);
  });
  
  // Join conversation rooms for targeted updates
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    console.log(`[WebSocket] Client ${socket.id} joined conversation ${conversationId}`);
  });
  
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`[WebSocket] Client ${socket.id} left conversation ${conversationId}`);
  });
});

// Broadcast message updates to connected clients
function broadcastUpdate(type, data, conversationId = null) {
  const payload = { type, data, timestamp: new Date().toISOString() };
  
  if (conversationId) {
    io.to(`conversation_${conversationId}`).emit('update', payload);
  } else {
    io.emit('update', payload);
  }
  
  console.log(`[Broadcast] ${type} update sent to ${conversationId ? `conversation ${conversationId}` : 'all clients'}`);
}

// ====================================================================
// Middleware
// ====================================================================
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ====================================================================
// Dashboard API Routes
// ====================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    connectedClients: connectedClients.size,
    gms_connection: GMS_BASE_URL
  });
});

// Operations task service. This route is tenant-scoped and owns real task
// execution records; Inbox pending_actions remain proposals until converted
// into tasks through this API with an idempotent external_ref.
app.use('/api/tasks', require('./src/tasks'));

// Compatibility routes for the paused Inbox frontend port. This keeps the
// selected frontend files on fad-rebuild from 404ing without importing the
// design-branch backend over Ops-owned task migrations and services.
app.use('/api', require('./src/inboxCompat')({ gmsAPI }));

// ====================================================================
// Frontend Compatibility Layer
// ====================================================================

// Get conversations (transformed from pending messages for frontend compatibility)
app.get('/api/conversations', asyncHandler(async (req, res) => {
  try {
    const response = await gmsAPI.get('/pending');
    const messages = response.data.messages || [];
    
    // Transform GMS messages into conversation format expected by frontend
    const conversationsMap = new Map();
    
    messages.forEach(message => {
      const convId = message.conversation_id || `guest_${message.guest_info?.email || 'unknown'}`;
      
      if (!conversationsMap.has(convId)) {
        conversationsMap.set(convId, {
          id: convId,
          guest_name: message.guest_info?.name || 'Unknown Guest',
          guest_email: message.guest_info?.email,
          guest_phone: message.guest_info?.phone,
          reservation_id: message.booking_context?.booking_id,
          property_name: message.booking_context?.property_id,
          check_in: message.booking_context?.check_in_date,
          check_out: message.booking_context?.check_out_date,
          language_detected: message.guest_info?.language_preference || 'en',
          status: 'pending',
          created_at: message.timestamp,
          updated_at: message.timestamp,
          latest_message: message.message_text,
          latest_direction: 'inbound',
          latest_message_time: message.timestamp,
          unread_count: 1,
          messages: []
        });
      }
      
      const conv = conversationsMap.get(convId);
      conv.messages.push({
        id: message.message_id,
        conversation_id: convId,
        direction: 'inbound',
        content: message.message_text,
        language: message.guest_info?.language_preference || 'en',
        platform: message.source || 'unknown',
        status: message.status || 'pending',
        ai_suggested_reply: message.suggested_reply,
        created_at: message.timestamp,
        workflow_status: message.workflow_status || 'pending'
      });
      
      // Update latest message time
      if (new Date(message.timestamp) > new Date(conv.latest_message_time)) {
        conv.latest_message = message.message_text;
        conv.latest_message_time = message.timestamp;
        conv.updated_at = message.timestamp;
      }
    });
    
    const conversations = Array.from(conversationsMap.values());
    conversations.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    
    res.json(conversations);
  } catch (error) {
    console.error('[API Error] Failed to fetch conversations:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations',
      details: error.message
    });
  }
}));

// Get conversation details by ID
app.get('/api/conversations/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // For now, get from pending messages and filter by conversation_id
    const response = await gmsAPI.get('/pending');
    const messages = response.data.messages || [];
    
    const conversationMessages = messages.filter(msg => 
      (msg.conversation_id === id) || 
      (`guest_${msg.guest_info?.email}` === id)
    );
    
    if (conversationMessages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    const firstMessage = conversationMessages[0];
    const conversation = {
      id: id,
      guest_name: firstMessage.guest_info?.name || 'Unknown Guest',
      guest_email: firstMessage.guest_info?.email,
      guest_phone: firstMessage.guest_info?.phone,
      reservation_id: firstMessage.booking_context?.booking_id,
      property_name: firstMessage.booking_context?.property_id,
      check_in: firstMessage.booking_context?.check_in_date,
      check_out: firstMessage.booking_context?.check_out_date,
      language_detected: firstMessage.guest_info?.language_preference || 'en',
      status: 'pending',
      created_at: firstMessage.timestamp,
      updated_at: conversationMessages[conversationMessages.length - 1].timestamp,
      messages: conversationMessages.map(msg => ({
        id: msg.message_id,
        conversation_id: id,
        direction: 'inbound',
        content: msg.message_text,
        language: msg.guest_info?.language_preference || 'en',
        platform: msg.source || 'unknown',
        status: msg.status || 'pending',
        ai_suggested_reply: msg.suggested_reply,
        created_at: msg.timestamp,
        workflow_status: msg.workflow_status || 'pending'
      }))
    };
    
    res.json(conversation);
  } catch (error) {
    console.error('[API Error] Failed to fetch conversation details:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation details',
      details: error.message
    });
  }
}));

// Get dashboard stats
app.get('/api/stats', asyncHandler(async (req, res) => {
  try {
    const response = await gmsAPI.get('/pending');
    const messages = response.data.messages || [];
    
    const today = new Date().toDateString();
    const todayMessages = messages.filter(msg => 
      new Date(msg.timestamp).toDateString() === today
    );
    
    const stats = {
      total_conversations: new Set(messages.map(msg => 
        msg.conversation_id || `guest_${msg.guest_info?.email || 'unknown'}`
      )).size,
      unread_messages: messages.filter(msg => 
        msg.status === 'pending' || msg.workflow_status === 'pending'
      ).length,
      approved_pending: messages.filter(msg => 
        msg.workflow_status === 'approved'
      ).length,
      today_conversations: new Set(todayMessages.map(msg => 
        msg.conversation_id || `guest_${msg.guest_info?.email || 'unknown'}`
      )).size
    };
    
    res.json(stats);
  } catch (error) {
    console.error('[API Error] Failed to fetch stats:', error.message);
    res.json({
      total_conversations: 0,
      unread_messages: 0,
      approved_pending: 0,
      today_conversations: 0
    });
  }
}));

// Generate AI reply for a message
app.post('/api/messages/:messageId/generate-reply', asyncHandler(async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Call GMS to regenerate reply (if such endpoint exists)
    const response = await gmsAPI.post(`/regenerate/${messageId}`);
    
    // Broadcast the update
    broadcastUpdate('ai_reply_generated', {
      messageId,
      ai_suggested_reply: response.data.suggested_reply
    });
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to generate AI reply:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI reply',
      details: error.message
    });
  }
}));

// Handle workflow actions (approve, edit, reject, send)
app.post('/api/messages/:messageId/workflow', asyncHandler(async (req, res) => {
  try {
    const { messageId } = req.params;
    const { action, staff_member, comment, edited_content } = req.body;
    
    let response;
    let broadcastType = 'message_workflow_updated';
    
    switch (action) {
      case 'sent':
      case 'approved':
        response = await gmsAPI.post(`/approve/${messageId}`, {
          modifications: edited_content,
          comment,
          staff_member
        });
        broadcastType = 'message_approved';
        break;
        
      case 'edited':
        response = await gmsAPI.post(`/edit/${messageId}`, {
          new_text: edited_content,
          comment,
          staff_member
        });
        broadcastType = 'message_edited';
        break;
        
      case 'rejected':
        response = await gmsAPI.post(`/reject/${messageId}`, {
          reason: comment || 'Rejected by staff',
          staff_member
        });
        broadcastType = 'message_rejected';
        break;
        
      default:
        throw new Error(`Unknown workflow action: ${action}`);
    }
    
    // Broadcast the workflow update
    broadcastUpdate(broadcastType, {
      messageId,
      action,
      staff_member,
      comment,
      edited_content,
      result: response.data
    });
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to process workflow action:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process workflow action',
      details: error.message
    });
  }
}));

// ====================================================================
// GMS Integration Routes
// ====================================================================

// Get all pending messages from GMS
app.get('/api/messages/pending', asyncHandler(async (req, res) => {
  try {
    const response = await gmsAPI.get('/pending');
    
    // Add conversation grouping and sorting
    const messages = response.data.messages || [];
    const groupedMessages = groupMessagesByConversation(messages);
    
    res.json({
      success: true,
      data: {
        messages: groupedMessages,
        total: messages.length,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[API Error] Failed to fetch pending messages:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending messages',
      details: error.message
    });
  }
}));

// Get conversation history
app.get('/api/messages/conversation/:conversationId', asyncHandler(async (req, res) => {
  try {
    const { conversationId } = req.params;
    const response = await gmsAPI.get(`/conversation/${conversationId}`);
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to fetch conversation:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation',
      details: error.message
    });
  }
}));

// Approve a message
app.post('/api/messages/approve/:messageId', asyncHandler(async (req, res) => {
  try {
    const { messageId } = req.params;
    const { modifications } = req.body;
    
    const response = await gmsAPI.post(`/approve/${messageId}`, {
      modifications: modifications || null
    });
    
    // Broadcast approval update to connected clients
    broadcastUpdate('message_approved', {
      messageId,
      modifications,
      result: response.data
    });
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to approve message:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to approve message',
      details: error.message
    });
  }
}));

// Edit a message
app.post('/api/messages/edit/:messageId', asyncHandler(async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newText, language } = req.body;
    
    if (!newText) {
      return res.status(400).json({
        success: false,
        error: 'New message text is required'
      });
    }
    
    const response = await gmsAPI.post(`/edit/${messageId}`, {
      new_text: newText,
      language: language || 'en'
    });
    
    // Broadcast edit update to connected clients
    broadcastUpdate('message_edited', {
      messageId,
      newText,
      language,
      result: response.data
    });
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to edit message:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to edit message',
      details: error.message
    });
  }
}));

// Reject a message
app.post('/api/messages/reject/:messageId', asyncHandler(async (req, res) => {
  try {
    const { messageId } = req.params;
    const { reason } = req.body;
    
    const response = await gmsAPI.post(`/reject/${messageId}`, {
      reason: reason || 'Rejected via dashboard'
    });
    
    // Broadcast rejection update to connected clients
    broadcastUpdate('message_rejected', {
      messageId,
      reason,
      result: response.data
    });
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to reject message:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reject message',
      details: error.message
    });
  }
}));

// Send a custom message through GMS workflow
app.post('/api/messages/send', asyncHandler(async (req, res) => {
  try {
    const { conversationId, message, language, urgency } = req.body;
    
    if (!conversationId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID and message are required'
      });
    }
    
    const response = await gmsAPI.post('/command', {
      action: 'SEND',
      conversation_id: conversationId,
      message: message,
      language: language || 'en',
      urgency: urgency || 5,
      source: 'dashboard'
    });
    
    // Broadcast send update to connected clients
    broadcastUpdate('message_sent', {
      conversationId,
      message,
      language,
      result: response.data
    }, conversationId);
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to send message:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: error.message
    });
  }
}));

// ====================================================================
// Translation Integration
// ====================================================================

// Get available languages from GMS translation service
app.get('/api/translation/languages', asyncHandler(async (req, res) => {
  try {
    const response = await gmsAPI.get('/translation/languages');
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    // Fallback to common languages if GMS translation service is unavailable
    res.json({
      success: true,
      data: {
        languages: [
          { code: 'en', name: 'English' },
          { code: 'fr', name: 'French' },
          { code: 'es', name: 'Spanish' },
          { code: 'de', name: 'German' },
          { code: 'it', name: 'Italian' },
          { code: 'pt', name: 'Portuguese' },
          { code: 'ru', name: 'Russian' },
          { code: 'ja', name: 'Japanese' },
          { code: 'ko', name: 'Korean' },
          { code: 'zh', name: 'Chinese' },
          { code: 'ar', name: 'Arabic' },
          { code: 'hi', name: 'Hindi' }
        ]
      }
    });
  }
}));

// Translate text using GMS translation service
app.post('/api/translation/translate', asyncHandler(async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;
    
    if (!text || !targetLanguage) {
      return res.status(400).json({
        success: false,
        error: 'Text and target language are required'
      });
    }
    
    const response = await gmsAPI.post('/translation/translate', {
      text,
      target_language: targetLanguage,
      source_language: sourceLanguage || 'auto'
    });
    
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[API Error] Failed to translate text:', error.message);
    res.status(500).json({
      success: false,
      error: 'Translation service unavailable',
      details: error.message
    });
  }
}));

// ====================================================================
// Analytics & Metrics
// ====================================================================

// Get dashboard analytics
app.get('/api/analytics/dashboard', asyncHandler(async (req, res) => {
  try {
    const response = await gmsAPI.get('/analytics/dashboard');
    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    // Provide fallback analytics if GMS analytics is unavailable
    res.json({
      success: true,
      data: {
        pending_messages: 0,
        resolved_today: 0,
        average_response_time: '0m',
        guest_satisfaction: '0%',
        last_updated: new Date().toISOString()
      }
    });
  }
}));

// ====================================================================
// Utility Functions
// ====================================================================

function groupMessagesByConversation(messages) {
  const grouped = {};
  
  messages.forEach(message => {
    const convId = message.conversation_id || 'unknown';
    if (!grouped[convId]) {
      grouped[convId] = {
        conversation_id: convId,
        messages: [],
        latest_message: null,
        guest_info: message.guest_info || {},
        booking_context: message.booking_context || {},
        urgency_score: 0
      };
    }
    
    grouped[convId].messages.push(message);
    
    // Update latest message and urgency score
    if (!grouped[convId].latest_message || 
        new Date(message.timestamp) > new Date(grouped[convId].latest_message.timestamp)) {
      grouped[convId].latest_message = message;
    }
    
    if (message.ai_scores && message.ai_scores.urgency > grouped[convId].urgency_score) {
      grouped[convId].urgency_score = message.ai_scores.urgency;
    }
  });
  
  // Convert to array and sort by urgency/timestamp
  return Object.values(grouped).sort((a, b) => {
    if (b.urgency_score !== a.urgency_score) {
      return b.urgency_score - a.urgency_score;
    }
    return new Date(b.latest_message?.timestamp || 0) - new Date(a.latest_message?.timestamp || 0);
  });
}

// ====================================================================
// WebSocket Polling for GMS Updates
// ====================================================================

// Poll GMS for updates every 30 seconds
let isPolling = false;
let lastPollTimestamp = null;

async function pollGMSForUpdates() {
  if (isPolling || connectedClients.size === 0) return;
  
  isPolling = true;
  try {
    const response = await gmsAPI.get('/pending');
    const messages = response.data.messages || [];
    
    // Check for new messages since last poll
    const currentTimestamp = new Date().toISOString();
    let hasNewMessages = false;
    
    if (lastPollTimestamp) {
      const newMessages = messages.filter(msg => 
        new Date(msg.timestamp) > new Date(lastPollTimestamp)
      );
      
      if (newMessages.length > 0) {
        hasNewMessages = true;
        broadcastUpdate('new_messages', {
          messages: newMessages,
          count: newMessages.length
        });
      }
    }
    
    lastPollTimestamp = currentTimestamp;
    
    if (hasNewMessages) {
      console.log(`[Polling] Broadcasted ${messages.filter(msg => 
        new Date(msg.timestamp) > new Date(lastPollTimestamp || 0)
      ).length} new messages`);
    }
    
  } catch (error) {
    console.error('[Polling Error] Failed to poll GMS for updates:', error.message);
  } finally {
    isPolling = false;
  }
}

// Start polling when server starts
const POLL_INTERVAL = 30000; // 30 seconds
setInterval(pollGMSForUpdates, POLL_INTERVAL);

// ====================================================================
// Error Handling Middleware
// ====================================================================

app.use((error, req, res, next) => {
  console.error('[Server Error]', error);
  
  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// ====================================================================
// Server Startup
// ====================================================================

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`🚀 Friday Admin Dashboard Backend running on port ${port}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🔗 GMS Integration: ${GMS_BASE_URL}`);
  console.log(`⏱️  Polling GMS every ${POLL_INTERVAL/1000} seconds`);
});
