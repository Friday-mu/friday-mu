'use client';

// Tenant identity — decodes the JWT in localStorage to expose tenant_id
// and the GMS-side role ('admin' / 'manager' / 'staff' / etc.). Used by
// the SaaS surfaces (TenantSettingsModule, BillingModule) for FR-admin
// gates that don't fit the FAD role system in usePermissions.ts.
//
// The FAD permissions context is its own thing (Director/Manager/Field
// view-as) — keep them separate so this hook isn't bound to FAD-shell
// internals. Signup uses these helpers too without the PermissionsProvider.

import { useEffect, useState } from 'react';
import { getToken } from '../../../components/types';

// Friday Retreats tenant UUID (seeded). FR admin = founder-tenant admin who
// can issue invoices / toggle module flags for other tenants.
export const FR_TENANT_ID = '00000000-0000-0000-0000-000000000001';

interface TenantIdentity {
  tenantId: string | null;
  /** GMS-side role from JWT — 'admin', 'manager', 'staff', etc. */
  role: string | null;
  userId: string | null;
}

function decodeJwt(token: string | null): TenantIdentity {
  const empty: TenantIdentity = { tenantId: null, role: null, userId: null };
  if (!token) return empty;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return empty;
    // Base64url decode the payload
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const json = typeof window === 'undefined'
      ? Buffer.from(b64 + pad, 'base64').toString('utf-8')
      : atob(b64 + pad);
    const payload = JSON.parse(json);
    return {
      tenantId: payload.tenant_id || payload.tenantId || null,
      role: payload.role || null,
      userId: payload.user_id || payload.userId || null,
    };
  } catch {
    return empty;
  }
}

let cached: TenantIdentity | null = null;

function readIdentity(): TenantIdentity {
  if (cached) return cached;
  cached = decodeJwt(getToken());
  return cached;
}

export function _resetTenantIdentityCacheForTests() {
  cached = null;
}

export function useTenantIdentity(): TenantIdentity {
  const [id, setId] = useState<TenantIdentity>(() => ({ tenantId: null, role: null, userId: null }));
  useEffect(() => {
    cached = decodeJwt(getToken());
    setId(cached);
  }, []);
  return id;
}

export function useCurrentTenantId(): string | null {
  return useTenantIdentity().tenantId;
}

/** GMS-side role — 'admin' / 'manager' / 'staff' / etc. NOT the FAD role context. */
export function useCurrentTenantRole(): string | null {
  return useTenantIdentity().role;
}

export function useIsFrAdmin(): boolean {
  const id = useTenantIdentity();
  return id.tenantId === FR_TENANT_ID && id.role === 'admin';
}

/** Imperative version — for use outside React (e.g. signup redirect logic). */
export function isFrAdmin(): boolean {
  const id = readIdentity();
  return id.tenantId === FR_TENANT_ID && id.role === 'admin';
}
