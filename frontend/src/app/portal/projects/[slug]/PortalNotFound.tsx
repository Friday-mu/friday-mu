export function PortalNotFound({ slug }: { slug: string }) {
  return (
    <div className="portal-state">
      <h1>This portal link doesn't match a project.</h1>
      <p>
        We couldn't find <code style={{ fontFamily: 'monospace' }}>{slug}</code>. If Friday sent you
        this link, message us so we can resend a fresh one.
      </p>
      <a className="portal-cta" href="https://wa.me/2305712XXXX">
        Message Friday on WhatsApp
      </a>
    </div>
  );
}
