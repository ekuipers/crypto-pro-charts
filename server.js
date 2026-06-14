import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

// Serve static assets
app.use(express.static(join(__dirname, 'public')));
app.use('/js', express.static(join(__dirname, 'src/js')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Crypto Charting Pro running at http://localhost:${PORT}`);
});
