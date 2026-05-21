'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

function decodeJwt(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '');
    return {
      userId: decoded.user_id || decoded.userId || null,
      userRole: decoded.role || null,
      username: decoded.username || null,
      displayName: decoded.display_name || decoded.displayName || null,
      tenantId: decoded.tenant_id || decoded.tenantId || null,
    };
  } catch {
    return null;
  }
}

function attachIdentity(req, res, next) {
  const identity = decodeJwt(req);
  if (!identity) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.identity = identity;
  req.tenantId = identity.tenantId || DEFAULT_TENANT_ID;
  next();
}

module.exports = {
  DEFAULT_TENANT_ID,
  decodeJwt,
  attachIdentity,
};
