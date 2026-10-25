import { describe, it, expect } from 'vitest';
import { isPublicationDue } from '../src/chat/publication.js';

describe('fecha de publicación', () => {
  it('Dada una fecha de publicación, cuando cambia el día en Argentina, entonces se habilita a las 03:00 UTC', () => {
    expect(isPublicationDue('2026-10-10', new Date('2026-10-10T02:59:59Z'))).toBe(false);
    expect(isPublicationDue('2026-10-10', new Date('2026-10-10T03:00:00Z'))).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', 'invalid', ''])(
    'Dada la fecha inválida %s, cuando se evalúa publicación, entonces la excluye',
    (date) => expect(isPublicationDue(date)).toBe(false),
  );
});
