// Characterization tests: /api/fruits, the self-contained test bench backed by
// test_bwd/db.json. The Angular app doesn't use it.
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const {
  describeEndpoint, MALFORMED_JSON, removeFile, writeFile,
} = require('../../helpers/characterize');

const noFruitsFile = removeFile('test_bwd/db.json');

describeEndpoint('GET /api/fruits', {
  happy: {
    'lists every fruit': {},
    'filters by category': { path: '/api/fruits?category=Citrus' },
    'searches name and category, case-insensitively': { path: '/api/fruits?q=TROP' },
  },
  invalid: {
    'repeated q parameter': { path: '/api/fruits?q=a&q=b' },
    'stored fruit without a category breaks search': {
      setup: writeFile('test_bwd/db.json', JSON.stringify({ fruits: [{ id: 1, name: 'Mystery' }] }, null, 2)),
      path: '/api/fruits?q=zz',
    },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'category with no fruits': { path: '/api/fruits?category=Berry' },
    'test_bwd/db.json missing': { setup: noFruitsFile },
  },
});

describeEndpoint('GET /api/fruits/:id', {
  happy: { 'returns one fruit': { path: '/api/fruits/2' } },
  invalid: {
    'non-numeric id': { path: '/api/fruits/abc' },
    'malformed JSON body': { path: '/api/fruits/2', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/fruits/999' },
    'test_bwd/db.json missing': { setup: noFruitsFile, path: '/api/fruits/1' },
  },
});

const papaya = { name: 'Papaya', emoji: '🍈', category: 'Tropical', price: 1.25, stock: 60 };

describeEndpoint('POST /api/fruits', {
  happy: {
    'adds a fruit': { body: papaya },
    'defaults emoji, price and stock': { body: { name: 'Papaya', category: 'Tropical' } },
  },
  invalid: {
    'missing category': { body: { name: 'Papaya' } },
    'non-numeric price and stock become 0': { body: { ...papaya, price: 'cheap', stock: 'lots' } },
    'duplicate name is accepted': { body: { ...papaya, name: 'Mango' } },
    'client id is ignored; unknown fields dropped': { body: { ...papaya, id: 1, color: 'orange' } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'test_bwd/db.json missing: file created': { setup: noFruitsFile, body: papaya },
  },
});

describeEndpoint('PATCH /api/fruits/:id', {
  happy: { 'updates stock': { path: '/api/fruits/2', body: { stock: 80 } } },
  invalid: {
    'arbitrary fields and types are merged; id is kept': { path: '/api/fruits/2', body: { price: 'free', id: 99, color: 'yellow' } },
    'no body': { path: '/api/fruits/2' },
    'malformed JSON body': { path: '/api/fruits/2', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/fruits/999', body: { stock: 1 } },
    'non-numeric id': { path: '/api/fruits/abc', body: { stock: 1 } },
  },
});

describeEndpoint('DELETE /api/fruits/:id', {
  happy: { 'deletes a fruit': { path: '/api/fruits/1' } },
  invalid: {
    'non-numeric id': { path: '/api/fruits/abc' },
    'malformed JSON body': { path: '/api/fruits/1', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/fruits/999' },
    'test_bwd/db.json missing': { setup: noFruitsFile, path: '/api/fruits/1' },
  },
});
