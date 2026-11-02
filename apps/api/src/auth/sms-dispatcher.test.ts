import type { SmsDelivery } from '@oz/auth';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { SmsDispatcher } from './sms-dispatcher.js';

const delivered: SmsDelivery = { delivered: true, provider: 'p', channel: 'sms', failures: [] };

describe('SmsDispatcher', () => {
  it('l’arrêt attend les envois annoncés par une réponse', async () => {
    let release: (value: SmsDelivery) => void = () => undefined;
    const deliver = vi.fn(() => new Promise<SmsDelivery>((resolve) => (release = resolve)));
    const info = vi.fn();
    const dispatcher = new SmsDispatcher({ deliver }, { info } as unknown as PinoLogger);
    dispatcher.sendLater('+237650000001', '042137');
    const stopped = dispatcher.beforeApplicationShutdown();
    expect(info).not.toHaveBeenCalled();
    release(delivered);
    await stopped;
    expect(info).toHaveBeenCalledOnce();
  });

  it('un journal qui lève ne laisse aucun rejet non traité', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const info = vi.fn(() => {
      throw new TypeError('journal');
    });
    const dispatcher = new SmsDispatcher({ deliver: () => Promise.resolve(delivered) }, {
      info,
    } as unknown as PinoLogger);
    dispatcher.sendLater('+237650000001', '042137');
    await dispatcher.flush();
    expect(write).toHaveBeenCalledWith('auth.otp.dispatch_failed TypeError\n');
    write.mockRestore();
  });
});
