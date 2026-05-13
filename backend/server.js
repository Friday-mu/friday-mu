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

// Rate limiting. Production caps at 2000 req / 15min per IP by default
// (override via RATE_LIMIT_MAX). The previous 100/15min was too tight —
// real dashboard usage easily hits 30+ API calls per project edit (load,
// hydrate, refetch on save), so 100 capped after 3-4 normal interactions.
// Dev disables the limiter entirely — HMR + StrictMode + Guesty polling
// burns through any sensible budget in seconds.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 2000,
  skip: () => process.env.NODE_ENV !== 'production',
});

// Trust the first proxy hop so req.ip respects X-Forwarded-For when the
// backend lives behind nginx in production. Required for the portal-log
// IP audit trail (Notion §B3.7) — without it req.ip is always 127.0.0.1.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(limiter);

// ====================================================================
// GMS API Configuration
// ====================================================================
// GMS lives at admin.friday.mu (both UI + API on same nginx). gms.friday.mu
// is reserved but not in use as of 2026-05. If you split API onto its own
// subdomain later, update this default + .env on every FAD backend deploy.
const GMS_BASE_URL = process.env.GMS_BASE_URL || 'https://admin.friday.mu';
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
// Guesty Open-API client (OAuth2 client-credentials)
// ====================================================================
// Service-level credentials. Tokens cached in-memory; refresh ≥60s before
// expiry. Used for direct Guesty integrations (reviews, listings, etc.)
// that don't need to route through GMS.

// GUESTY_BASE_URL convention matches friday-gms: it INCLUDES the /v1
// version prefix (e.g. https://open-api.guesty.com/v1). API calls below
// append the resource path only (e.g. '/reviews', not '/v1/reviews').
// Token endpoint sits outside /v1 (separate URL).
const GUESTY_BASE_URL = process.env.GUESTY_BASE_URL || 'https://open-api.guesty.com/v1';
const GUESTY_TOKEN_URL = process.env.GUESTY_TOKEN_URL || 'https://open-api.guesty.com/oauth2/token';

let guestyTokenCache = { token: null, expiresAt: 0 };

async function getGuestyAccessToken() {
  if (guestyTokenCache.token && Date.now() < guestyTokenCache.expiresAt - 60_000) {
    return guestyTokenCache.token;
  }
  if (!process.env.GUESTY_CLIENT_ID || !process.env.GUESTY_CLIENT_SECRET) {
    throw new Error('GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'open-api',
    client_id: process.env.GUESTY_CLIENT_ID,
    client_secret: process.env.GUESTY_CLIENT_SECRET,
  });
  const { data } = await axios.post(GUESTY_TOKEN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  guestyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
  };
  console.log(`[Guesty] OAuth token refreshed (expires in ${data.expires_in}s)`);
  return guestyTokenCache.token;
}

