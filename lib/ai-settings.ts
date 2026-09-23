import { workspaceDb } from './workspace-server';
export type AIConfig = { baseUrl: string; model: string; apiKey: string };
export async function readAIConfig(): Promise<AIConfig> {
  const db = await workspaceDb();
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS ai_settings (id TEXT PRIMARY KEY, payload TEXT NOT NULL)',
    )
    .run();
  const row = await db
    .prepare('SELECT payload FROM ai_settings WHERE id = ?')
    .bind('local')
    .first<{ payload: string }>();
  return row
    ? JSON.parse(row.payload)
    : {
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
        model: process.env.OPENAI_MODEL || 'deepseek-flash',
        apiKey: process.env.OPENAI_API_KEY?.trim() || '',
      };
}
export function validateAIConfig(value: AIConfig) {
  if (
    !value.apiKey ||
    value.apiKey.length > 8192 ||
    !/^[\x21-\x7E]+$/.test(value.apiKey)
  )
    throw new Error('密钥格式不正确，请只粘贴平台生成的密钥。');
  if (!value.model.trim() || value.model.length > 200)
    throw new Error('请填写有效模型名称。');
  let url: URL;
  try {
    url = new URL(value.baseUrl);
  } catch {
    throw new Error('服务地址格式不正确。');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('服务地址必须是无账号、参数的 HTTPS 地址。');
}
export function providerError(status: number) {
  return status === 401 || status === 403
    ? '服务拒绝访问，请检查密钥及账号权限。'
    : status === 402
      ? '服务账户余额不足，请在服务商平台核对。'
      : status === 429
        ? '请求过于频繁，请稍后重试。'
        : `AI 服务请求失败（${status}），请核对模型和服务地址。`;
}
