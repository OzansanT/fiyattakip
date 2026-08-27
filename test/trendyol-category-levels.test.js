import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryChildren } from '../server/trendyol-categories.js';
import { loadTrendyolCategoryChildren } from '../js/trendyol-categories.js';

const tree = [
  {
    id: 10,
    name: 'Elektronik',
    subCategories: [
      {
        id: 11,
        name: 'Bilgisayar',
        subCategories: [
          { id: 12, name: 'Mouse', subCategories: [] },
          { id: 13, name: 'Klavye', subCategories: [] }
        ]
      }
    ]
  },
  { id: 20, name: 'Ev', subCategories: [] }
];

test('server exposes compact root and child levels without nested subtrees', () => {
  const roots = categoryChildren(tree);
  assert.deepEqual(roots, [
    { id: 10, name: 'Elektronik', parentId: null, hasChildren: true },
    { id: 20, name: 'Ev', parentId: null, hasChildren: false }
  ]);
  assert.equal('subCategories' in roots[0], false);

  const children = categoryChildren(tree, 11);
  assert.deepEqual(children, [
    { id: 12, name: 'Mouse', parentId: 11, hasChildren: false },
    { id: 13, name: 'Klavye', parentId: 11, hasChildren: false }
  ]);
});

test('browser requests only one local child level for the chosen parent', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      parentId: 11,
      nodes: [{ id: 12, name: 'Mouse', parentId: 11, hasChildren: false }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const payload = await loadTrendyolCategoryChildren(11, fakeFetch);
  assert.equal(request.url, '/api/trendyol/categories/children?parentId=11');
  assert.equal(request.options.method, 'GET');
  assert.equal(payload.nodes.length, 1);
});
