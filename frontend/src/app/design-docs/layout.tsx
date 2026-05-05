// Layout override for the print-preview route. globals.css forces
// `html, body { overflow: hidden; height: 100dvh }` for the FAD PWA shell —
// great for fixed-app chrome, broken for documents that need to scroll
// past the first viewport. This layout re-enables natural scrolling for
// every page under /design-docs/.

import type { ReactNode } from 'react';

export default function DesignDocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        html, body {
          overflow: auto !important;
          height: auto !important;
          max-width: none !important;
          background: #e8e6e0;
        }
      `}</style>
      {children}
    </>
  );
}
