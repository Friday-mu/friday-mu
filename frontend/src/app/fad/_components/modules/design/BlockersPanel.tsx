'use client';

// design-be-18: top-of-overview panel for blocker-category tasks.
// Thin wrapper around TaskItemsPanel which holds the actual behaviour.

import type { DesignProject } from '../../../_data/design';
import { TaskItemsPanel } from './TaskItemsPanel';

export function BlockersPanel({ project }: { project: DesignProject }) {
  return (
    <TaskItemsPanel
      projectId={project.id}
      category="blocker"
      heading="🚧 Blockers"
      emptyMessage="No blockers — clear!"
      addPlaceholder="Add a blocker and press Enter"
    />
  );
}
