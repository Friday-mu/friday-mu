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
// Skip the global JSON body parser for signed website-inbox routes —
// these routes need the RAW bytes to verify the friday.mu HMAC
// signature, and their own express.raw() middleware can't read the
// body once express.json() has consumed it. All other routes still
// get the default JSON parsing.
app.use((req, res, next) => {
  if (
    req.path === '/api/inbox/website/friday-website' ||
    req.path.startsWith('/api/inbox/website/friday-website/ai-handoff')
  ) return next();
  // Stripe webhook needs the RAW body to verify the Stripe-Signature
  // header (HMAC-SHA256 over `${timestamp}.${rawBody}`). Letting
  // express.json() consume the bytes first would re-serialise the
  // payload and break the signature check.
  if (req.path === '/api/tenants/stripe/webhook') return next();
  // Guesty webhooks (reservation + message events) also need RAW bytes
  // for the HMAC-SHA256 signature (x-guesty-signature header). The
  // route mounts its own express.raw(); skipping express.json() here
  // makes that work. Latent bug since the reservations webhook landed
  // — fixed 2026-05-17 when the inbox-message handler was added.
  if (req.path === '/api/integrations/guesty/webhook') return next();
  if (req.path === '/api/integrations/guesty/scraped-reservations') return next();
  if (req.path === '/api/integrations/guesty/scraped-listings') return next();
  return express.json({ limit: '10mb' })(req, res, next);
});
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

// Start polling when server starts.
//
// design-be-19a (2026-05-13): GMS removed the /pending endpoint this
// poller relied on, so every tick logs `[GMS API Error] Request failed
// with status code 404` and `[API Error] Failed to fetch conversations`
// in prod. The inbox sprint (Tier E roadmap items bw-7/bw-8/bw-9) will
// rewire the inbox to GMS's current /api/inbox/conversations + a
// websocket push channel; until then, polling is gated behind
// ENABLE_GMS_INBOX_POLLING and OFF by default. Set the env var to "1"
// (or "true") to re-enable, e.g. when local-testing against a custom
// GMS branch that still exposes /pending.
const POLL_INTERVAL = 30000; // 30 seconds
const GMS_POLLING_ENABLED = /^(1|true|yes)$/i.test(
  String(process.env.ENABLE_GMS_INBOX_POLLING || '')
);
if (GMS_POLLING_ENABLED) {
  setInterval(pollGMSForUpdates, POLL_INTERVAL);
}

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

// Delegate to the shared Guesty client (website_inbox/guesty.js) so
// fad-backend has ONE token cache for all Guesty calls — and so it
// shares the on-disk cache with friday-gms (per R1, 2026-05-17).
// Both backends share the 5/24h OAuth mint quota; this collapses
// fad-backend's two parallel caches into one + reads what friday-gms
// already minted.
const { getAccessToken: getSharedGuestyToken } = require('./src/website_inbox/guesty');

