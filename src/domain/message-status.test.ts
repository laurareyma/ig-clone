import type { Message } from '@/domain/entities';
import { messageStatus } from '@/domain/message-status';

const message = (createdAt: string, pending = false): Message => ({
  id: 'm',
  conversationId: 'c',
  senderId: 'yo',
  body: 'hola',
  createdAt,
  pending,
});

const at = (minute: number) => `2026-01-01T10:${String(minute).padStart(2, '0')}:00.123456+00:00`;
const marks = (delivered: number | null, read: number | null) => ({
  otherLastDeliveredAt: delivered === null ? null : at(delivered),
  otherLastReadAt: read === null ? null : at(read),
});

describe('messageStatus', () => {
  it('en la cola: enviando, aunque las marcas sean posteriores', () => {
    expect(messageStatus(message(at(5), true), marks(9, 9))).toBe('sending');
  });

  it('sin marcas del otro: enviado', () => {
    expect(messageStatus(message(at(5)), marks(null, null))).toBe('sent');
  });

  it('el otro recibió después de enviarse: entregado', () => {
    expect(messageStatus(message(at(5)), marks(6, null))).toBe('delivered');
  });

  it('el otro leyó después de enviarse: visto', () => {
    expect(messageStatus(message(at(5)), marks(6, 7))).toBe('read');
  });

  it('un mensaje posterior a la última lectura no está visto, pero puede estar entregado', () => {
    expect(messageStatus(message(at(8)), marks(9, 7))).toBe('delivered');
    expect(messageStatus(message(at(8)), marks(7, 7))).toBe('sent');
  });

  it('compara instantes, no texto: funciona con formatos de fecha distintos', () => {
    // Mensaje con la hora del cliente (Z, milisegundos) y marca del servidor (+00:00).
    expect(messageStatus(message('2026-01-01T10:05:00.000Z'), marks(6, null))).toBe('delivered');
  });
});
