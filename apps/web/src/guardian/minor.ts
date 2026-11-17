/** Moins de 18 ans révolus à la date du jour (UTC), comme `oz_is_minor` côté base. */
export function isMinor(birthDate: string | undefined, now: Date = new Date()): boolean {
  if (birthDate === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  const adult = Date.UTC(year + 18, month - 1, day);
  return now.getTime() < adult;
}
