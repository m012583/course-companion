export type ChatImage = { fileId: string; name: string };
export type ChatTurn = { role: string; content: string; images?: ChatImage[] };
export function readChatImages(value: unknown): ChatImage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3)
    throw new Error('每条消息最多附 3 张图片。');
  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.fileId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(item.fileId) ||
      typeof item.name !== 'string' ||
      item.name.length > 200
    )
      throw new Error('图片信息无效，请重新添加。');
    return { fileId: item.fileId, name: item.name };
  });
}
export function imageMime(bytes: Uint8Array) {
  const head = String.fromCharCode(...bytes.slice(0, 12));
  if (bytes[0] === 0x89 && head.slice(1, 4) === 'PNG') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a'))
    return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP')
    return 'image/webp';
  throw new Error('图片格式不支持，请使用 PNG、JPEG、WebP 或 GIF。');
}
export async function imageMessages(
  turns: ChatTurn[],
  load: (id: string) => Promise<Uint8Array>,
) {
  let remaining = 6;
  const selected = turns.map((): ChatImage[] => []);
  for (let index = turns.length - 1; index >= 0 && remaining > 0; index--) {
    selected[index] = (turns[index].images ?? []).slice(-remaining);
    remaining -= selected[index].length;
  }
  const keep = new Set(selected.flat().map((image) => image.fileId));
  const data = new Map<string, string>();
  for (const id of keep) {
    const bytes = await load(id);
    if (bytes.length > 5 * 1024 * 1024)
      throw new Error('单张图片不能超过 5 MB，请压缩后重试。');
    data.set(
      id,
      `data:${imageMime(bytes)};base64,${Buffer.from(bytes).toString('base64')}`,
    );
  }
  return turns.map((turn, index) => {
    const images = selected[index];
    const text =
      turn.content +
      ((turn.images?.length ?? 0) > images.length
        ? '\n[部分先前的图片已省略，请勿推测其内容。]'
        : '');
    return {
      role: turn.role,
      content: images.length
        ? [
            { type: 'text', text },
            ...images.map((image) => ({
              type: 'image_url',
              image_url: { url: data.get(image.fileId), detail: 'auto' },
            })),
          ]
        : text,
    };
  });
}
