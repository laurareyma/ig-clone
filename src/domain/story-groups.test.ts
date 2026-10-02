import type { Story } from '@/domain/entities';
import { firstUnseenIndex, groupStories, nextStory, previousStory } from '@/domain/story-groups';
import { profileFixture } from '@/testing/fixtures';

const now = new Date('2026-01-02T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600_000);

// Publicada hace `age` horas; caduca a las 24 h.
const story = (id: string, authorId: string, age: number, seen = false): Story => ({
  id,
  author: profileFixture(authorId),
  imagePath: `${authorId}/stories/${id}.jpg`,
  createdAt: hoursAgo(age).toISOString(),
  expiresAt: hoursAgo(age - 24).toISOString(),
  seen,
});

const shape = (stories: Story[]) =>
  groupStories(stories, now, 'yo').map((group) => [
    group.author.id,
    group.stories.map((item) => item.id),
    group.allSeen,
  ]);

describe('groupStories', () => {
  it('agrupa por autor y ordena cada grupo de la más antigua a la más nueva', () => {
    expect(shape([story('b2', 'beto', 1), story('b1', 'beto', 5)])).toEqual([
      ['beto', ['b1', 'b2'], false],
    ]);
  });

  it('descarta las que ya pasaron de 24 horas, aunque sigan guardadas en el dispositivo', () => {
    expect(shape([story('vieja', 'beto', 25), story('justa', 'beto', 24), story('viva', 'beto', 23)])).toEqual([
      ['beto', ['viva'], false],
    ]);
  });

  it('un autor sin historias vigentes no aparece', () => {
    expect(shape([story('vieja', 'beto', 30)])).toEqual([]);
  });

  it('orden: las mías, luego las que tienen algo sin ver (más reciente primero), luego las vistas', () => {
    const stories = [
      story('v1', 'vista', 1, true),
      story('c1', 'carla', 6),
      story('b1', 'beto', 2, true),
      story('b2', 'beto', 1),
      story('y1', 'yo', 20, true),
    ];

    expect(shape(stories).map(([author]) => author)).toEqual(['yo', 'beto', 'carla', 'vista']);
  });

  it('un grupo solo cuenta como visto si se vieron todas sus historias', () => {
    expect(shape([story('b1', 'beto', 3, true), story('b2', 'beto', 1)])[0][2]).toBe(false);
    expect(shape([story('b1', 'beto', 3, true), story('b2', 'beto', 1, true)])[0][2]).toBe(true);
  });
});

describe('reproducción', () => {
  const groups = groupStories(
    [
      story('b1', 'beto', 5, true),
      story('b2', 'beto', 4),
      story('c1', 'carla', 9, true),
      story('c2', 'carla', 8, true),
      story('c3', 'carla', 7),
    ],
    now,
    'yo',
  );

  it('empieza por la primera sin ver, o por el principio si ya se vieron todas', () => {
    expect(firstUnseenIndex(groups[0])).toBe(1);
    expect(firstUnseenIndex(groupStories([story('x', 'beto', 1, true)], now, 'yo')[0])).toBe(0);
  });

  it('avanza dentro del autor y luego pasa a la primera sin ver del siguiente', () => {
    expect(nextStory(groups, { group: 0, story: 0 })).toEqual({ group: 0, story: 1 });
    expect(nextStory(groups, { group: 0, story: 1 })).toEqual({ group: 1, story: 2 });
  });

  it('tras la última historia del último autor no queda nada', () => {
    expect(nextStory(groups, { group: 1, story: 2 })).toBeNull();
  });

  it('retrocede dentro del autor y luego a la última del autor anterior', () => {
    expect(previousStory(groups, { group: 1, story: 1 })).toEqual({ group: 1, story: 0 });
    expect(previousStory(groups, { group: 1, story: 0 })).toEqual({ group: 0, story: 1 });
  });

  it('en la primera de todas se queda donde está', () => {
    expect(previousStory(groups, { group: 0, story: 0 })).toEqual({ group: 0, story: 0 });
  });
});
