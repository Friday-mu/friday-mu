import {
  TASK_USERS,
  TASK_USER_BY_ID,
  type Task,
  type TaskComment,
} from './tasks';
import {
  recordTaskCommentTeamMessage,
  type TeamMessage,
} from './teamInbox';
import {
  recordTaskCommentMentionNotification,
  type Notification,
} from './notifications';

function mentionTokensForUser(userId: string): string[] {
  const user = TASK_USER_BY_ID[userId];
  if (!user) return [];
  const [first] = user.name.split(' ');
  return [`@${user.name}`, `@${first}`, `@${user.initials}`];
}

function includesMention(text: string, token: string): boolean {
  const normalized = text.toLowerCase();
  const needle = token.toLowerCase();
  const idx = normalized.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 ? '' : normalized[idx - 1];
  const after = normalized[idx + needle.length] ?? '';
  const beforeOk = before === '' || /\s|[([{]/.test(before);
  const afterOk = after === '' || /\s/.test(after) || '.,;:!?)]}'.includes(after);
  return beforeOk && afterOk;
}

export function resolveTaskCommentMentions(text: string): string[] {
  const mentioned = new Set<string>();
  TASK_USERS
    .filter((user) => user.active && user.role !== 'external')
    .forEach((user) => {
      if (mentionTokensForUser(user.id).some((token) => includesMention(text, token))) {
        mentioned.add(user.id);
      }
    });
  return [...mentioned];
}

export function appendMentionToken(text: string, userId: string): string {
  const user = TASK_USER_BY_ID[userId];
  if (!user) return text;
  const suffix = text.length > 0 && !text.endsWith(' ') ? ' ' : '';
  return `${text}${suffix}@${user.name} `;
}

function preview(text: string, limit = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trim()}...`;
}

export function publishTaskCommentMentionBridge({
  task,
  comment,
  authorId,
  mentionIds,
}: {
  task: Task;
  comment: TaskComment;
  authorId: string;
  mentionIds: string[];
}): void {
  if (mentionIds.length === 0) return;
  const author = TASK_USER_BY_ID[authorId] ?? TASK_USER_BY_ID[comment.authorId];
  const authorName = author?.name ?? 'A teammate';
  const commentPreview = preview(comment.text);
  const taskHref = `/fad?m=operations&task=${encodeURIComponent(task.id)}&comment=${encodeURIComponent(comment.id)}`;

  const message: TeamMessage = {
    id: `tm-task-comment-${task.id}-${comment.id}`,
    channelKey: 'ops',
    authorId,
    text: comment.text,
    ts: comment.ts,
    mentions: mentionIds,
    kind: 'task_link',
    linkedTaskId: task.id,
    taskComment: {
      taskId: task.id,
      taskTitle: task.title,
      propertyCode: task.propertyCode,
      commentId: comment.id,
      commentPreview,
    },
  };
  recordTaskCommentTeamMessage(message);

  mentionIds.forEach((mentionId) => {
    const notification: Notification = {
      id: `task-comment-${task.id}-${comment.id}-${mentionId}`,
      title: `${authorName} mentioned you on ${task.propertyCode}`,
      body: `${task.title}\n${commentPreview}`,
      ts: comment.ts,
      severity: task.priority === 'urgent' || task.priority === 'high' ? 'warn' : 'info',
      module: 'operations',
      category: 'comment',
      sourceId: task.id,
      commentId: comment.id,
      href: taskHref,
      isMention: true,
      targetUserId: mentionId,
    };
    recordTaskCommentMentionNotification(notification);
  });
}