const guestyAPI = axios.create({ baseURL: GUESTY_BASE_URL, timeout: 30000 });
guestyAPI.interceptors.request.use(async (config) => {
  const token = await getGuestyAccessToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Dual-model translation (Kimi + Anthropic Opus). See backend/src/ai/translate.js
// for the picking heuristic. Used to render non-English reviews in English by
// default with a "Show original" toggle on the frontend.
const { translateText } = require('./src/ai/translate');

// HR routes — FAD-owned tables, direct pg access. JWT-gated per
// Director permission matrix (see src/hr/auth.js).
const hrStaffRoutes = require('./src/hr/staff');
const hrTimeOffRoutes = require('./src/hr/time-off');
app.use('/api/hr/staff', hrStaffRoutes);
app.use('/api/hr/time-off', hrTimeOffRoutes);

// Design module routes — FAD-owned tables (design_*), Director-gated.
// Sub-routers land progressively per design-be-N slices. See
// src/design/index.js for the aggregator + auth.js for the perm matrix.
const designRoutes = require('./src/design');
app.use('/api/design', designRoutes);

// Guesty listings cache — 5min TTL in memory, 1h on disk. Listings change
// rarely; the index lets us resolve raw channel listing IDs to friendly
// nicknames (MV-7, GBH-C8) in the reviews response without a per-review API
// call. Also serves /api/properties/list.
//
// Disk persistence is dev-quality-of-life — nodemon restarts wipe the in-mem
// map and Guesty's rate limit is aggressive, so a single rapid edit cycle
// can lock us out for minutes. The disk cache survives restarts and is fresh
// enough for development; production processes don't restart frequently.
const fs = require('fs');
const path = require('path');
const LISTINGS_CACHE_FILE = path.join(__dirname, '.guesty-listings-cache.json');
const LISTINGS_TTL_MS = 5 * 60 * 1000;
const LISTINGS_DISK_TTL_MS = 60 * 60 * 1000; // tolerate older data from disk

function readListingsFromDisk() {
  try {
    if (!fs.existsSync(LISTINGS_CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(LISTINGS_CACHE_FILE, 'utf-8'));
    if (!Array.isArray(raw?.listings) || typeof raw?.fetchedAt !== 'number') return null;
    if (Date.now() - raw.fetchedAt > LISTINGS_DISK_TTL_MS) return null;
    const byId = new Map();
    for (const listing of raw.listings) if (listing?._id) byId.set(String(listing._id), listing);
    return { listings: raw.listings, byId, fetchedAt: raw.fetchedAt };
  } catch { return null; }
}

function writeListingsToDisk(cache) {
  try {
    fs.writeFileSync(
      LISTINGS_CACHE_FILE,
      JSON.stringify({ listings: cache.listings, fetchedAt: cache.fetchedAt }),
      'utf-8',
    );
  } catch (e) {
    console.warn('[Guesty] Listings disk-cache write failed:', e.message);
  }
}

let guestyListingsCache = readListingsFromDisk() || { listings: [], byId: new Map(), fetchedAt: 0 };
if (guestyListingsCache.listings.length > 0) {
  console.log(`[Guesty] Listings cache hydrated from disk (${guestyListingsCache.listings.length} listings, age ${Math.round((Date.now() - guestyListingsCache.fetchedAt) / 1000)}s)`);
}

// City → cohort mapping derived from Guesty's actual `address.city` values.
// Pereybere / bel_ombre kept reserved in the Cohort type (future expansion);
// no FR property currently sits there.
function cohortFromCity(city) {
  const c = String(city || '').trim().toLowerCase();
  if (!c) return 'other';
  if (c === 'flic en flac' || c === 'flic-en-flac' || c.includes('flic en flac')) return 'flic_en_flac';
  if (c === 'grand baie' || c === 'mont choisy' || c.includes('grand baie') || c.includes('mont choisy')) return 'grand_baie';
  if (c === 'pereybere') return 'pereybere';
  if (c === 'bel ombre' || c.includes('bel ombre')) return 'bel_ombre';
  if (c === 'tamarin' || c === 'black river' || c.includes('riviere noire') || c.includes('rivière noire') || c === 'arsenal') return 'west';
  return 'other';
}

async function getGuestyListings() {
  if (guestyListingsCache.listings.length > 0 &&
      Date.now() - guestyListingsCache.fetchedAt < LISTINGS_TTL_MS) {
    return guestyListingsCache;
  }
  // FR has 24+ properties; one page covers it. Revisit if count grows past 100.
  const { data } = await guestyAPI.get('/listings', { params: { limit: 100 } });
  const listings = data?.results || (Array.isArray(data) ? data : []);
  const byId = new Map();
  for (const listing of listings) {
    if (listing?._id) byId.set(String(listing._id), listing);
  }
  guestyListingsCache = { listings, byId, fetchedAt: Date.now() };
  writeListingsToDisk(guestyListingsCache);
  console.log(`[Guesty] Listings cache refreshed (${listings.length} listings)`);
  return guestyListingsCache;
}

// ====================================================================
// requireAuth — lightweight check that an Authorization header exists.
// Real JWT validation is delegated to GMS for proxied user-scoped calls.
// For service-credential routes (Guesty direct), this gates the public
// surface so unauthenticated browsers can't hit /api/reviews/* etc.
// ====================================================================

function requireAuth(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ====================================================================
// Auth — user-scoped, proxies to GMS /api/auth/*
// ====================================================================
// User-level auth is NOT service-to-service: do not inject GMS_AUTH_TOKEN.
// FAD frontend posts {email,password} → we forward to GMS → return its JWT.
// Subsequent FAD requests carry that JWT, which GMS signs and validates.

const userGmsCall = axios.create({
  baseURL: GMS_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Log every upstream failure so 502s aren't silent in the backend logs.
// Includes whether the failure was at TCP-layer (no e.response — connection
// refused / DNS / timeout) or HTTP-layer (e.response exists with status).
function logUpstreamFailure(label, e) {
  if (e.response) {
    console.error(`[${label}] upstream ${e.response.status}:`, e.response.data || e.message);
  } else {
    console.error(`[${label}] upstream unreachable (${e.code || 'unknown'}):`, e.message);
  }
}

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  try {
    const { data } = await userGmsCall.post('/api/auth/login', req.body);
    res.json(data);
  } catch (e) {
    logUpstreamFailure('auth/login', e);
    const status = e.response?.status || 502;
    res.status(status).json({
      error: e.response?.data?.error || (e.response ? 'Login failed' : 'GMS unreachable'),
    });
  }
}));

app.get('/api/auth/me', asyncHandler(async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data } = await userGmsCall.get('/api/auth/me', { headers: { Authorization: auth } });
    res.json(data);
  } catch (e) {
    logUpstreamFailure('auth/me', e);
    const status = e.response?.status || 502;
    res.status(status).json({
      error: e.response?.data?.error || (e.response ? 'Auth check failed' : 'GMS unreachable'),
    });
  }
}));

