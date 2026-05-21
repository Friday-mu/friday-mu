'use client';

// design-be-18: top-of-overview panel for next-action-category tasks.
// Thin wrapper around TaskItemsPanel which holds the actual behaviour.

import type { DesignProject } from '../../../_data/design';
import { TaskItemsPanel } from './TaskItemsPanel';

export function NextActionsPanel({ project }: { project: DesignProject }) {
  return (
    <TaskItemsPanel
      projectId={project.id}
      category="next_action"
      heading="➡️ Next actions"
      emptyMessage="No next actions queued."
      addPlaceholder="Add a next action and press Enter"
    />
  );
}
