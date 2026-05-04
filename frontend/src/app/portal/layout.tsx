import '../fad/fad.css';
import './portal.css';

/**
 * Owner-portal layout. Distinct from FAD chrome — owners only see project
 * content, branded header, and a footer link to reach Friday by WhatsApp.
 *
 * Imports FAD's CSS variable file so we share design tokens (colours, radii,
 * fonts) without duplicating them.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-page">
      <header className="portal-header">
        <div className="portal-brand">
          <span className="portal-brand-mark">F</span>
          <span>Friday Retreats</span>
        </div>
        <div className="portal-secure">Secure owner portal</div>
      </header>
      <main className="portal-shell">{children}</main>
      <footer className="portal-footer">
        Need help? <a href="https://wa.me/2305712XXXX">WhatsApp Friday</a> ·{' '}
        <a href="mailto:hello@friday.mu">hello@friday.mu</a>
      </footer>
    </div>
  );
}
