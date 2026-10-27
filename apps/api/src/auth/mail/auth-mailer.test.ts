import { describe, expect, it } from 'vitest';
import { mailErrorCode } from './auth-mailer.js';

describe('mailErrorCode', () => {
  it('garde le code système ou SMTP de nodemailer', () => {
    expect(mailErrorCode(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(
      'ECONNREFUSED',
    );
    expect(mailErrorCode({ code: 'EAUTH' })).toBe('EAUTH');
  });

  it('ne reprend rien d’autre, même une chaîne qui pourrait citer l’adresse', () => {
    expect(mailErrorCode(new Error('550 personne@example.test inconnu'))).toBe('UNKNOWN');
    expect(mailErrorCode({ code: 'personne@example.test' })).toBe('UNKNOWN');
    expect(mailErrorCode({ code: 550 })).toBe('UNKNOWN');
    expect(mailErrorCode('ECONNREFUSED')).toBe('UNKNOWN');
    expect(mailErrorCode(null)).toBe('UNKNOWN');
  });
});
