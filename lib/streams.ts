export async function* readLines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let index: number;
      while ((index = pending.indexOf('\n')) >= 0) {
        yield pending.slice(0, index).replace(/\r$/, '');
        pending = pending.slice(index + 1);
      }
      if (done) break;
    }
    if (pending) yield pending;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
