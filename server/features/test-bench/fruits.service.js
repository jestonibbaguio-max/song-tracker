// Fruits test bench (not used by the Angular app). One load and at most one
// save per call. Bugs M1 and M14 in docs/found-bugs.md are kept on purpose.
const repository = require('./fruits.repository');

/**
 * readQuery returns the lower-cased search text, or undefined when there is
 * none. It is called after the load and the category filter, where the
 * original handler read req.query.q (bug M14 throws from inside it).
 */
function listFruits({ category, readQuery }) {
  const db = repository.load();
  let list = db.fruits || [];
  if (category) list = list.filter(f => f.category === category);
  const q = readQuery();
  if (q !== undefined) {
    list = list.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
  }
  return list;
}

/** The fruit, or undefined. id is the raw route parameter. */
function getFruit(id) {
  const db = repository.load();
  return (db.fruits || []).find(f => Number(f.id) === Number(id));
}

/**
 * readFields returns { name, emoji, category, price, stock } from the request.
 * It is called after the load, where the original handler destructured
 * req.body (bug M1 throws from inside it).
 * { error } when invalid (nothing saved), otherwise { fruit }.
 */
function createFruit(readFields) {
  const db = repository.load();
  const fruits = db.fruits || [];
  const { name, emoji, category, price, stock } = readFields();
  if (!name || !category) return { error: 'name and category are required' };
  const fruit = { id: repository.nextId(fruits), name, emoji: emoji || '🍎', category, price: Number(price) || 0, stock: Number(stock) || 0 };
  fruits.push(fruit);
  db.fruits = fruits;
  repository.save(db);
  return { fruit };
}

/** Merges body over the stored fruit, keeping the numeric id. null when the id is unknown. */
function updateFruit(id, body) {
  const db = repository.load();
  const fruits = db.fruits || [];
  const idx = fruits.findIndex(f => Number(f.id) === id);
  if (idx === -1) return null;
  fruits[idx] = { ...fruits[idx], ...body, id };
  db.fruits = fruits;
  repository.save(db);
  return fruits[idx];
}

/** true when a fruit was removed (and the file saved), false when the id is unknown. */
function deleteFruit(id) {
  const db = repository.load();
  const before = (db.fruits || []).length;
  db.fruits = (db.fruits || []).filter(f => Number(f.id) !== id);
  if (db.fruits.length === before) return false;
  repository.save(db);
  return true;
}

module.exports = { listFruits, getFruit, createFruit, updateFruit, deleteFruit };
