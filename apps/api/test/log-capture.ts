import { Writable } from 'node:stream';

/** Flux qui capture les lignes JSON écrites par pino. */
export interface LogCapture {
  stream: Writable;
  lines: () => Record<string, unknown>[];
  raw: () => string;
  /** Attend qu'une ligne contenant `text` soit écrite (pino-http écrit après la fin de la réponse). */
  waitFor: (text: string, timeoutMs?: number) => Promise<string>;
}

export function captureLogs(): LogCapture {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const raw = (): string => chunks.join('');
  const waitFor = async (text: string, timeoutMs = 1_000): Promise<string> => {
    const deadline = Date.now() + timeoutMs;
    while (!raw().includes(text)) {
      if (Date.now() > deadline)
        throw new Error(`log contenant « ${text} » non écrit en ${String(timeoutMs)} ms`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return raw();
  };
  return {
    stream,
    raw,
    waitFor,
    lines: () =>
      raw()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
