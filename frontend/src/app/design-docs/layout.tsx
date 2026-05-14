// Layout override for the print-preview route. globals.css forces
// `html, body { overflow: hidden; height: 100dvh }` for the FAD PWA shell —
// great for fixed-app chrome, broken for documents that need to scroll
// past the first viewport. This layout re-enables natural scrolling for
// every page under /design-docs/.
//
// The bug-report FAB is mounted here too. The team reported (Mathias)
// that bugs found while viewing a document couldn't be filed because
// the FAB only lived inside the FAD shell. The FAB's screenshot
// capture falls back to document.body when `.fad-app` isn't present,
// so it works correctly on this route.

import type { ReactNode } from 'react';
import { BugReportFab } from '../fad/_components/BugReport';

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
      <BugReportFab currentModuleLabel="Design document" />
    </>
  );
}
