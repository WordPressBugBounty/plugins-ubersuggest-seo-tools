import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../api';
import {
  applyFixes,
  fetchPageRecrawl,
  fetchPreview,
  previewEndpoint,
} from './fix-preview';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

/** The path the last call was made with. */
const lastGet = () => String(mockApiGet.mock.calls.at(-1)?.[0]);

beforeEach(() => {
  mockApiGet.mockReset().mockResolvedValue({});
  mockApiPost.mockReset().mockResolvedValue({ ok: true });
});

describe('previewEndpoint', () => {
  it('sends a fixable issue to the fix endpoint', () => {
    expect(previewEndpoint(false)).toBe('fix/preview');
  });

  it('sends a manual issue to the issue-pages endpoint', () => {
    // Manual issues have no local fix: their rows are crawl URLs, listed by a
    // different route that shares the whole generate/poll shape.
    expect(previewEndpoint(true)).toBe('issue-pages');
  });
});

describe('fetchPreview', () => {
  it('asks the endpoint it was given, not one of its own choosing', async () => {
    await fetchPreview('issue-pages', 'title_empty', '');

    expect(lastGet()).toBe('issue-pages?issue=title_empty');
  });

  it('appends the caller query after the issue', async () => {
    await fetchPreview('fix/preview', 'title_empty', '&start=1&ref=7');

    expect(lastGet()).toBe('fix/preview?issue=title_empty&start=1&ref=7');
  });

  it('escapes an issue id that would otherwise break the query', async () => {
    await fetchPreview('fix/preview', 'a&b=c', '');

    expect(lastGet()).toBe('fix/preview?issue=a%26b%3Dc');
  });
});

describe('fetchPageRecrawl', () => {
  it('escapes the ref, which is a crawl URL on manual issues', async () => {
    await fetchPageRecrawl('title_empty', 'https://site.test/a?b=1', '&poll=1');

    expect(lastGet()).toBe(
      'page-recrawl?issue=title_empty&ref=https%3A%2F%2Fsite.test%2Fa%3Fb%3D1&poll=1',
    );
  });
});

describe('applyFixes', () => {
  it('posts the reviewed values and their sources under the issue', async () => {
    await applyFixes('title_empty', { '7': 'new title' }, { '7': 'edited' });

    expect(mockApiPost).toHaveBeenCalledWith('fix/apply', {
      issue: 'title_empty',
      values: { '7': 'new title' },
      sources: { '7': 'edited' },
    });
  });
});
