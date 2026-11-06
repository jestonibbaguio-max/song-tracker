// Fruits test bench (not used by the Angular app). One load and at most one
// save per call. Bugs M1 and M14 in docs/found-bugs.md are kept on purpose.
const repository = require('./fruits.repository');

/** q is already lower-cased by the controller, or undefined when there is no search. */
function listFruits({ category, q }) {
  const db = repository.load();
  let list = db.fruits || [];
  if (category) list = list.filter(f => f.category === category);
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

/** { error } when invalid (nothing saved), otherwise { fruit }. */
function createFruit({ name, emoji, category, price, stock }) {
  const db = repository.load();
  const fruits = db.fruits || [];
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
