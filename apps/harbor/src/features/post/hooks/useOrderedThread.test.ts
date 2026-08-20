import type { PostData } from '@/src/common/lib/polycentric-hooks';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useOrderedThread } from './useOrderedThread';

function post(id: string, parentId?: string): PostData {
  return { id, reply: parentId ? { parentId } : undefined } as PostData;
}

function renderOrdered(subject: PostData, items: PostData[]) {
  const result: { current: PostData[] } = { current: [] };
  function Probe() {
    result.current = useOrderedThread(subject, items);
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result.current.map((p) => p.id);
}

describe('useOrderedThread', () => {
  it('returns just the subject while the thread is empty', () => {
    expect(renderOrdered(post('s'), [])).toEqual(['s']);
  });

  it('moves replies listed before the subject below it', () => {
    const subject = post('s', 'p');
    const items = [post('r', 's'), subject, post('p')];
    expect(renderOrdered(subject, items)).toEqual(['p', 's', 'r']);
  });

  it('orders the full ancestor chain above the subject', () => {
    const subject = post('s', 'p1');
    const items = [subject, post('p1', 'p2'), post('p2')];
    expect(renderOrdered(subject, items)).toEqual(['p2', 'p1', 's']);
  });

  it('keeps reply order and falls back on a missing parent', () => {
    const subject = post('s', 'gone');
    const items = [post('r2', 'r1'), subject, post('r1', 's')];
    expect(renderOrdered(subject, items)).toEqual(['s', 'r2', 'r1']);
  });
});
