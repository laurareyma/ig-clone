import type { Story, StoryGroup } from '@/domain/entities';
import { toMillis } from '@/domain/timestamps';

// Agrupa las historias por autor para la fila de historias.
//
// Orden de los grupos: primero el del usuario actual, luego los que tienen algo sin ver
// y al final los ya vistos; dentro de cada bloque, el de la historia más reciente antes.
// Las caducadas se descartan aquí además de en el servidor: la copia local puede tener
// horas, y una historia no debe verse pasadas sus 24 h aunque no haya conexión.
export function groupStories(stories: Story[], now: Date, currentUserId: string): StoryGroup[] {
  const nowMs = now.getTime();
  const byAuthor = new Map<string, Story[]>();

  for (const story of stories) {
    if (toMillis(story.expiresAt) <= nowMs) continue;
    const list = byAuthor.get(story.author.id) ?? [];
    byAuthor.set(story.author.id, list);
    list.push(story);
  }

  const groups = [...byAuthor.values()].map((list): StoryGroup => {
    const ordered = [...list].sort(
      (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt) || a.id.localeCompare(b.id),
    );
    return { author: ordered[0].author, stories: ordered, allSeen: ordered.every((s) => s.seen) };
  });

  const rank = (group: StoryGroup) =>
    group.author.id === currentUserId ? 0 : group.allSeen ? 2 : 1;
  const latest = (group: StoryGroup) => toMillis(group.stories[group.stories.length - 1].createdAt);

  return groups.sort((a, b) => rank(a) - rank(b) || latest(b) - latest(a));
}

// Por dónde empezar a reproducir un grupo: la primera sin ver, o desde el principio si
// ya se vieron todas.
export function firstUnseenIndex(group: StoryGroup): number {
  const index = group.stories.findIndex((story) => !story.seen);
  return index === -1 ? 0 : index;
}

export type StoryPosition = { group: number; story: number };

// Siguiente historia: la próxima del mismo autor o la primera sin ver del siguiente.
// null = no queda nada, se cierra el visor.
export function nextStory(groups: StoryGroup[], at: StoryPosition): StoryPosition | null {
  if (at.story + 1 < groups[at.group].stories.length) {
    return { group: at.group, story: at.story + 1 };
  }
  if (at.group + 1 < groups.length) {
    return { group: at.group + 1, story: firstUnseenIndex(groups[at.group + 1]) };
  }
  return null;
}

// Historia anterior: la previa del mismo autor o la última del autor anterior. En la
// primera de todas se queda donde está (la reinicia).
export function previousStory(groups: StoryGroup[], at: StoryPosition): StoryPosition {
  if (at.story > 0) return { group: at.group, story: at.story - 1 };
  if (at.group > 0) {
    return { group: at.group - 1, story: groups[at.group - 1].stories.length - 1 };
  }
  return at;
}
