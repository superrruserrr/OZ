import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bull = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn(), names: [] as string[] }));
vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) {
      bull.names.push(name);
    }
    add = bull.add;
    close = bull.close;
  },
}));

const { DOCUMENT_SCAN_QUEUE, ScanQueue } = await import('./scan-queue.js');

const DOCUMENT = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ScanQueue', () => {
  it('file `document-scan`, charge réduite à l’identifiant, identifiant de job = document', async () => {
    const queue = new ScanQueue({} as Redis);
    await queue.enqueue(DOCUMENT);
    expect(bull.names).toContain(DOCUMENT_SCAN_QUEUE);
    expect(bull.add).toHaveBeenCalledWith(
      'scan-document',
      { documentId: DOCUMENT },
      expect.objectContaining({ jobId: DOCUMENT, attempts: 5, removeOnFail: false }),
    );
  });

  it('identifiant mal formé : refusé avant la file', async () => {
    const queue = new ScanQueue({} as Redis);
    await expect(queue.enqueue('quarantine/x')).rejects.toThrow();
    expect(bull.add).not.toHaveBeenCalled();
  });

  it('échec de Redis : l’erreur remonte à l’appelant', async () => {
    bull.add.mockRejectedValueOnce(new Error('redis indisponible'));
    await expect(new ScanQueue({} as Redis).enqueue(DOCUMENT)).rejects.toThrow('redis');
  });

  it('ferme la file à l’arrêt', async () => {
    await new ScanQueue({} as Redis).onModuleDestroy();
    expect(bull.close).toHaveBeenCalledOnce();
  });
});
