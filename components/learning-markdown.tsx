'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMath } from '@/lib/knowledge';
export default function LearningMarkdown({
  text,
  inline = false,
}: {
  text: string;
  inline?: boolean;
}) {
  const Container = inline ? 'span' : 'div';
  return (
    <Container className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={inline ? { p: 'span', a: 'span' } : undefined}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </Container>
  );
}
