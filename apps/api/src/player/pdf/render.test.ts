import { qrModules } from '@oz/core';
import { describe, expect, it } from 'vitest';
import { badgeOf, cardPdf, initialsOf } from './card.js';
import { pdfStreams, pdfTexts } from '../../../test/pdf-text.js';
import { printedRows, profilePdf, watermarkText } from './profile.js';
import { winAnsi } from './render.js';

// Rendu des documents de la fiche (lot 1.13b) : champs exacts, filigrane, QR, ressources, taille.

const ISSUED = new Date('2026-11-09T10:30:00.000Z');
const URL = 'https://oz.example/joueur/OZ-CM-26-7K4M9Q-M';
const MARK = { reader: 'r***@example.test', role: 'club', issuedAt: ISSUED };

describe('winAnsi', () => {
  it('garde le français, remplace le reste', () => {
    expect(winAnsi('Éloïse Œuvre — 12 €')).toBe('Éloïse Œuvre — 12 €');
    expect(winAnsi('Нина 李')).toBe('???? ?');
  });
});

describe('profilePdf', () => {
  const view = {
    id: '00000000-0000-4000-8000-000000000001',
    ozId: 'OZ-CM-26-7K4M9Q-M',
    firstName: 'Éloïse',
    lastName: 'Ndongo',
    birthYear: 2001,
    country: 'CM',
    city: null,
    primaryPosition: 'striker' as const,
    verificationLevel: 2 as const,
    organizationId: null,
  };

  it('imprime chaque champ de la vue, et seulement eux, sans identifiant interne', async () => {
    const texts = (await profilePdf(view, MARK)).length;
    expect(texts).toBeLessThan(200_000);
    const printed = printedRows(view);
    expect(printed.map(([label]) => label)).toEqual([
      'OZ ID',
      'Prénom',
      'Nom',
      'Année de naissance',
      'Pays',
      'Ville',
      'Poste principal',
      'Niveau de vérification',
    ]);
    const all = pdfTexts(await profilePdf(view, MARK)).join('\n');
    for (const [label, value] of printed) {
      expect(all).toContain(label);
      expect(all).toContain(value);
    }
    expect(all).not.toContain(view.id);
    expect(all).not.toContain('Date de naissance');
  });

  it('filigrane du lecteur sur chaque page, pied compris', async () => {
    const all = pdfTexts(await profilePdf(view, MARK));
    const mark = watermarkText(MARK);
    expect(mark).toBe('Exporté par r***@example.test (club) le 2026-11-09 10:30 UTC');
    expect(all.filter((text) => text === mark).length).toBeGreaterThan(3);
  });

  it('aucune ressource externe : ni lien, ni image, ni police embarquée ; rendu sous 300 ms', async () => {
    const started = performance.now();
    const pdf = await profilePdf(view, MARK);
    expect(performance.now() - started).toBeLessThan(300);
    const raw = pdf.toString('latin1');
    expect(raw).not.toMatch(/\/URI|\/Launch|\/JavaScript|\/XObject|\/FontFile/);
    expect(raw).toContain('/BaseFont /Helvetica');
  });
});

describe('cardPdf', () => {
  const card = {
    ozId: 'OZ-CM-26-7K4M9Q-M',
    firstName: 'Éloïse',
    lastName: 'Ndongo',
    verificationLevel: 1 as const,
    verificationStatus: 'verified',
    profileUrl: URL,
    issuedAt: ISSUED,
  };

  it('format ID-1, OZ ID, nom, initiales, badge, date d’édition', async () => {
    const pdf = await cardPdf(card);
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 242\.64\d* 153\.07\d*\]/);
    const all = pdfTexts(pdf).join('\n');
    expect(all).toContain('OZ-CM-26-7K4M9Q-M');
    expect(all).toContain('Éloïse Ndongo');
    expect(all).toContain('ÉN');
    expect(all).toContain('Email et téléphone vérifiés');
    expect(all).toContain('Édition du 2026-11-09 — le statut en ligne fait foi.');
    expect(all).not.toContain(URL);
  });

  it('QR : un carré par module sombre de la matrice de l’URL', async () => {
    const content = pdfStreams(await cardPdf(card)).join('\n');
    const squares = content.match(/ re\n/g)?.length ?? 0;
    const dark = qrModules(URL).flat().filter(Boolean).length;
    // Fond du QR en plus des modules.
    expect(squares).toBe(dark + 1);
  });

  it('nom très long : une seule ligne coupée, rien ne chevauche l’OZ ID', async () => {
    const long = await cardPdf({ ...card, firstName: 'A'.repeat(100), lastName: 'B'.repeat(100) });
    const texts = pdfTexts(long);
    const names = texts.filter((text) => text.includes('AAA'));
    expect(names).toHaveLength(1);
    expect(names[0]?.endsWith('…')).toBe(true);
    expect(texts.join('\n')).toContain('OZ-CM-26-7K4M9Q-M');
  });

  it('badge : suspendu ou refusé prime sur le niveau', () => {
    expect(badgeOf({ verificationLevel: 2, verificationStatus: 'suspended' })).toBe(
      'Vérification suspendue',
    );
    expect(badgeOf({ verificationLevel: 2, verificationStatus: 'rejected' })).toBe(
      'Vérification refusée',
    );
    expect(badgeOf({ verificationLevel: 2, verificationStatus: 'verified' })).toBe(
      'Identité vérifiée',
    );
  });

  it('initiales : nom vide ou écriture non latine', () => {
    expect(initialsOf('', '')).toBe('?');
    expect(initialsOf('李', 'Нина')).toBe('??');
  });
});
