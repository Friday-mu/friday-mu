// design-be-18: smoke tests for the category-driven task panel.
//  - empty-state rendering (no tasks → shows the configured empty
//    message and no rows)
//  - basic category passthrough (panel for category='blocker' calls
//    listTasksByCategory with that category — guards against the
//    discriminator silently regressing to 'general').
//
// We mock the designClient module so the panel's mount-time fetch
// resolves deterministically without touching the network.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// vi.mock() is hoisted to the top of the module, so any state it
// references must come from vi.hoisted to avoid the temporal dead zone.
const mocks = vi.hoisted(() => ({
  listTasksByCategory: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock('../../../_data/designClient', () => ({
  listTasksByCategory: mocks.listTasksByCategory,
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
  deleteTask: mocks.deleteTask,
  // design-be-?: live-tasks store + fixtureRev bump are no-ops in tests.
  setLiveTasks: vi.fn(),
}));

vi.mock('../../../_data/fixtureRev', () => ({
  bumpFixtureRev: vi.fn(),
  useFixtureRev: () => 0,
  peekFixtureRev: () => 0,
}));

vi.mock('../Toaster', () => ({
  fireToast: vi.fn(),
}));

// Import AFTER the mock is registered so the panel binds to the stubs.
import { TaskItemsPanel } from './TaskItemsPanel';

describe('TaskItemsPanel — empty state', () => {
  beforeEach(() => {
    mocks.listTasksByCategory.mockReset();
    mocks.createTask.mockReset();
    mocks.updateTask.mockReset();
    mocks.deleteTask.mockReset();
  });

  it('shows the configured empty message when no tasks exist', async () => {
    mocks.listTasksByCategory.mockResolvedValueOnce([]);

    render(
      <TaskItemsPanel
        projectId="p-1"
        category="blocker"
        heading="🚧 Blockers"
        emptyMessage="No blockers — clear!"
        addPlaceholder="Add a blocker and press Enter"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No blockers — clear!')).toBeInTheDocument();
    });
    // count chip should be (0)
    expect(screen.getByText(/Blockers/)).toBeInTheDocument();
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('passes the category prop through to listTasksByCategory unchanged', async () => {
    mocks.listTasksByCategory.mockResolvedValueOnce([]);

    render(
      <TaskItemsPanel
        projectId="p-42"
        category="next_action"
        heading="➡️ Next actions"
        emptyMessage="No next actions queued."
        addPlaceholder="Add a next action and press Enter"
      />,
    );

    await waitFor(() => {
      expect(mocks.listTasksByCategory).toHaveBeenCalledWith('p-42', 'next_action');
    });
  });
});
