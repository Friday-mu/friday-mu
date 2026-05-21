// FridayOS Design — marketing landing page (v0 scaffolding).
//
// Lives at /welcome so the FAD app at / keeps working. This is the
// front-of-funnel: all CTAs point at /signup. Copy is placeholder
// mined from docs/marketing/fridayos-design-pitch-v0.md — Mathias /
// Ishant will swap real copy + screenshots later.
//
// Server component (no 'use client') so metadata exports cleanly for
// OG/Twitter. The two interactive bits — the draft banner and the FAQ
// accordion — are isolated in DraftBanner.tsx and Faq.tsx.

import type { Metadata } from 'next';
import { DraftBanner } from './DraftBanner';
import { Faq } from './Faq';

export const metadata: Metadata = {
  title: 'FridayOS Design — Interior design studio operations',
  description:
    'Run your interior design studio from one cockpit. Owner intake to install, with an AI floor-plan editor that actually understands floor plans.',
  openGraph: {
    title: 'FridayOS Design — Interior design studio operations',
    description:
      'Owner intake → site visit → moodboard → floor plan → vendor quotes → installation. All in one place.',
    url: 'https://gms.friday.mu/welcome',
    siteName: 'FridayOS Design',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FridayOS Design — Interior design studio operations',
    description:
      'Owner intake → site visit → moodboard → floor plan → vendor quotes → installation. All in one place.',
  },
};

// Palette mirrors /signup. Brand accent in the dark hero, neutral
// sections elsewhere. Inline styles keep this self-contained so any
// later Tailwind / design-token migration touches one file.
const C = {
  heroBg: '#0d1117',
  heroText: '#f1f5f9',
  heroMuted: '#94a3b8',
  brand: '#2B4A93',
  brandLight: '#5680CA',
  pageBg: '#ffffff',
  altBg: '#fafafa',
  border: '#e5e7eb',
  text: '#0f1729',
  textMuted: '#475569',
  textTertiary: '#94a3b8',
};

const container: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '0 24px',
};

const features = [
  { icon: '📋', title: 'Site visit', body: 'Per-room data capture with built-in field hints so the team writes useful notes.' },
  { icon: '🎨', title: 'Moodboards', body: 'Generate 3 stylistically distinct variants in one click. Owner approves in the portal.' },
  { icon: '📐', title: 'Floor plans', body: 'Trace once, then chat with Friday to add furniture, change walls, move the sofa.' },
  { icon: '💷', title: 'Rough budget', body: 'Annex A fees, EPC totals, vendor/category breakdown — version-tracked.' },
  { icon: '🛋️', title: 'Selections', body: 'Owner-facing picker with multi-option lines. Send to owner; they pick in the portal.' },
  { icon: '✏️', title: 'Change orders', body: 'Versioned scope deltas. Owner approves in the portal.' },
  { icon: '📦', title: 'Procurement', body: 'Vendor catalog, performance rollups, budget vs actual.' },
  { icon: '📒', title: 'Closeout', body: 'Generate the handover binder at the end of the project.' },
];

const faqItems = [
  {
    q: "Who's this for?",
    a: 'Boutique design studios with under 30 active projects, end-to-end ownership of furnishing flow.',
  },
  {
    q: 'What about my existing tools?',
    a: 'We integrate via export. Bring your floor plans from Rayon Design.',
  },
  {
    q: 'How does billing work?',
    a: "Bank transfer for v1. Stripe coming soon. You'll get an invoice once a month.",
  },
  {
    q: 'Can I cancel?',
    a: 'Stop paying. The account locks within 60 seconds.',
  },
  {
    q: 'What about my data?',
    a: 'You can export everything to CSV anytime. GDPR-ready (in progress).',
  },
];