app.post('/api/auth/logout', (req, res) => {
  // JWT is client-side; clearing localStorage in the frontend is sufficient.
  // Endpoint exists so the frontend has a single conventional path.
  res.json({ ok: true });
});

// ====================================================================
// Inbox — proxies to GMS, forwards the end-user JWT (no service token).
// ====================================================================
// User-scoped: GMS validates the JWT and applies RLS. FAD backend stays
// stateless — just a pass-through with auth headers preserved.

function userScopedGms(req) {
  return axios.create({
    baseURL: GMS_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: req.headers.authorization,
    },
  });
}

async function gmsProxy(req, res, gmsPath, method = 'get') {
  try {
    const client = userScopedGms(req);
    const opts = method === 'get' ? { params: req.query } : {};
    const { data } = await (method === 'get'
      ? client.get(gmsPath, opts)
      : client[method](gmsPath, req.body));
    res.json(data);
  } catch (e) {
    logUpstreamFailure(`inbox ${method.toUpperCase()} ${gmsPath}`, e);
    const status = e.response?.status || 502;
    res.status(status).json({
      error: e.response?.data?.error || e.message || (e.response ? 'Upstream error' : 'GMS unreachable'),
    });
  }
}

app.get('/api/inbox/conversations', requireAuth, asyncHandler((req, res) =>
  gmsProxy(req, res, '/api/conversations')
));

app.get('/api/inbox/conversations/:id', requireAuth, asyncHandler((req, res) =>
  gmsProxy(req, res, `/api/conversations/${req.params.id}`)
));

app.get('/api/inbox/conversations/:id/messages', requireAuth, asyncHandler((req, res) =>
  gmsProxy(req, res, `/api/conversations/${req.params.id}/messages`)
));

app.get('/api/inbox/conversations/:id/reservation', requireAuth, asyncHandler((req, res) =>
  gmsProxy(req, res, `/api/conversations/${req.params.id}/reservation`)
));

// ====================================================================
// Reviews — Guesty direct (service credentials)
// ====================================================================
// Guesty Open-API path: GET /v1/reviews. Pass-through pagination via query.
// Returns the raw Guesty shape; transformation to FAD's Review interface
// happens in `_data/reviews.ts` so the contract is owned by the frontend.

