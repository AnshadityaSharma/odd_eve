const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon'
};

// ─── Static File Server ─────────────────────────────────
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const filePath = path.join(__dirname, url);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ─── WebSocket Server ────────────────────────────────────
const wss = new WebSocket.Server({ server });
const rooms = new Map();

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  room.players.forEach(ws => send(ws, msg));
}

function broadcastAs(room, msg) {
  // Send to each player with their player number attached
  room.players.forEach((ws, i) => {
    if (ws) send(ws, { ...msg, you: i + 1 });
  });
}

function freshState() {
  return {
    phase: 'waiting',
    tossChoice: null,
    tossWinner: null,
    p1Role: null, p2Role: null,
    innings: 1, round: 1,
    p1Score: 0, p2Score: 0,
    target: null
  };
}

wss.on('connection', ws => {
  ws.alive = true;
  ws.roomCode = null;
  ws.pNum = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;

    switch (msg.type) {

      case 'create_room': {
        let code;
        do { code = genCode(); } while (rooms.has(code));
        const r = { code, players: [ws, null], state: freshState(), throws: [null, null], ready: [false, false] };
        rooms.set(code, r);
        ws.roomCode = code;
        ws.pNum = 1;
        send(ws, { type: 'room_created', code });
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) { send(ws, { type: 'error', text: 'Room not found' }); break; }
        if (r.players[1]) { send(ws, { type: 'error', text: 'Room is full' }); break; }
        r.players[1] = ws;
        ws.roomCode = code;
        ws.pNum = 2;
        r.state.phase = 'toss_choice';
        broadcastAs(r, { type: 'room_ready' });
        break;
      }

      case 'toss_choice': {
        if (!room || ws.pNum !== 1) break;
        room.state.tossChoice = msg.choice;
        room.state.phase = 'toss_throw';
        room.throws = [null, null];
        broadcastAs(room, { type: 'do_countdown', reason: 'toss', choice: msg.choice });
        break;
      }

      case 'throw': {
        if (!room) break;
        room.throws[ws.pNum - 1] = msg.value;
        if (room.throws[0] !== null && room.throws[1] !== null) {
          processThrows(room);
        }
        break;
      }

      case 'role_choice': {
        if (!room) break;
        if (ws.pNum !== room.state.tossWinner) break;
        room.state.p1Role = ws.pNum === 1 ? msg.role : (msg.role === 'batting' ? 'bowling' : 'batting');
        room.state.p2Role = room.state.p1Role === 'batting' ? 'bowling' : 'batting';
        room.state.phase = 'playing';
        broadcastAs(room, { type: 'game_start', p1Role: room.state.p1Role, p2Role: room.state.p2Role });
        break;
      }

      case 'request_round': {
        if (!room) break;
        room.ready[ws.pNum - 1] = true;
        if (room.ready[0] && room.ready[1]) {
          room.ready = [false, false];
          room.throws = [null, null];
          broadcastAs(room, { type: 'do_countdown', reason: 'round' });
        } else {
          send(ws, { type: 'wait_opponent' });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws.roomCode) {
      const r = rooms.get(ws.roomCode);
      if (r) {
        const other = r.players.find(p => p && p !== ws);
        if (other) send(other, { type: 'opponent_left' });
        rooms.delete(ws.roomCode);
      }
    }
  });
});

function processThrows(room) {
  const p1 = room.throws[0];
  const p2 = room.throws[1];
  room.throws = [null, null];
  const s = room.state;

  if (s.phase === 'toss_throw') {
    const sum = p1 + p2;
    const isEven = sum % 2 === 0;
    const p1Won = (s.tossChoice === 'even' && isEven) || (s.tossChoice === 'odd' && !isEven);
    s.tossWinner = p1Won ? 1 : 2;
    s.phase = 'role_choice';
    broadcastAs(room, { type: 'toss_result', p1Throw: p1, p2Throw: p2, sum, isEven, winner: s.tossWinner });
    return;
  }

  if (s.phase === 'playing') {
    const isOut = p1 === p2;

    if (isOut) {
      if (s.innings === 1) {
        const batScore = s.p1Role === 'batting' ? s.p1Score : s.p2Score;
        s.target = batScore + 1;
        s.innings = 2;
        s.round = 1;
        const tmp = s.p1Role; s.p1Role = s.p2Role; s.p2Role = tmp;
        broadcastAs(room, {
          type: 'round_result', p1Throw: p1, p2Throw: p2, out: true,
          inningsOver: true, p1Score: s.p1Score, p2Score: s.p2Score,
          target: s.target, p1Role: s.p1Role, p2Role: s.p2Role, innings: s.innings
        });
      } else {
        s.phase = 'ended';
        let w = 0;
        if (s.p1Score > s.p2Score) w = 1;
        else if (s.p2Score > s.p1Score) w = 2;
        broadcastAs(room, {
          type: 'match_over', p1Throw: p1, p2Throw: p2, out: true,
          p1Score: s.p1Score, p2Score: s.p2Score, winner: w
        });
      }
    } else {
      if (s.p1Role === 'batting') s.p1Score += p1;
      else s.p2Score += p2;
      s.round++;

      let gameOver = false, w = 0;
      if (s.innings === 2 && s.target) {
        const chaser = s.p1Role === 'batting' ? s.p1Score : s.p2Score;
        if (chaser >= s.target) { gameOver = true; w = s.p1Role === 'batting' ? 1 : 2; s.phase = 'ended'; }
      }

      if (gameOver) {
        broadcastAs(room, {
          type: 'match_over', p1Throw: p1, p2Throw: p2, out: false,
          p1Score: s.p1Score, p2Score: s.p2Score, winner: w
        });
      } else {
        const runs = s.p1Role === 'batting' ? p1 : p2;
        broadcastAs(room, {
          type: 'round_result', p1Throw: p1, p2Throw: p2, out: false,
          runs, p1Score: s.p1Score, p2Score: s.p2Score,
          innings: s.innings, round: s.round, p1Role: s.p1Role, p2Role: s.p2Role
        });
      }
    }
  }
}

server.listen(PORT, () => {
  console.log(`Hand Cricket server running at http://localhost:${PORT}`);
});
