// Zero-dependency static server for Flood Depth:  node server.js  →  http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = +process.env.PORT || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// If the port is taken (e.g. by Apache/XAMPP or another server), try the next ones.
function listen(port, triesLeft = 20) {
  const onError = (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`Port ${port} is in use, trying ${port + 1}...`);
      listen(port + 1, triesLeft - 1);
    } else {
      console.error(err.message);
      process.exit(1);
    }
  };
  server.once('error', onError);
  server.listen(port);
  server.once('listening', () => server.off('error', onError));
}
server.on('listening', () => console.log(`Flood Depth running at http://localhost:${server.address().port}`));
listen(PORT);