app.get('/api/reviews/list', requireAuth, asyncHandler(async (req, res) => {
  try {
    // Reviews + listings fetched in parallel. If listings fail, reviews still
    // return with raw listing IDs — degrades gracefully rather than 502'ing.
    const [reviewsResp, listingsIndex] = await Promise.all([
      guestyAPI.get('/reviews', { params: req.query }),
      getGuestyListings().catch((e) => {
        logUpstreamFailure('listings (during reviews enrichment)', e);
        return { byId: new Map() };
      }),
    ]);
    // Guesty's envelope shape varies — reviews land in `data` (current), but
    // we keep `results` and top-level array as fallbacks. Whichever field
    // held them gets overwritten with the enriched list; other fields pass
    // through untouched (pagination metadata etc).
    const payload = reviewsResp.data;
    let listKey = null;
    let list = null;
    if (Array.isArray(payload?.results)) { listKey = 'results'; list = payload.results; }
    else if (Array.isArray(payload?.reviews)) { listKey = 'reviews'; list = payload.reviews; }
    else if (Array.isArray(payload?.data)) { listKey = 'data'; list = payload.data; }
    else if (Array.isArray(payload)) { list = payload; }
    else { list = []; }
    const enriched = list.map((rv) => {
      const listing = rv?.listingId ? listingsIndex.byId.get(String(rv.listingId)) : null;
      if (!listing) return rv;
      return {
        ...rv,
        propertyNickname: listing.nickname || undefined,
        propertyTitle: listing.title || undefined,
        propertyAddress: listing.address?.full || listing.address?.formatted || undefined,
        propertyCity: listing.address?.city || undefined,
        propertyCohort: cohortFromCity(listing.address?.city),
      };
    });
    if (listKey) {
      res.json({ ...payload, [listKey]: enriched });
    } else {
      res.json(enriched);
    }
  } catch (e) {
    logUpstreamFailure('reviews/list (Guesty)', e);
    const status = e.response?.status || 502;
    res.status(status).json({
      error: e.response?.data?.error || e.message || (e.response ? 'Reviews fetch failed' : 'Guesty unreachable'),
    });
  }
}));

// ====================================================================
// Properties — Guesty direct (service credentials)
// ====================================================================
// Returns Guesty listings (cached, 5min TTL). Same backing store as the
// review-enrichment join, so calling /properties/list warms the cache for
// the next /reviews/list and vice-versa.

app.get('/api/properties/list', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { listings } = await getGuestyListings();
    res.json({ results: listings });
  } catch (e) {
    logUpstreamFailure('properties/list (Guesty)', e);
    const status = e.response?.status || 502;
    res.status(status).json({
      error: e.response?.data?.error || e.message || (e.response ? 'Properties fetch failed' : 'Guesty unreachable'),
    });
  }
}));

// ====================================================================
// System status — replaces hardcoded "configured" placeholders in the
// Settings UI with reality. Reports which integrations have credentials
// in backend/.env, the live Guesty token + listings-cache state, and a
// channel breakdown derived from the cached listings.
//
// Never exposes the secrets themselves — only "configured: true/false"
// + non-sensitive metadata (last refresh, cache size).
// ====================================================================

function envConfigured(...keys) {
  return keys.every((k) => !!process.env[k] && process.env[k] !== `your_${k.toLowerCase()}_here`);
}

