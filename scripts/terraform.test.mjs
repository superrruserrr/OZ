// Infrastructure Scaleway en code (lot 0.8b) : versions figées, état et secrets hors du dépôt.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../infra/terraform/', import.meta.url);
const read = (path) => {
  const url = new URL(path, ROOT);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '.terraform') continue;
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) walk(new URL(`${name}/`, dir), out);
    else out.push(url.pathname.slice(ROOT.pathname.length));
  }
  return out;
};
const files = walk(ROOT);
const hcl = files.filter((path) => /\.(tf|tftest\.hcl)$/.test(path));
const ROOTS = ['bootstrap', 'envs/staging', 'envs/production', 'modules/stack'];

describe('infra/terraform', () => {
  it('contient les racines et les modules prévus', () => {
    for (const root of ROOTS) expect(files).toContain(`${root}/versions.tf`);
    for (const mod of ['network', 'instance', 'postgres', 'redis', 'storage', 'secret']) {
      expect(files).toContain(`modules/${mod}/main.tf`);
    }
  });

  it('fige Terraform et chaque fournisseur à une version exacte', () => {
    const versions = files.filter((path) => path.endsWith('versions.tf'));
    expect(versions.length).toBeGreaterThanOrEqual(ROOTS.length);
    for (const path of versions) {
      const text = read(path);
      expect(text, path).toMatch(/required_version\s*=\s*"\d+\.\d+\.\d+"/);
      for (const [, constraint] of text.matchAll(/version\s*=\s*"([^"]+)"/g)) {
        expect(constraint, path).toMatch(/^\d+\.\d+\.\d+$/);
      }
    }
  });

  it('versionne un lockfile par racine, avec les empreintes du poste et de la CI', () => {
    for (const root of ROOTS) {
      const lock = read(`${root}/.terraform.lock.hcl`);
      expect(lock, root).toContain('registry.terraform.io/scaleway/scaleway');
      // Une empreinte h1 par plateforme demandée (darwin_arm64, linux_amd64) au minimum.
      for (const block of lock.split(/^provider /m).slice(1)) {
        expect(
          (block.match(/"h1:/g) ?? []).length,
          `${root} : ${block.split('\n')[0]}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("ne contient ni identifiant, ni adresse IP publique, ni fichier d'état", () => {
    expect(files.some((path) => /\.tfstate|\.tfvars$/.test(path))).toBe(false);
    for (const path of hcl) {
      const text = read(path);
      expect(text, path).not.toMatch(/SCW[A-Z0-9]{17}/); // clé d'accès Scaleway
      // Identifiants de projet ou d'application : seuls les faux des tests (11111111-…) sont admis.
      for (const [uuid] of text.matchAll(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      )) {
        expect(uuid, path).toMatch(/^(\d)\1{7}-/);
      }
      expect(text, path).not.toMatch(/\b(access_key|secret_key)\s*=/);
      const ips = [...text.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})(?:\/\d+)?\b/g)].map((m) => m[1]);
      // Seules les plages privées, documentaires et « toutes adresses » sont admises.
      for (const ip of ips)
        expect(ip, path).toMatch(
          /^(0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/,
        );
    }
  });

  it('impose la région de Paris par défaut', () => {
    for (const root of ['bootstrap', 'envs/staging', 'envs/production']) {
      expect(read(`${root}/versions.tf`), root).toMatch(/region\s*=\s*"fr-par"/);
    }
  });

  it("garde l'état dans le bucket dédié, verrouillé", () => {
    for (const env of ['staging', 'production']) {
      const backend = read(`envs/${env}/backend.tf`);
      expect(backend).toMatch(/backend "s3"/);
      expect(backend).toMatch(new RegExp(`key\\s*=\\s*"${env}/terraform.tfstate"`));
      expect(backend).toMatch(/use_lockfile\s*=\s*true/);
    }
    expect(read('bootstrap/main.tf')).toMatch(/versioning\s*{\s*enabled\s*=\s*true/);
  });

  it("n'écrit aucun mot de passe ni secret en clair dans l'état : formes en écriture seule seulement", () => {
    for (const path of hcl.filter((p) => p.startsWith('modules/'))) {
      expect(read(path), path).not.toMatch(/^\s*(password|data)\s*=/m);
    }
  });

  it.each([
    ['modules/postgres/main.tf', 'scaleway_rdb_instance'],
    ['modules/redis/main.tf', 'scaleway_redis_cluster'],
    ['modules/storage/main.tf', 'scaleway_object_bucket" "main'],
    ['modules/storage/main.tf', 'scaleway_object_bucket" "backup'],
    ['bootstrap/main.tf', 'scaleway_object_bucket" "state'],
  ])('%s : %s protégé contre la destruction', (path, resource) => {
    const text = read(path);
    const block = text.slice(text.indexOf(resource), text.indexOf('\n}\n', text.indexOf(resource)));
    expect(block).toMatch(/lifecycle\s*{\s*prevent_destroy\s*=\s*true/);
  });

  it('expose les versions de rotation dans chaque environnement (README, rotation)', () => {
    for (const env of ['staging', 'production']) {
      for (const name of [
        'postgres_password_version',
        'redis_password_version',
        's3_key_version',
        'jwt_key_version',
      ]) {
        expect(read(`envs/${env}/variables.tf`), `${env} ${name}`).toContain(`variable "${name}"`);
        expect(read(`envs/${env}/main.tf`), `${env} ${name}`).toMatch(
          new RegExp(`${name}\\s*=\\s*var\\.${name}`),
        );
      }
    }
  });

  it('fournit un exemple de variables par environnement, sans valeur réelle', () => {
    for (const env of ['staging', 'production']) {
      expect(files).toContain(`envs/${env}/terraform.tfvars.example`);
    }
  });
});

describe('trivy.yaml', () => {
  it('ignore les fournisseurs Terraform téléchargés (binaires tiers, faux positifs)', () => {
    expect(readFileSync(new URL('../trivy.yaml', import.meta.url), 'utf8')).toMatch(
      /- '\*\*\/\.terraform'/,
    );
  });
});

describe('.gitignore', () => {
  const rules = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split('\n');
  it.each(['.terraform/', '*.tfstate', '*.tfstate.*', '*.tfvars', 'crash.log'])(
    'ignore %s',
    (rule) => {
      expect(rules).toContain(rule);
    },
  );
});

describe('scripts/install-ci-tools.sh', () => {
  const script = readFileSync(new URL('install-ci-tools.sh', import.meta.url), 'utf8');
  it('installe Terraform depuis releases.hashicorp.com, empreinte vérifiée', () => {
    expect(script).toMatch(
      /install_zip terraform\s*\\\s*\n\s*https:\/\/releases\.hashicorp\.com\/terraform\/(\d+\.\d+\.\d+)\/terraform_\1_linux_amd64\.zip\s*\\\s*\n\s*[0-9a-f]{64}/,
    );
  });
  it('utilise la même version que les racines', () => {
    const version = script.match(/terraform\/(\d+\.\d+\.\d+)\//)?.[1];
    expect(read('envs/staging/versions.tf')).toContain(`required_version = "${version}"`);
  });
});
