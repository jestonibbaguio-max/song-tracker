const service = require('./fruits.service');

function listFruits(req, res) {
  // Lower-cased here, on req.query.q itself: a repeated ?q= makes it an array and
  // the 500 must keep saying "req.query.q.toLowerCase is not a function" (bug M14).
  const q = req.query.q ? req.query.q.toLowerCase() : undefined;
  res.json(service.listFruits({ category: req.query.category, q }));
}

function getFruit(req, res) {
  const fruit = service.getFruit(req.params.id);
  if (!fruit) return res.status(404).json({ error: 'not found' });
  res.json(fruit);
}

function createFruit(req, res) {
  // Destructured here, from req.body itself: with no JSON body this must keep
  // throwing "Cannot destructure property 'name' of 'req.body'..." (bug M1).
  const { name, emoji, category, price, stock } = req.body;
  const result = service.createFruit({ name, emoji, category, price, stock });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.fruit);
}

function updateFruit(req, res) {
  const fruit = service.updateFruit(Number(req.params.id), req.body);
  if (!fruit) return res.status(404).json({ error: 'not found' });
  res.json(fruit);
}

function deleteFruit(req, res) {
  if (!service.deleteFruit(Number(req.params.id))) return res.status(404).json({ error: 'not found' });
  res.json({ deleted: true });
}

module.exports = { listFruits, getFruit, createFruit, updateFruit, deleteFruit };
