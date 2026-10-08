import { storage } from './storage';
export type AiConfig = {
  managed?: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  vision: boolean;
};
export function environmentAiConfig(): AiConfig {
  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    vision:
      process.env.OPENAI_SUPPORTS_VISION === 'true' ||
      (process.env.OPENAI_SUPPORTS_VISION === undefined &&
        process.env.OPENAI_BASE_URL?.includes('api.deepseek.com') === true &&
        process.env.OPENAI_MODEL !== 'deepseek-v4-pro'),
  };
}
export function readAiConfig(value: unknown): AiConfig {
  const c = value as AiConfig;
  if (
    !c ||
    typeof c.apiKey !== 'string' ||
    c.apiKey.length > 2048 ||
    !c.apiKey.trim() ||
    /\s/.test(c.apiKey) ||
    typeof c.model !== 'string' ||
    !c.model.trim() ||
    c.model.length > 120 ||
    typeof c.baseUrl !== 'string' ||
    c.baseUrl.length > 500 ||
    typeof c.vision !== 'boolean'
  )
    throw new Error('请填写有效的服务地址、模型和密钥。');
  const url = new URL(c.baseUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('服务地址需要 HTTPS；本机模型可使用 localhost HTTP 地址。');
  return {
    apiKey: c.apiKey,
    model: c.model.trim(),
    baseUrl: url.href.replace(/\/$/, ''),
    vision: c.vision,
  };
}
export function localSettingsRequest(request: Request) {
  const url = new URL(request.url);
  return (
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    request.headers.get('origin') === url.origin
  );
}
async function encryptionKey() {
  const secret = process.env.COURSE_KB_AI_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      '请通过“启动增强版”或 npm run start:local 启动，以启用本机加密配置。',
    );
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function sealAiConfig(config: AiConfig) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(JSON.stringify(config)),
  );
  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(data)),
  });
}
export async function openAiConfig(payload: string): Promise<AiConfig> {
  try {
    const { iv, data } = JSON.parse(payload);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      await encryptionKey(),
      new Uint8Array(data),
    );
    return readAiConfig(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw new Error('本机 AI 配置无法解密，请在设置中重新保存配置。');
  }
}
async function configDb() {
  const db = storage().DB;
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS local_ai_config (id TEXT PRIMARY KEY, payload TEXT NOT NULL)',
    )
    .run();
  return db;
}
export async function loadAiConfig(): Promise<AiConfig> {
  if (!process.env.COURSE_KB_AI_SECRET) return environmentAiConfig();
  const row = await (
    await configDb()
  )
    .prepare('SELECT payload FROM local_ai_config WHERE id = ?')
    .bind('local')
    .first<{ payload: string }>();
  return row
    ? { ...(await openAiConfig(row.payload)), managed: true }
    : environmentAiConfig();
}
export async function saveAiConfig(config: AiConfig) {
  const payload = await sealAiConfig(readAiConfig(config));
  await (
    await configDb()
  )
    .prepare('INSERT OR REPLACE INTO local_ai_config (id,payload) VALUES (?,?)')
    .bind('local', payload)
    .run();
}
export async function clearAiConfig() {
  await (
    await configDb()
  )
    .prepare('DELETE FROM local_ai_config WHERE id = ?')
    .bind('local')
    .run();
}
