export const BRAND_NAME = '课知屿';
export const PRODUCT_TITLE = '课知屿——AI 课程学习与知识管理平台';

const LEGACY_DEFAULT_NAMES = new Set([
  '课伴',
  '课伴·研学版',
  '课伴 · 研学版',
  '课伴研学版',
  '课伴·研学增强版',
  '课伴 · 研学增强版',
  '课伴研学增强版',
  '课伴知识库',
]);

// Upgrade only shipped default names. Keep custom names and every other
// preference intact; do not mutate imported backups or historical snapshots.
export function migrateBrandPreferences<T extends { brandName: string }>(
  preferences: T,
): T {
  return LEGACY_DEFAULT_NAMES.has(preferences.brandName.trim())
    ? { ...preferences, brandName: BRAND_NAME }
    : preferences;
}
