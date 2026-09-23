import { z } from 'zod';
import { parseWorkspace } from './workspace-schema';
import type { Workspace } from './workspace';

export const MAX_BACKUP_BYTES = 150 * 1024 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export type BackupFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
  data: string;
};
export type Backup = {
  format: 'course-companion';
  version: 1;
  createdAt: string;
  state: Workspace;
  files: BackupFile[];
};
export function fileIds(value: unknown): string[] {
  const ids = new Set<string>();
  function visit(item: unknown) {
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      if (key === 'fileId' && typeof child === 'string' && child)
        ids.add(child);
      else if (typeof child === 'object') visit(child);
    }
  }
  visit(value);
  return [...ids];
}
export function remapFiles(
  state: Workspace,
  mapping: Map<string, string>,
): Workspace {
  return JSON.parse(
    JSON.stringify(state, (key, value: unknown) =>
      (key === 'fileId' || key === 'materialKey') && typeof value === 'string'
        ? (mapping.get(value) ?? value)
        : value,
    ),
  ) as Workspace;
}
export function encodeBytes(bytes: Uint8Array): string {
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
export function decodeBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export async function checksum(bytes: Uint8Array): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
const schema = z.object({
  format: z.literal('course-companion'),
  version: z.literal(1),
  createdAt: z.string(),
  state: z.unknown(),
  files: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      type: z.string(),
      size: z.number().int().min(0).max(MAX_FILE_BYTES),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      data: z.string().max(Math.ceil(MAX_FILE_BYTES / 3) * 4),
    }),
  ),
});
export async function validateBackup(value: unknown): Promise<Backup> {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('不是有效的课伴完整备份（版本 1）');
  const backup = result.data;
  const state = parseWorkspace(backup.state);
  if (backup.files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES)
    throw new Error('附件总量超过 100 MB');
  const needed = new Set(fileIds(state));
  if (
    backup.files.length !== needed.size ||
    new Set(backup.files.map((f) => f.id)).size !== needed.size
  )
    throw new Error('附件缺失或重复');
  for (const file of backup.files) {
    if (!needed.has(file.id)) throw new Error('备份包含未引用附件');
    const bytes = decodeBytes(file.data);
    if (bytes.length !== file.size || (await checksum(bytes)) !== file.sha256)
      throw new Error(`附件校验失败：${file.name}`);
  }
  return { ...backup, state };
}
