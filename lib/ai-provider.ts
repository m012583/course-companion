export function isDeepSeek() {
  try {
    return (
      new URL(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
        .hostname === 'api.deepseek.com'
    );
  } catch {
    return false;
  }
}
export function resolveModel(requested?: string) {
  if (isDeepSeek())
    return requested === 'deepseek-v4-pro' ? requested : 'deepseek-flash';
  return requested || process.env.OPENAI_MODEL || 'gpt-4o-mini';
}
export function providerOptions() {
  return isDeepSeek() ? { thinking: { type: 'disabled' } } : {};
}
export function supportsImages(model?: string) {
  return isDeepSeek()
    ? resolveModel(model) === 'deepseek-flash'
    : process.env.OPENAI_SUPPORTS_VISION === 'true';
}
export function publicAiSettings() {
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
