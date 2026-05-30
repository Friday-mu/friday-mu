import { apiFetch } from '../../../components/types';

// Task attachments API client — durable per-task evidence/photos.
// Mirrors expensesClient's receipt list/content/display shape. Backend:
// migration 113 (task_attachments, inline_base64) + src/tasks/index.js
// (POST/GET /:id/attachments, GET /attachments/:id/content). One file per
// upload request (the backend caps each at 7MB to stay under the 10mb
// JSON body limit).

export interface TaskAttachmentMeta {
  id: string;
  task_id: string;
  kind: 'evidence' | 'before' | 'after' | 'document' | 'other';
  file_name: string | null;
  content_type: string | null;
  byte_size: number | null;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export type TaskAttachmentContent = {
  kind: 'inline_base64';
  base64: string;
  file_name: string | null;
  content_type: string | null;
  byte_size: number | null;
};

export interface UploadTaskAttachmentInput {
  base64: string;
  file_name?: string;
  content_type?: string;
  kind?: TaskAttachmentMeta['kind'];
  caption?: string;
}

export interface UploadTaskAttachmentResult {
  attachments: TaskAttachmentMeta[];
  duplicates: number;
}

/** Largest decoded file we let through client-side. Mirrors the backend
 *  7MB cap (base64 ~9.3MB, under the 10mb express.json body limit). */
export const MAX_TASK_ATTACHMENT_BYTES = 7 * 1024 * 1024;

export function fetchTaskAttachments(taskId: string): Promise<{ attachments: TaskAttachmentMeta[] }> {
  return apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/attachments`) as Promise<{ attachments: TaskAttachmentMeta[] }>;
}

export function uploadTaskAttachment(taskId: string, input: UploadTaskAttachmentInput): Promise<UploadTaskAttachmentResult> {
  return apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  }) as Promise<UploadTaskAttachmentResult>;
}

export function fetchTaskAttachmentContent(attachmentId: string): Promise<TaskAttachmentContent> {
  return apiFetch(`/api/tasks/attachments/${encodeURIComponent(attachmentId)}/content`) as Promise<TaskAttachmentContent>;
}

/** Materialize attachment content into a browser-renderable URL (img src,
 *  link href). Data URL for inline rows. */
export function taskAttachmentDisplayUrl(content: TaskAttachmentContent): string {
  const type = content.content_type || 'application/octet-stream';
  return `data:${type};base64,${content.base64}`;
}

export function isImageAttachment(contentType: string | null | undefined): boolean {
  return typeof contentType === 'string' && contentType.startsWith('image/');
}
