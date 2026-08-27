export function categoryLevels(categories = [], selectedIds = []) {
  const levels = [];
  let nodes = Array.isArray(categories) ? categories : [];

  for (let depth = 0; nodes.length > 0; depth += 1) {
    levels.push(nodes);
    const selectedId = Number(selectedIds[depth]);
    if (!Number.isFinite(selectedId)) break;
    const selected = nodes.find(node => Number(node.id) === selectedId);
    if (!selected) break;
    nodes = Array.isArray(selected.subCategories) ? selected.subCategories : [];
  }

  return levels;
}

export function selectedCategory(categories = [], selectedIds = []) {
  let nodes = Array.isArray(categories) ? categories : [];
  let selected = null;

  for (const rawId of selectedIds) {
    const id = Number(rawId);
    if (!Number.isFinite(id)) break;
    selected = nodes.find(node => Number(node.id) === id) || null;
    if (!selected) return null;
    nodes = Array.isArray(selected.subCategories) ? selected.subCategories : [];
  }

  return selected;
}

export function selectedCategoryPath(categories = [], selectedIds = []) {
  const names = [];
  let nodes = Array.isArray(categories) ? categories : [];

  for (const rawId of selectedIds) {
    const id = Number(rawId);
    const selected = nodes.find(node => Number(node.id) === id);
    if (!selected) break;
    names.push(selected.name);
    nodes = Array.isArray(selected.subCategories) ? selected.subCategories : [];
  }

  return names;
}

export function isLeafCategory(category) {
  return Boolean(category) && (!Array.isArray(category.subCategories) || category.subCategories.length === 0);
}

export function findCategoryPath(categories = [], targetId) {
  const numericTarget = Number(targetId);
  if (!Number.isFinite(numericTarget)) return [];

  function walk(nodes, path) {
    for (const node of nodes || []) {
      const next = [...path, Number(node.id)];
      if (Number(node.id) === numericTarget) return next;
      const found = walk(node.subCategories, next);
      if (found.length) return found;
    }
    return [];
  }

  return walk(categories, []);
}

async function requestCategories(url, options, fetchImpl) {
  const response = await fetchImpl(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Category request failed (${response.status}).`);
  if (!Array.isArray(payload.categories)) throw new Error('Category response is missing categories.');
  return payload;
}

export function loadTrendyolCategories(fetchImpl = fetch) {
  return requestCategories('/api/trendyol/categories', { method: 'GET' }, fetchImpl);
}

export function refreshTrendyolCategories(fetchImpl = fetch) {
  return requestCategories('/api/trendyol/categories/refresh', { method: 'POST' }, fetchImpl);
}
