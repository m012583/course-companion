import { loadAiConfig } from './ai-config';
import {
  publicAiSettings,
  resolveModel,
  providerOptions,
  supportsImages,
} from './ai-provider';
// Keep settings request-local. Never overwrite process.env with user credentials.
export async function aiRuntime() {
  const config = await loadAiConfig();
  const selected = config.managed ? config : undefined;
  return {
    ...config,
    resolveModel: (model?: string) => resolveModel(model, selected),
    providerOptions: () => providerOptions(selected),
    supportsImages: (model?: string) => supportsImages(model, selected),
    publicSettings: () => ({
      ...publicAiSettings(selected),
      baseUrl: config.baseUrl,
      editable: !!process.env.COURSE_KB_AI_SECRET,
    }),
  };
}
