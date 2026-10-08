// Parses SSE across arbitrary UTF-8 chunks, including CRLF and multiline data.
export async function* readEventStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  function take(final = false) {
    const blocks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      blocks.push(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
    if (final && buffer.trim()) {
      blocks.push(buffer);
      buffer = '';
    }
    return blocks
      .map((block) =>
        block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n'),
      )
      .filter(Boolean);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 1_000_000) throw new Error('流式数据过大。');
      for (const data of take(done)) yield data;
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
