/**
 * Exécute `work` et ne rend la main qu'après `floorMs`, succès ou échec : la durée d'une réponse ne
 * révèle pas le travail effectué (existence du compte, CP-28).
 */
export async function withResponseFloor<T>(floorMs: number, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    const remaining = floorMs - (performance.now() - started);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, remaining)));
  }
}
