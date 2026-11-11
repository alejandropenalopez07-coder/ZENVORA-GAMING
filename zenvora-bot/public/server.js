'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'clanes.json');
const HTML_FILE = path.join(__dirname, 'public', 'index.html');

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {};
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/ranking') {
    const db = readDB();
    const ranking = [];

    for (const group of Object.values(db)) {
      for (const [jid, player] of Object.entries(group.players || {})) {
        ranking.push({
          jugador: jid.split('@')[0].split(':')[0],
          placas: Number(player.points) || 0
        });
      }
    }

    ranking.sort((a, b) => b.placas - a.placas);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      miembros: ranking.length,
      placasTotales: ranking.reduce((sum, p) => sum + p.placas, 0),
      ranking: ranking.slice(0, 10)
    }));
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    if (!fs.existsSync(HTML_FILE)) {
      res.writeHead(404);
      return res.end('Panel no encontrado');
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(HTML_FILE).pipe(res);
  }

  res.writeHead(404);
  res.end('No encontrado');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('👑 Panel ZENVORA activo en el puerto ' + PORT);
});
