// Lanceur du serveur Next autonome (D-013) : le serveur écoute sur process.env.HOSTNAME, et boucle en
// redirection ou s'arrête quand l'orchestrateur y met un nom de conteneur. L'adresse d'écoute est donc
// imposée ici, quelle que soit la variable reçue. APP est fixé au build (web ou admin).
process.env.HOSTNAME = '0.0.0.0';
const app = process.env.OZ_APP;
if (app !== 'web' && app !== 'admin') {
  process.stderr.write('✖ OZ_APP doit valoir web ou admin.\n');
  process.exit(1);
}
await import(`./apps/${app}/server.js`);
