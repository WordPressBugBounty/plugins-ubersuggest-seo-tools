import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from '../../../api';
import { fetchHistory, revertFix } from './fix-history';

vi.mock('../../../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiGet.mockResolvedValue({});
});

describe('fetchHistory', () => {
  it('asks for the bare endpoint when nothing is filtered', async () => {
    await fetchHistory({});

    expect(mockApiGet).toHaveBeenCalledWith('history');
  });

  it('encodes the filters it was given', async () => {
    await fetchHistory({ issue: 'title_long', search: 'a & b', page: 3 });

    expect(mockApiGet).toHaveBeenCalledWith(
      'history?issue=title_long&search=a+%26+b&page=3',
    );
  });

  /** Page one is the default, so saying it would only lengthen the URL. */
  it('leaves the first page out of the query', async () => {
    await fetchHistory({ page: 1 });

    expect(mockApiGet).toHaveBeenCalledWith('history');
  });
});

describe('revertFix', () => {
  it('undoes by history record id, not by page', async () => {
    await revertFix(42);

    expect(mockApiPost).toHaveBeenCalledWith('history/revert', { id: 42 });
  });
});
