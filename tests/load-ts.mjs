import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const cache = new Map();
export async function moduleUrl(path, replacements = []) {
  const url = path instanceof URL ? path : new URL(path, import.meta.url);
  const key = url.href + JSON.stringify(replacements);
  if (cache.has(key)) return cache.get(key);
  let source = await readFile(url, 'utf8');
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  let js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const specs = [
    ...new Set(
      [...js.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)].map(
        (m) => m[2],
      ),
    ),
  ];
  for (const spec of specs) {
    let replacement;
    if (spec === 'cloudflare:workers')
      replacement =
        'data:text/javascript,' +
        encodeURIComponent('export const env = globalThis.__testStorage;');
    else if (spec.startsWith('@/'))
      replacement = await moduleUrl(
        new URL(
          '../' + spec.slice(2) + (spec.endsWith('.ts') ? '' : '.ts'),
          import.meta.url,
        ),
      );
    else if (spec.startsWith('.'))
      replacement = await moduleUrl(
        new URL(spec + (spec.endsWith('.ts') ? '' : '.ts'), url),
      );
    if (replacement)
      js = js
        .replaceAll(`'${spec}'`, `'${replacement}'`)
        .replaceAll(`"${spec}"`, `"${replacement}"`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  cache.set(key, result);
  return result;
}