async function getGuestyAccessToken() {
  return getSharedGuestyToken();
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

// SaaS-scaffolding routers. tenants/index.js handles signup + tenant
// CRUD; invoices.js handles billing. Mounted BEFORE the design router
// so the design module-gate can lean on attachIdentitySoft (added in
// design/auth.js) to populate req.tenantId before requireModule runs.
//
// The /api/tenants/signup endpoint is intentionally public — sits
// inside tenants/index.js with its own validation and is mounted on
// the unauthenticated router. Every other route in here either uses
// attachIdentity (tenant CRUD) or attachIdentity + requireModule
// ('billing') (invoices).
const tenantsRoutes = require('./src/tenants');
const invoicesRoutes = require('./src/tenants/invoices');
const tenantUsersRoutes = require('./src/tenants/users');
const tenantDeletionExportRoutes = require('./src/tenants/deletion_export');
// Stripe scaffolding — POST /stripe/webhook (public, signature-verified),
// POST /me/stripe/checkout-session, POST /me/stripe/portal-session.
// The webhook path is excluded from express.json() above; its handler
// mounts its own express.raw() locally so the signature check sees the
// untouched bytes.
const stripeRoutes = require('./src/tenants/stripe_routes');
app.use('/api/tenants', tenantsRoutes);
app.use('/api/tenants', invoicesRoutes);
app.use('/api/tenants', stripeRoutes);
// Tenant user-management + invitation accept routes. Paths are scoped
// to /me/users, /me/invitations, and /invitations/:token so they don't
// collide with the existing /me/invoices etc. The /invitations/:token
// routes are intentionally public (no auth) — token IS the credential.
app.use('/api/tenants', tenantUsersRoutes);
// Soft tenant deletion + GDPR-style CSV data export. Mounts the
// /me/delete-request, /me/data-export, /admin/:id/restore, and
// /admin/:id/hard-delete routes. Each enforces its own auth check
// (tenant admin vs. FR admin) inside the handler.
app.use('/api/tenants', tenantDeletionExportRoutes);

// Public password-reset endpoints — mounted before the FR lockdown
// because they're explicitly cross-tenant (the email→user lookup
// resolves whichever tenant the user belongs to).
const passwordResetRoutes = require('./src/auth/password_reset');
const sessionAuthRoutes = require('./src/auth/session');
app.use('/api/auth', passwordResetRoutes);
app.use('/api/auth', sessionAuthRoutes);

// OAuth 2.0 client_credentials token issuer for the /api/public/*
// surface. Mounted at /api/auth/token; sibling of the password-reset
// routes above. Per ADR-003 / roadmap §5.2.1.
const apiClientsAuth = require('./src/auth/api_clients');
app.use('/api/auth/token', apiClientsAuth.router);

// Public read API for external consumers (friday.mu website etc.).
// Auth is per-route via attachApiClient + requireScope. Mounted
// before the FR multitenant lockdown because consumer JWTs carry
// their own tenant_id and the public routes scope queries by that
// rather than by the user-session identity.
const publicListingsRoutes = require('./src/public/listings');
app.use('/api/public/listings', publicListingsRoutes);
const publicExperiencesRoutes = require('./src/public/experiences');
app.use('/api/public/experiences', publicExperiencesRoutes);
const publicAvailabilityRoutes = require('./src/public/availability');
app.use('/api/public/availability', publicAvailabilityRoutes.router);
const publicReturningGuestRoutes = require('./src/public/returning_guest');
app.use('/api/public/returning-guest', publicReturningGuestRoutes.router);
const publicTeamPresenceRoutes = require('./src/public/team_presence');
app.use('/api/public/team-presence', publicTeamPresenceRoutes.router);

// /api/public/chat — multi-provider chat-completions proxy. Replaces
// the website's three direct LLM integrations (Ask Friday hero,
// owner-enquiry chat, feedback FAB chat). Streaming SSE + non-streaming
// JSON. Kimi K2.6 primary, Anthropic Claude fallback on 429.
// Per FAD-HANDOFF-PUBLIC-CHAT-2026-05-18.md.
const publicChatRoutes = require('./src/public/chat');
app.use('/api/public/chat', publicChatRoutes);

// Portal v2 public API — slice 1 (claim + resolver). The two routes
// share the /api/public root because the website calls /threads/claim
// and /stays/resolve from different bases. Mounted at /api/public
// (not a sub-path) so both routes resolve under their full contract
// paths. See backend/src/public/portal.js.
const publicPortalRoutes = require('./src/public/portal');
app.use('/api/public', publicPortalRoutes);

// FAD-native Ask Friday. Authenticated, read-only staff assistant over
// live tenant-scoped operational context; mounted before the FR lockdown
// because the router handles tenant scoping itself.
const fadFridayRoutes = require('./src/fad/friday');
app.use('/api/friday', fadFridayRoutes.router);
const askFridayCoreRoutes = require('./src/ask_friday');
app.use('/api/ask-friday/core', askFridayCoreRoutes.router);
const intentTaskParserRoutes = require('./src/intent/task_parser');
app.use('/api/intent', intentTaskParserRoutes.router);
const intentReceiptParserRoutes = require('./src/intent/receipt_parser');
app.use('/api/intent', intentReceiptParserRoutes.router);
const financeExpensesRoutes = require('./src/finance/expenses');
app.use('/api/expenses', financeExpensesRoutes.router);

// Defensive multitenant lockdown — applied to every route mounted
// below this line. Non-FR tenants get 403 on any non-design / non-
// tenants route; FR continues unchanged. Routes whose queries have
// been tenant-scoped + module-gated (currently just /api/design)
// don't reach here because they're mounted earlier.
//
// This is v0 belt-and-braces: the underlying queries STILL hardcode
// FR's tenant_id. Once we sweep a given module the way we did design,
// remove its path from the lockdown and add a requireModule gate.
{
  const { attachIdentitySoft: _ais } = require('./src/design/auth');
  const { requireFrTenant: _rft } = require('./src/tenants/middleware');
  app.use((req, res, next) => {
    const p = req.path;
    // Skip the lockdown for intentionally public / already-gated routes.
    if (
      p === '/api/health' ||
      p === '/api/version' ||
      p.startsWith('/api/tenants') ||      // signup + tenant CRUD (own auth); also covers /api/tenants/stripe/webhook (public, Stripe-signed)
      p.startsWith('/api/auth') ||         // public password-reset (own validation)
      p.startsWith('/api/design') ||       // module-gated above
      p.startsWith('/api/feedback') ||     // tenant-scoped via mig 037 — every tenant can file bugs
      p.startsWith('/api/inbox/website') ||// public HMAC-signed webhook
      // Newly tenant-scoped modules (mig 049 + 050). Each writes its
      // own queries against `req.tenantId` from attachIdentity, so it's
      // safe to expose to all tenants — non-FR tenants without Guesty
      // creds just see empty lists.
      p.startsWith('/api/properties') ||
      p.startsWith('/api/reservations') ||
      p.startsWith('/api/tasks') ||
      p.startsWith('/api/guests') ||
      p.startsWith('/api/owners') ||
      p.startsWith('/api/availability') ||
      p.startsWith('/api/quotes') ||
      p.startsWith('/api/analytics') ||
      p.startsWith('/api/calendar') ||
      p.startsWith('/api/finance/property/') ||
      p.startsWith('/api/integrations/guesty/webhook') || // HMAC-signed
      p.startsWith('/api/integrations/guesty/scraped-reservations') || // HMAC-signed (scraper)
      p.startsWith('/api/integrations/guesty/scraped-listings') // HMAC-signed (scraper)
    ) {
      return next();
    }
    _ais(req, res, () => _rft(req, res, next));
  });
}

// HR routes — FAD-owned tables, direct pg access. JWT-gated per
// Director permission matrix (see src/hr/auth.js).
// TODO: tenant-scope queries here + drop the FR lockdown above.
const hrStaffRoutes = require('./src/hr/staff');
const hrTimeOffRoutes = require('./src/hr/time-off');
const hrRosterRoutes = require('./src/hr/roster');
app.use('/api/hr/staff', hrStaffRoutes);
app.use('/api/hr/time-off', hrTimeOffRoutes);
app.use('/api/hr/roster', hrRosterRoutes);

// Design module routes — FAD-owned tables (design_*), Director-gated.
// Sub-routers land progressively per design-be-N slices. See
// src/design/index.js for the aggregator + auth.js for the perm matrix.
//
// Module-gate composition:
//   attachIdentitySoft → populates req.tenantId from JWT (without 401
//     if the header is missing — the inner requireDesignPerm on each
//     route still does the actual 401)
//   requireModule('design') → 403 if the tenant hasn't subscribed
//     (returns 401 "no tenant context" if the JWT was absent / bad,
//     which is correct: the inner requireDesignPerm would 401 anyway)
const { attachIdentity, attachIdentitySoft } = require('./src/design/auth');
const { requireModule, requireFrTenant } = require('./src/tenants/middleware');
const designRoutes = require('./src/design');
app.use('/api/design', attachIdentitySoft, requireModule('design'), designRoutes);

// Feedback inbox — bug reports + feature requests + suggestions.
// FAD-wide (not design-scoped). POST: any authenticated user.
// GET / PATCH: admin/director only. Tenant-scoped via mig 037 —
// every tenant's admins see only their own users' reports.
const feedbackRoutes = require('./src/feedback');
app.use('/api/feedback', feedbackRoutes);

// TODO: gate when tenant-scoped — website_inbox tables aren't yet
// keyed by tenant_id; the webhook is shared across all tenants.
// Website inbox — receives webhooks from friday.mu (residence booking
// form, payment proof uploads, experience enquiries, contact form,
// owner enquiries) and orchestrates Guesty reservation creation +
// confirmation. Mounted under /api/inbox/website/* so it doesn't
// collide with the legacy /api/inbox/conversations* routes that
// proxy to GMS for guest-messaging.
//
// The webhook itself (POST /api/inbox/website/friday-website) is
// public — HMAC-signed via FRIDAY_WEBSITE_INBOX_SECRET. Everything
// else under this router requires the standard FAD auth header.
const websiteInbox = require('./src/website_inbox');
app.use('/api/inbox/website', websiteInbox.router);

// ─── Team inbox (FAD's Slack replacement) ─────────────────────────
// Channels + DMs + messages + read receipts + reactions. Routes
// require attachIdentity (JWT). Single-tenant in v1 (FR only); the
// schema is tenant-scoped so multi-tenant rollout doesn't need a
// migration when the time comes. Mount at /api/team — separate from
// /api/inbox/* which is the guest-inbox surface (proxied to GMS).
const teamInbox = require('./src/team_inbox');
app.use('/api/team', teamInbox.router);

// ─── FAD realtime + browser push primitives ───────────────────────
// SSE stream for live Inbox/TeamInbox events plus per-user FAD
// notifications. Browser push subscription storage is separate from
// delivery so VAPID/web-push can be enabled without a schema change.
const realtime = require('./src/realtime');
const pushRoutes = require('./src/realtime/push');
app.use('/api/events', realtime.router);
app.use('/api/push', pushRoutes.router);

const mcpRoutes = require('./src/mcp');
app.use('/api/mcp', mcpRoutes.router);
realtime.startPgListener();
// Start the DLQ worker that drains inbox_guesty_jobs. Cheap interval
// poll (every 15s), runs in-process. See src/website_inbox/jobs.js.
websiteInbox.startWorker();

// ─── Email integration (mig 055) ───────────────────────────────────
// Per-user Gmail OAuth + threading + classifier + Pub/Sub push handler.
// PARKED on Ishant creating the GCP OAuth client; the router mounts
// regardless so /api/email/status reflects readiness publicly.
// pull_worker is a no-op until EMAIL_PULL_ENABLED=true.
const emailModule = require('./src/email');
app.use('/api/email', emailModule.router);
require('./src/email/pull_worker').start();

// Inbox translation worker — runs detectLanguage + translateText on
// recent inbound messages without a confirmed language. Replaces the
// friday-gms poller-driven translation that was missing fad-backend-
// inserted rows (guests sending in non-English on English-profile
// conversations stayed untranslated).
require('./src/inbox/translation_worker').start();

// Phase 3.1 draft reaper — flips any drafts row stuck in
// `friday_drafting` for longer than DRAFT_STUCK_THRESHOLD_MS (default
// 5 minutes) to `generation_failed`. Covers the case where a Kimi call
// + process crash leaves a row dangling — GMS has no equivalent today.
require('./src/inbox/draft_reaper').start();

// Phase 3.3 inquiry follow-up scanner — every 15min, sweep stale
// prospect conversations and create pending_actions + AI follow-up
// drafts. Includes the auto-dismiss pass (booking confirmed /
// check-in passed / team responded). Mirrors what GMS did at the
// same cadence; the GMS cron is disabled via GMS_FOLLOWUP_SCANNER_DISABLED.
require('./src/inbox/followup_scanner').start();

// Ask Friday Core analyzer is intentionally not enabled in the live API
// process by default. Run it through `npm run ask-friday:analyzer` or set
// ASK_FRIDAY_ANALYZER_IN_WEB=1 for controlled single-process deployments.
// The analyzer can be model/heavy as the learning loop grows; keeping it
// off the web request path preserves guest/staff chat latency.
if (process.env.ASK_FRIDAY_ANALYZER_IN_WEB === '1') {
  require('./src/ask_friday/scheduler').start();
} else {
  console.log('[ask-friday/analyzer] web-process scheduler disabled; run ask-friday:analyzer worker if needed');
}

// ─── Unified outbound abstraction ─────────────────────────────────
// POST /api/outbound/send federates per-channel send paths under one
// endpoint. Per locked decision §2 — first callers are TeamInbox
// compose + Friday Consult send; refactor of those callers is a
// separate cleanup commit.
const outboundModule = require('./src/outbound');
app.use('/api/outbound', outboundModule.router);

// ────────────────────────────────────────────────────────────────────
// Guesty sync — Properties + Reservations modules (mig 049).
//
// /api/properties: read-only over guesty_listings cache.
// /api/reservations: read-only over guesty_reservations cache.
// /api/integrations/guesty/webhook: HMAC-verified reservation events.
//
// Both caches hydrated by a single 5-min poller (worker.js) that
// loops over tenants with Guesty credentials. v1: env-var FR
// credentials only; per-tenant credential storage is a follow-up.
// ────────────────────────────────────────────────────────────────────
app.use('/api/properties', require('./src/properties'));
app.use('/api/reservations', require('./src/reservations'));
app.use('/api/tasks', require('./src/tasks'));
app.use('/api/operations', require('./src/operations/consult'));
app.use('/api/operations', require('./src/operations/travel_time'));
app.use('/api/operations', require('./src/operations/settings'));
// FAD-native Guests module (T3.11). Backfilled from guesty_reservations;
// kept fresh by sync.js after each reservation upsert.
app.use('/api/guests', require('./src/guests'));
// FAD-native Owners module (T3.12). Seeded from Guesty listing owner IDs
// (placeholder display names); admins patch real names + contact in.
app.use('/api/owners', require('./src/owners'));
// Per-property finance summary (T1.11). Aggregates revenue from
// guesty_reservations + expenses from the expenses table; computes
// occupancy / ADR / RevPAR over a configurable window.
app.use('/api/finance', require('./src/finance/property_summary'));
// Availability search (T4.39). Aggregates guesty_calendar over a window
// + filters by guest count. Powers the Calendar "Find availability"
// modal + the future quote builder.
app.use('/api/availability', require('./src/availability/search'));
// Quote-link generator (T4.40). Generates Friday Website preview URLs
// + tracks status (sent / opened / converted).
app.use('/api/quotes', require('./src/quotes'));
// Analytics Intelligence Core — Phase 0 (deterministic tier-1 metrics).
// Per scoping pack 36a43ca884928165b886fc3043e399a0. Cube Core + LLM
// agent land in Phases 1+ once Ishant acks the droplet allocation.
app.use('/api/analytics', require('./src/analytics/portfolio'));
// Multi-calendar v0.2 per-cell price/availability grid (T4.38 v0.2).
app.use('/api/calendar', require('./src/properties/calendar_grid'));
// Webhook needs the RAW body (Buffer) for HMAC verification — Guesty
// signs the exact bytes they send, and express.json() restringifies.
const guestyWebhook = require('./src/reservations/webhook');
app.post(
  '/api/integrations/guesty/webhook',
  express.raw({ type: '*/*', limit: '2mb' }),
  guestyWebhook.handleWebhook,
);
// Layer-3 scraped-reservations receiver. HMAC-signed body (legacy
// hex over GUESTY_WEBHOOK_SECRET, same scheme as scrape.mjs messages).
const scrapedReservations = require('./src/reservations/scraped_webhook');
app.post(
  '/api/integrations/guesty/scraped-reservations',
  express.raw({ type: '*/*', limit: '256kb' }),
  scrapedReservations.handleScrapedReservation,
);
const scrapedListings = require('./src/reservations/scraped_listings_webhook');
app.post(
  '/api/integrations/guesty/scraped-listings',
  express.raw({ type: '*/*', limit: '256kb' }),
  scrapedListings.handleScrapedListing,
);
const guestyPoller = require('./src/reservations/worker');
guestyPoller.start();

// Trial-expiry worker — hourly tick that flips trial → past_due once
// trial_ends_at passes, sends 3-day "trial ending soon" reminders, and
// cancels stale past_due tenants after 30d. See src/tenants/trial_jobs.js.
const trialJobs = require('./src/tenants/trial_jobs');
trialJobs.startTrialExpiryWorker();

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

// Look up the user's must_change_password flag from the shared DB by
// JWT-resolved userId. Returns false on any error so the login flow
// stays robust — worst case we miss surfacing the forced-change once,
// next auth/me call catches it.
async function loadMustChangePassword(userId) {
  if (!userId) return false;
  try {
    const { query } = require('./src/database/client');
    const { rows } = await query(
      `SELECT must_change_password FROM users WHERE id = $1`,
      [userId],
    );
    return !!rows[0]?.must_change_password;
  } catch (e) {
    console.warn('[auth] must_change lookup failed:', e.message);
    return false;
  }
}

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  try {
    const { data } = await userGmsCall.post('/api/auth/login', req.body);
    // Surface must_change_password from the shared DB so the frontend
    // can block usage until they reset. GMS returns user_id at top
    // level (not nested under user), so check both shapes for safety.
    const userId = data?.user_id || data?.user?.id || data?.id;
    const mustChange = await loadMustChangePassword(userId);
    res.json({ ...data, must_change_password: mustChange });
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
    const userId = data?.user_id || data?.user?.id || data?.id;
    const mustChange = await loadMustChangePassword(userId);
    res.json({ ...data, must_change_password: mustChange });
  } catch (e) {
    logUpstreamFailure('auth/me', e);
    const status = e.response?.status || 502;
    res.status(status).json({
      error: e.response?.data?.error || (e.response ? 'Auth check failed' : 'GMS unreachable'),
    });
  }
}));

