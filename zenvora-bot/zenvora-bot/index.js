'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const DATA_DIR = path.join(__dirname, 'data');
const AUTH_DIR = path.join(__dirname, 'auth');
const DB_FILE = path.join(DATA_DIR, 'clanes.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {};
  }
}

let db = loadDB();

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getGroup(id) {
  if (!db[id]) {
    db[id] = {
      players: {},
      settings: { badWords: [], antiLink: false },
      warnings: {}
    };
  }
  return db[id];
}

function number(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['ZENVORA GAMING', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('👑 ZENVORA GAMING CONECTADO');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 5000);
      } else {
        console.log('Sesión cerrada. Debes volver a vincular WhatsApp.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const groupId = msg.key.remoteJid;
      if (!groupId?.endsWith('@g.us')) continue;

      const sender = msg.key.participant;
      if (!sender) continue;

      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      const args = body.trim().split(/\s+/);
      const command = (args[0] || '').toLowerCase();

      if (!command.startsWith('.')) continue;

      const group = getGroup(groupId);
      const metadata = await sock.groupMetadata(groupId).catch(() => null);
      if (!metadata) continue;

      const participants = metadata.participants || [];
      const senderInfo = participants.find(p => p.id === sender);
      const isAdmin = ['admin', 'superadmin'].includes(senderInfo?.admin);

      const reply = text =>
        sock.sendMessage(groupId, { text }, { quoted: msg });

      if (command === '.menu' || command === '.help') {
        await reply(
          '👑 ZENVORA GAMING\n\n' +
          '🏅 .placas — Ver tus placas\n' +
          '🏆 .top — Ranking del clan\n' +
          '➕ .addplacas @miembro cantidad\n' +
          '➖ .delplacas @miembro cantidad\n\n' +
          'Los comandos de administración son exclusivos de los admins.'
        );
        continue;
      }

      if (command === '.placas') {
        const player = group.players[sender] || { points: 0 };
        group.players[sender] = player;
        saveDB();

        await reply(
          '👤 Jugador: ' + number(sender) +
          '\n🏅 Placas: ' + player.points
        );
        continue;
      }

      if (command === '.top') {
        const ranking = Object.entries(group.players)
          .sort((a, b) => b[1].points - a[1].points)
          .slice(0, 10);

        if (!ranking.length) {
          await reply('Todavía no hay jugadores en el ranking.');
          continue;
        }

        const lines = ranking.map(([jid, player], index) =>
          `${index + 1}. ${number(jid)} — ${player.points} placas`
        );

        await reply('👑 TOP 10 ZENVORA\n\n' + lines.join('\n'));
        continue;
      }

      if (command === '.addplacas' || command === '.delplacas') {
        if (!isAdmin) {
          await reply('⛔ Solo los administradores pueden usar este comando.');
          continue;
        }

        const mentioned =
          msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

        const quoted =
          msg.message.extendedTextMessage?.contextInfo?.participant;

        const target = mentioned[0] || quoted;

        const amount = Number(args[2]);

        if (!target || !Number.isSafeInteger(amount) || amount < 1) {
          await reply(
            'Uso: ' + command +
            ' @miembro cantidad\nTambién puedes responder al mensaje del jugador.'
          );
          continue;
        }

        const player = group.players[target] || { points: 0 };

        if (command === '.addplacas') {
          player.points += amount;
        } else {
          player.points = Math.max(0, player.points - amount);
        }

        group.players[target] = player;
        saveDB();

        await reply(
          '✅ Operación realizada.\n' +
          '🏅 Total: ' + player.points + ' placas.'
        );
      }
    }
  });
}

startBot().catch(error => {
  console.error('Error iniciando ZENVORA:', error);
  process.exit(1);
});
