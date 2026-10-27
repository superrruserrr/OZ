// Sonde HTTP des conteneurs (les images distroless n'ont ni shell ni curl) :
// `node healthcheck.mjs <url>` sort en 0 si l'URL répond sous 3 s avec un statut < 400, sinon en 1.
const url = process.argv[2];
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'manual' });
  process.exit(response.status < 400 ? 0 : 1);
} catch {
  process.exit(1);
}