// POST /api/auth/change-password — authenticated user changes their own
// password (used for force-change-on-first-login). Verifies the current
// password, hashes the new one, clears must_change_password. JWT only —
// caller is whoever holds the token.
app.post('/api/auth/change-password', asyncHandler(async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== 'string' || !current_password) {
    return res.status(400).json({ error: 'current_password required' });
  }
  if (typeof new_password !== 'string' || new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be ≥ 8 characters' });
  }
  if (new_password === current_password) {
    return res.status(400).json({ error: 'new_password must differ from current_password' });
  }
  // Resolve user from JWT via GMS /auth/me — single source of truth.
  let userId;
  try {
    const { data } = await userGmsCall.get('/api/auth/me', { headers: { Authorization: auth } });
    userId = data?.user_id || data?.user?.id || data?.id;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!userId) return res.status(401).json({ error: 'Invalid token' });
  try {
    const bcrypt = require('bcryptjs');
    const { query } = require('./src/database/client');
    const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1 AND is_active = TRUE`, [userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const ok = bcrypt.compareSync(current_password, rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'current_password is incorrect' });
    const newHash = bcrypt.hashSync(new_password, 10);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
      [newHash, userId],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth/change-password] error:', e.message);
    res.status(500).json({ error: 'change-password failed' });
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

// ─── /api/analytics ────────────────────────────────────────────────
// FAD-owned event ingestion is local now. The broader /api/analytics/v2/*
// reporting surface belongs to the old GMS dashboard and remains proxied
// until the FAD Analytics module is rebuilt against FAD-native data.
app.use('/api/analytics/events', require('./src/analytics/events'));
app.all('/api/analytics/*', asyncHandler((req, res) =>
  gmsProxy(req, res, req.path, req.method.toLowerCase())
));

// /api/version — legacy update-banner polling endpoint. Return FAD's own
// identity instead of bouncing through GMS.
app.get('/api/version', (_req, res) => {
  const pkg = require('./package.json');
  res.json({
    service: 'fad-backend',
    version: process.env.APP_VERSION || pkg.version || '1.0.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null,
    built_at: process.env.BUILD_TIME || null,
  });
});

// /api/auth/login-roster — public. Drives the LoginScreen chip selector so
// it reflects who actually has an account (vs the hardcoded TEAM array it
// used to read). Source of truth: users.is_active = TRUE in the canonical
// Friday Retreats tenant. When HR deactivates someone they fall off the
// chip; when HR adds a new staff with an account they appear.
//
// Trade-off: exposes employee emails to anonymous viewers. Already public
// knowledge for FR (people are listed on the website / Slack), so the
// chip selector was already public information. Locked to one tenant for
// safety — other tenants get an empty array.
const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';
app.get('/api/auth/login-roster', asyncHandler(async (req, res) => {
  try {
    const { query } = require('./src/database/client');
    const { rows } = await query(
      `SELECT email, display_name
       FROM users
       WHERE tenant_id = $1 AND is_active = TRUE
         AND email LIKE '%@friday.mu'
       ORDER BY created_at`,
      [FR_TENANT_ID],
    );
    // First name only — chip label uses it directly.
    res.json({
      users: rows.map((r) => ({
        firstName: (r.display_name || r.email.split('@')[0]).split(/\s+/)[0],
        email: r.email,
      })),
    });
  } catch (e) {
    console.error('[auth/login-roster] error:', e.message);
    res.status(500).json({ users: [], error: e.message });
  }
}));

// Inbox read-side, Phase 1 port — GET conversations list, detail,
// messages. Replaces the three gmsProxy routes that previously sat
// here. Native SQL against the shared Postgres; see
// backend/src/inbox/conversations_read.js. Per the rebuild audit memo
// docs/handover/2026-05-18-gms-rebuild-audit.md (Option A).
//
// The mount captures the three specific GET paths inside the router.
// PATCHes and other methods on /api/inbox/conversations/:id (read,
// unread, status update, translate, etc.) still match the inline
// gmsProxy routes below — Express continues past this router for any
// inner path the router doesn't handle.
const conversationsReadRouter = require('./src/inbox/conversations_read');
app.use('/api/inbox/conversations', conversationsReadRouter);

// /:id/reservation, /:id/drafts, /:id/channels, /search, /filters, and
// the PATCH /:id/read, /:id/unread, /:id (status) routes are all
// handled by conversationsReadRouter above (Phase 2+3 port).
//
// On-demand conversation translation is FAD-native in
// conversationsReadRouter above (`POST /:id/translate`) and uses
// backend/src/ai/translate.js. No GMS proxy remains for this path.

// ─── Compose ──────────────────────────────────────────────────────────
// Three modes per friday-gms/src/routes/compose.ts:
//   manual      — operator-authored body, send as-is
//   draft       — request an AI draft (returns draft_id, no auto-send)
//   direct_send — instruction → AI generate + auto-send (skip review)
// Body: { mode, body?, channel?, instruction? }. Returns the new draft
// or the sent-message record depending on mode.

app.post('/api/inbox/conversations/:id/compose', requireAuth, asyncHandler((req, res) =>
  gmsProxy(req, res, `/api/conversations/${req.params.id}/compose`, 'post')
));

// ─── Drafts — review workflow ─────────────────────────────────────────
// State machine in friday-gms/src/routes/drafts.ts:
//   friday_drafting → draft_ready → under_review → approved → sending → sent
//                                                  ↘ rejected
//                                                  ↘ revision_requested → (new cycle)
//                                                  ↘ superseded
//   sent path: send_queued → sent | send_failed | dismissed

// GET /api/inbox/drafts/queued/list + /api/inbox/drafts/:id are now
// FAD-native (Phase 2 of the read-side port). The write-side draft
// mutations below remain proxied — they orchestrate the intelligence
// layer (auto-learn, action-detector, learning-collector, etc.).
const draftsReadRouter = require('./src/inbox/drafts_read');
app.use('/api/inbox/drafts', draftsReadRouter);

// POST /api/inbox/drafts/:id/{approve,reject,revise,retry,fail,dismiss}
// are FAD-native. Approve/retry own Guesty send; revise records the
// learning signal locally and starts FAD draft generation.
const draftsSendRouter = require('./src/inbox/drafts_send');
app.use('/api/inbox/drafts', draftsSendRouter);

// ─── Friday Consult + teachings — FAD-native ─────────────────────────
// Consult now loads backend/knowledge through the structured composer,
// persists consult_sessions with tenant + draft scope, parses
// [DRAFT_UPDATE]/[TEACH] locally, and writes teachings directly.
app.use('/api/inbox/consult', require('./src/inbox/consult'));
app.use('/api/inbox/teachings', require('./src/inbox/teachings'));
app.use('/api/inbox/pending-actions', require('./src/inbox/pending_actions'));

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
      // Guesty token is now managed by the shared token service
      // (src/website_inbox/guesty getAccessToken); the old module-local
      // `guestyTokenCache` was removed, so this status endpoint no longer
      // introspects it (was throwing ReferenceError: guestyTokenCache is not defined).
      tokenCached: null,
      tokenExpiresAt: null,
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

// Audio → text. Backs the dictation surfaces (feedback FAB and, as it
// rolls out, other input fields across FAD). Multipart-encoded; auth
// is handled inside the router via attachIdentity.
const transcribeRoutes = require('./src/ai/transcribe');
app.use('/api/transcribe', transcribeRoutes);

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
  if (GMS_POLLING_ENABLED) {
    console.log(`⏱️  Polling GMS every ${POLL_INTERVAL/1000} seconds`);
  } else {
    console.log(
      `⏸️  GMS inbox polling disabled (ENABLE_GMS_INBOX_POLLING unset). ` +
        `Endpoint /pending currently 404s; inbox will be rewired in Tier E (bw-7/8/9).`
    );
  }
});
