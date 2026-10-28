import { isIP } from 'node:net';

/** Les huit groupes de 16 bits d'une IPv6 valide, en hexadécimal sans zéro de tête. */
function ipv6Groups(address: string): string[] {
  const [head = '', tail] = address.split('::');
  const part = (text: string): string[] =>
    text === ''
      ? []
      : text.split(':').flatMap((group) => {
          // Fin en notation IPv4 (`::1.2.3.4`) : deux groupes.
          if (!group.includes('.')) return [group];
          const [a = 0, b = 0, c = 0, d = 0] = group.split('.').map(Number);
          return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
        });
  const left = part(head);
  const right = tail === undefined ? [] : part(tail);
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => '0');
  return [...left, ...zeros, ...right].map((group) => parseInt(group, 16).toString(16));
}

/**
 * IPv4 portée par une IPv4 mappée (`::ffff:0:0/96`), sous toutes ses écritures (`::ffff:1.2.3.4`,
 * `::ffff:102:304`) : écoute en double pile, ou mandataire qui la transmet ainsi.
 */
function mappedIpv4(groups: readonly string[]): string | null {
  if (groups.slice(0, 5).some((group) => group !== '0') || groups[5] !== 'ffff') return null;
  const high = parseInt(groups[6] ?? '0', 16);
  const low = parseInt(groups[7] ?? '0', 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/**
 * IP du client (`req.ip`, déjà résolue selon `TRUST_PROXY`), normalisée : identifiant de zone retiré
 * (`fe80::1%eth0`, refusé par le type `inet`), IPv4 mappée ramenée en IPv4 ; null si absente ou
 * illisible.
 */
export function clientIp(ip: string | undefined): string | null {
  if (ip === undefined) return null;
  const address = ip.replace(/%.*$/, '');
  const version = isIP(address);
  if (version === 4) return address;
  if (version === 0) return null;
  return mappedIpv4(ipv6Groups(address)) ?? address;
}

/**
 * Clé de limitation de débit par client (D7 du lot 1.3ca) : IPv4 entière, IPv6 par /64 (un abonné
 * reçoit tout un /64 et en change d'adresse à volonté). Adresse inconnue : null, la requête est
 * refusée plutôt que comptée dans un compteur commun que n'importe qui pourrait épuiser.
 */
export function rateLimitKey(ip: string | undefined): string | null {
  const address = clientIp(ip);
  if (address === null) return null;
  if (isIP(address) === 4) return address;
  return `${ipv6Groups(address).slice(0, 4).join(':')}::/64`;
}