app.get('/api/system/status', requireAuth, asyncHandler(async (req, res) => {
  const cache = guestyListingsCache;
  // Channel breakdown from cached listings' integrations[] array.
  const channelCounts = {};
  for (const l of cache.listings) {
    const integrations = Array.isArray(l.integrations) ? l.integrations : [];
    for (const i of integrations) {
      const t = String(i?.platform || i?.type || '').toLowerCase();
      if (!t) continue;
      channelCounts[t] = (channelCounts[t] || 0) + 1;
    }
    // Listings without integrations[] still indicate at least a direct presence.
    if (integrations.length === 0) {
      channelCounts.unlisted = (channelCounts.unlisted || 0) + 1;
    }
  }

  res.json({
    guesty: {
      configured: envConfigured('GUESTY_CLIENT_ID', 'GUESTY_CLIENT_SECRET'),
      baseUrl: GUESTY_BASE_URL,
      tokenCached: !!guestyTokenCache.token,
      tokenExpiresAt: guestyTokenCache.expiresAt
        ? new Date(guestyTokenCache.expiresAt).toISOString() : null,
      listingsCached: cache.listings.length,
      listingsLastRefreshAt: cache.fetchedAt
        ? new Date(cache.fetchedAt).toISOString() : null,
    },
    gms: {
      configured: envConfigured('GMS_BASE_URL'),
      baseUrl: GMS_BASE_URL,
    },
    breezeway: {
      configured: envConfigured('BREEZEWAY_CLIENT_ID', 'BREEZEWAY_CLIENT_SECRET'),
      baseUrl: process.env.BREEZEWAY_BASE_URL || 'https://api.breezeway.io',
    },
    kimi: {
      configured: envConfigured('KIMI_API_KEY'),
    },
    anthropic: {
      configured: envConfigured('ANTHROPIC_API_KEY'),
    },
    openai: {
      configured: envConfigured('OPENAI_API_KEY'),
    },
    channels: channelCounts,
  });
}));

// On-demand translation. Frontend calls this for reviews whose original
// language isn't English. Result is cached server-side keyed by cacheKey
// (typically the review id), so repeat calls are free and instant.
app.post('/api/ai/translate', requireAuth, asyncHandler(async (req, res) => {
  const { text, cacheKey, sourceLang } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required (string)' });
  }
  try {
    const result = await translateText(text, { cacheKey, sourceLang });
    res.json(result);
  } catch (e) {
    console.error('[ai/translate] error:', e.message);
    res.status(500).json({ error: e.message || 'Translation failed' });
  }
}));

// Ping endpoint hits each configured upstream once for the Settings "Test"
// button. Returns per-integration status. Cheap on Guesty (lists 1 listing).
app.post('/api/system/test/:integration', requireAuth, asyncHandler(async (req, res) => {
  const target = String(req.params.integration || '').toLowerCase();
  const start = Date.now();
  try {
    if (target === 'guesty') {
      const r = await guestyAPI.get('/listings', { params: { limit: 1 } });
      res.json({ ok: true, latencyMs: Date.now() - start, samples: r.data?.results?.length ?? 0 });
    } else if (target === 'gms') {
      const r = await axios.get(GMS_BASE_URL + '/api/health', { timeout: 5000 });
      res.json({ ok: true, latencyMs: Date.now() - start, gmsVersion: r.data?.version ?? null });
    } else {
      res.status(400).json({ ok: false, error: `Unknown integration: ${target}` });
    }
  } catch (e) {
    logUpstreamFailure(`system/test/${target}`, e);
    res.status(e.response?.status || 502).json({
      ok: false, latencyMs: Date.now() - start,
      error: e.response?.data?.error || e.message || 'Upstream unreachable',
    });
  }
}));

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

// Run FAD-owned migrations before opening the listener. Idempotent —
// already-applied files are skipped via fad_schema_migrations table.
// Failures log but don't crash the server (HR routes will return 500
// until the migration is fixed manually).
//
// Once migrations are in place, boot the design auto-task scheduler.
// It's a 5min setInterval that runs runAutoTaskScan() and writes
// follow-up tasks per Notion §7.SS. Disabled when NODE_ENV=test. We
// don't await the migration result before starting the scheduler — the
// scheduler's first tick fires 5min in, by which point migrations have
// settled (or surfaced their failure in logs).
const { runMigrations } = require('./src/database/migrate');
const { startAutoTaskScheduler } = require('./src/design/jobs/scheduler');
runMigrations()
  .then(() => {
    startAutoTaskScheduler();
    console.log('[auto-tasks] scheduler started');
  })
  .catch((e) => console.error('[migrate] fatal:', e.message));

server.listen(port, () => {
  console.log(`🚀 Friday Admin Dashboard Backend running on port ${port}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🔗 GMS Integration: ${GMS_BASE_URL}`);
  console.log(`⏱️  Polling GMS every ${POLL_INTERVAL/1000} seconds`);
});