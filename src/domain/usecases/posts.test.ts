import type { CommentRepository } from '@/domain/repositories/comment-repository';
import type { PostRepository } from '@/domain/repositories/post-repository';
import { addComment, createPost, PostError } from '@/domain/usecases/posts';

const image = { imageUri: 'file:///foto.jpg', imageWidth: 1080, imageHeight: 1350 };

const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(PostError);
  return (error as PostError).code;
};

describe('createPost', () => {
  const posts = () => ({ create: jest.fn(async () => {}) }) as unknown as PostRepository;

  it('recorta el pie de foto y publica', async () => {
    const repository = posts();

    await createPost(repository, { ...image, caption: '  hola  ' });

    expect(repository.create).toHaveBeenCalledWith({ ...image, caption: 'hola' });
  });

  it('acepta un pie de foto vacío', async () => {
    const repository = posts();

    await createPost(repository, { ...image, caption: '' });

    expect(repository.create).toHaveBeenCalled();
  });

  it('rechaza un pie de foto demasiado largo', async () => {
    const repository = posts();

    expect(await codeOf(createPost(repository, { ...image, caption: 'x'.repeat(2201) }))).toBe(
      'text_too_long',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rechaza una imagen sin dimensiones', async () => {
    expect(await codeOf(createPost(posts(), { ...image, imageWidth: 0, caption: '' }))).toBe(
      'invalid_image',
    );
  });
});

describe('addComment', () => {
  const comments = () => ({ add: jest.fn(async () => {}) }) as unknown as CommentRepository;

  it('recorta el texto y lo envía', async () => {
    const repository = comments();

    await addComment(repository, { postId: 'p', parentId: 'c', body: ' buena foto ' });

    expect(repository.add).toHaveBeenCalledWith({ postId: 'p', parentId: 'c', body: 'buena foto' });
  });

  it('rechaza un comentario vacío o solo con espacios', async () => {
    const repository = comments();

    expect(await codeOf(addComment(repository, { postId: 'p', parentId: null, body: '   ' }))).toBe(
      'empty_comment',
    );
    expect(repository.add).not.toHaveBeenCalled();
  });

  it('rechaza un comentario demasiado largo', async () => {
    expect(
      await codeOf(addComment(comments(), { postId: 'p', parentId: null, body: 'x'.repeat(2201) })),
    ).toBe('text_too_long');
  });
});
