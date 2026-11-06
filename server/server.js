const app = require('./app');
const { PORT: port } = require('./data-dir');

app.listen(port, () => {
  console.log(`API running on http://127.0.0.1:${port}`);
});
