import type { AiConfig } from './ai-config';
export function isDeepSeek(config?: AiConfig) {
  try {
    return (
      new URL(
        config?.baseUrl ||
          process.env.OPENAI_BASE_URL ||
          'https://api.openai.com/v1',
      ).hostname === 'api.deepseek.com'
    );
  } catch {
    return false;
  }
}
export function resolveModel(requested?: string, config?: AiConfig) {
  if (config) return config.model;
  if (isDeepSeek())
    return requested === 'deepseek-v4-pro' ? requested : 'deepseek-flash';
  return requested || process.env.OPENAI_MODEL || 'gpt-4o-mini';
}
export function providerOptions(config?: AiConfig) {
  return isDeepSeek(config) ? { thinking: { type: 'disabled' } } : {};
}
export function supportsImages(model?: string, config?: AiConfig) {
  if (config) return config.vision;
  return isDeepSeek()
    ? resolveModel(model) === 'deepseek-flash'
    : process.env.OPENAI_SUPPORTS_VISION === 'true';
}
export function publicAiSettings(config?: AiConfig) {
  if (config)
    return {
      configured: !!config.apiKey,
      provider: isDeepSeek(config) ? 'DeepSeek 官网' : '自定义兼容服务',
      defaultModel: config.model,
      models: [{ id: config.model, name: config.model, vision: config.vision }],
    };
  return {
    configured: !!process.env.OPENAI_API_KEY,
    provider: isDeepSeek() ? 'DeepSeek 官网' : '自定义兼容服务',
    defaultModel: resolveModel(),
    models: isDeepSeek()
      ? [
          {
            id: 'deepseek-flash',
            name: 'DeepSeek V4.1 Flash · 文字与视觉',
            vision: true,
          },
          {
            id: 'deepseek-v4-pro',
            name: 'DeepSeek V4 Pro · 文字',
            vision: false,
          },
        ]
      : [
          {
            id: resolveModel(),
            name: resolveModel(),
            vision: supportsImages(),
          },
        ],
  };
}
