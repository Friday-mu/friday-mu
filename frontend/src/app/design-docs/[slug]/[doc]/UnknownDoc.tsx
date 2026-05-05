'use client';

export function UnknownDoc({ reason, slug, doc }: { reason: 'project-not-found' | 'doc-not-found'; slug: string; doc: string }) {
  return (
    <div style={{ padding: 32, fontFamily: 'Inter, system-ui, sans-serif', color: '#14233d', maxWidth: 480, margin: '64px auto' }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Document not found.</h1>
      <p style={{ fontSize: 13, color: '#5b6776' }}>
        {reason === 'project-not-found'
          ? <>No project matched <code>{slug}</code>.</>
          : <>Unknown document type <code>{doc}</code> for project <code>{slug}</code>.</>}
      </p>
      <p style={{ fontSize: 12, marginTop: 16 }}>
        <a href="/fad?m=design" style={{ color: '#2B4A93' }}>← Back to Design</a>
      </p>
    </div>
  );
}