export default function WelcomePage() {
  return (
    <div style={{
      background: C.pageBg,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      lineHeight: 1.5,
    }}>
      <DraftBanner />

      {/* HERO ------------------------------------------------------- */}
      <section style={{ background: C.heroBg, color: C.heroText, padding: '80px 0' }}>
        <div style={container}>
          <h1 style={{
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: 16,
            lineHeight: 1.1,
            maxWidth: 860,
          }}>
            Run your interior design studio from one cockpit.
          </h1>
          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: C.heroMuted,
            margin: 0,
            marginBottom: 32,
            maxWidth: 720,
          }}>
            Owner intake → site visit → moodboard → floor plan → vendor quotes → installation.
            All in one place. With AI that actually understands floor plans.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/signup" style={{
              display: 'inline-block',
              padding: '12px 22px',
              background: C.brandLight,
              color: '#fff',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
            }}>
              Start free 14-day trial
            </a>
            <a href="#demo" style={{
              display: 'inline-block',
              padding: '12px 22px',
              background: 'transparent',
              color: C.heroText,
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              See it in action
            </a>
          </div>
        </div>
      </section>

      {/* DEMO / DIFFERENTIATOR -------------------------------------- */}
      <section id="demo" style={{ background: C.pageBg, padding: '80px 0' }}>
        <div style={container}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 48,
            alignItems: 'center',
          }} className="welcome-two-col">
            <div>
              <h2 style={{
                fontSize: 'clamp(24px, 3vw, 36px)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: 0,
                marginBottom: 16,
                lineHeight: 1.2,
              }}>
                The floor-plan editor that doesn't fight you
              </h2>
              <ul style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                fontSize: 16,
                color: C.textMuted,
              }}>
                {[
                  'Trace your walls once — 10 minutes max.',
                  'Then chat to edit: "Add a sofa." "Move it left." "Make the dining table rounder."',
                  'Walls stay structurally fixed. Furniture moves; structure doesn\'t.',
                  'Each turn returns a photorealistic render.',
                  'Save the version you like as final.',
                ].map((line) => (
                  <li key={line} style={{
                    paddingLeft: 24,
                    marginBottom: 12,
                    position: 'relative',
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      top: 2,
                      color: C.brand,
                      fontWeight: 600,
                    }}>→</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{
              background: C.altBg,
              border: `1px dashed ${C.border}`,
              borderRadius: 12,
              padding: 24,
              minHeight: 320,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: C.textTertiary,
              fontSize: 13,
            }}>
              screenshot placeholder: floor-plan studio in action
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES --------------------------------------------------- */}
      <section style={{ background: C.altBg, padding: '80px 0' }}>
        <div style={container}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 36px)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: 8,
            lineHeight: 1.2,
          }}>
            What's included
          </h2>
          <p style={{
            fontSize: 16,
            color: C.textMuted,
            margin: 0,
            marginBottom: 40,
            maxWidth: 640,
          }}>
            Every stage of the furnishing flow, in one tool. No more juggling Rayon, spreadsheets, WhatsApp threads, and 12 tabs of vendor quotes.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
          }}>
            {features.map((f) => (
              <div key={f.title} style={{
                background: C.pageBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 20,
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }} aria-hidden>{f.icon}</div>
                <h3 style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: 6,
                  color: C.text,
                }}>
                  {f.title}
                </h3>
                <p style={{
                  fontSize: 14,
                  color: C.textMuted,
                  margin: 0,
                  lineHeight: 1.5,
                }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING ---------------------------------------------------- */}
      <section style={{ background: C.pageBg, padding: '80px 0' }}>
        <div style={container}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 36px)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: 40,
            lineHeight: 1.2,
            textAlign: 'center',
          }}>
            Simple pricing
          </h2>
          <div style={{
            maxWidth: 480,
            margin: '0 auto',
            background: C.altBg,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 32,
          }}>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              FridayOS Design
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20 }}>
              <span style={{ fontSize: 40, fontWeight: 600, color: C.text }}>$99</span>
              <span style={{ fontSize: 14, color: C.textMuted }}>/ month per studio</span>
            </div>
            <ul style={{
              margin: 0,
              padding: 0,
              marginBottom: 24,
              listStyle: 'none',
              fontSize: 14,
              color: C.textMuted,
            }}>
              {[
                'Full design module',
                'Conversational floor-plan editor',
                'Unlimited projects',
                '14-day free trial — no card required',
                'Bank transfer (Stripe coming soon)',
                'Invite up to 5 team members',
              ].map((b) => (
                <li key={b} style={{
                  paddingLeft: 22,
                  marginBottom: 8,
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    color: C.brand,
                  }}>✓</span>
                  {b}
                </li>
              ))}
            </ul>
            <a href="/signup" style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              background: C.brand,
              color: '#fff',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}>
              Start free trial
            </a>
          </div>
        </div>
      </section>

      {/* FAQ -------------------------------------------------------- */}
      <section style={{ background: C.altBg, padding: '80px 0' }}>
        <div style={{ ...container, maxWidth: 760 }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 36px)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: 32,
            lineHeight: 1.2,
          }}>
            Frequently asked
          </h2>
          <Faq items={faqItems} />
        </div>
      </section>

      {/* FOOTER ----------------------------------------------------- */}
      <footer style={{
        background: C.heroBg,
        color: C.heroMuted,
        padding: '40px 0',
        fontSize: 13,
      }}>
        <div style={{
          ...container,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>© 2026 Friday Retreats Ltd. Built in Mauritius.</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <a href="/signup" style={{ color: C.heroText, textDecoration: 'none' }}>Start trial</a>
            <a href="mailto:mathias@friday.mu" style={{ color: C.heroText, textDecoration: 'none' }}>Contact</a>
            <a href="/reset-password" style={{ color: C.heroText, textDecoration: 'none' }}>Forgot password</a>
          </div>
        </div>
      </footer>

      {/* Responsive: collapse 2-col demo grid on small screens. */}
      <style>{`
        @media (max-width: 720px) {
          .welcome-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
