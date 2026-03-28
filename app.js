/* ============================================================
   HAND CRICKET – GESTURE ARENA  |  Main Application
   ============================================================ */
(function () {
  'use strict';

  const MOVES = [1, 2, 3, 4, 5, 10];
  const $ = id => document.getElementById(id);

  // ─── STATE ────────────────────────────────────────────
  let mode = 'ai';          // 'ai' | 'online'
  let myNum = 0;            // 1 or 2 (online)
  let ws = null;            // WebSocket

  let game = {
    innings: 1, round: 1,
    p1Score: 0, p2Score: 0,
    p1Role: null, p2Role: null,
    target: null, tossChoice: null,
    history: []             // [{p1,p2,out}]
  };

  let ai = new AIEngine();
  let latestGesture = null; // number or null
  let hands = null;
  let camera = null;
  let activeCanvas = null;
  let activeCtx = null;
  let busy = false;         // prevent double-clicks

  // ─── SCREEN MANAGEMENT ────────────────────────────────
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  // ─── GESTURE DETECTION ────────────────────────────────
  function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  function countFingers(lm) {
    const wrist = lm[0];
    const palmCenter = lm[9];
    const palmSize = dist(wrist, palmCenter);

    // Finger tips, PIP joints, MCP joints
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    const mcps = [5, 9, 13, 17];

    let count = 0;
    for (let i = 0; i < 4; i++) {
      const tip = lm[tips[i]];
      const pip = lm[pips[i]];
      const mcp = lm[mcps[i]];
      // Finger is extended if tip is above PIP (primary check)
      // OR if tip is above MCP and farther from wrist (secondary/loose check)
      const abovePIP = tip.y < pip.y;
      const aboveMCP = tip.y < mcp.y;
      const farther = dist(tip, wrist) > dist(pip, wrist);
      if (abovePIP && (aboveMCP || farther)) {
        count++;
      }
    }

    // Thumb: multiple checks for reliability
    const thumbTip = lm[4];
    const thumbIP = lm[3];
    const thumbMCP = lm[2];
    const indexMCP = lm[5];
    const pinkyMCP = lm[17];
    // Check 1: tip is far from index MCP (thumb sticking out)
    const thumbFar = dist(thumbTip, indexMCP) > palmSize * 0.35;
    // Check 2: tip is farther from palm center than thumb IP joint
    const thumbExtended = dist(thumbTip, palmCenter) > dist(thumbIP, palmCenter);
    // Check 3: tip is far from pinky MCP (wide spread)
    const palmWidth = dist(indexMCP, pinkyMCP);
    const thumbWide = dist(thumbTip, pinkyMCP) > palmWidth * 1.2;
    // Thumb is up if any two checks pass
    if ((thumbFar && thumbExtended) || (thumbFar && thumbWide) || (thumbExtended && thumbWide)) {
      count++;
    }

    return count === 0 ? 10 : count;   // fist = 10
  }

  function onHandResults(results) {
    if (!activeCanvas || !activeCtx) return;
    const ctx = activeCtx;
    ctx.save();
    ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    ctx.drawImage(results.image, 0, 0, activeCanvas.width, activeCanvas.height);

    latestGesture = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const lm = results.multiHandLandmarks[0];
      const hd = results.multiHandedness[0].label;

      // Draw skeleton
      window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, { color: '#00d4ff', lineWidth: 3 });
      window.drawLandmarks(ctx, lm, { color: '#ffffff', lineWidth: 1, radius: 2 });

      const g = countFingers(lm);
      latestGesture = g;

      // Draw detected number above hand (flipped for mirror)
      const tx = lm[9].x * activeCanvas.width;
      const ty = Math.max(lm[9].y * activeCanvas.height - 40, 30);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.font = 'bold 36px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      ctx.fillStyle = '#ffa726';
      const fx = activeCanvas.width - tx;
      ctx.strokeText(g, -fx, ty);
      ctx.fillText(g, -fx, ty);
      ctx.restore();
    }

    ctx.restore();
  }

  function initHands() {
    if (hands) return;
    hands = new window.Hands({
      locateFile: f => `https://unpkg.com/@mediapipe/hands/${f}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    hands.onResults(onHandResults);
  }

  function startCamera(canvasEl) {
    activeCanvas = canvasEl;
    activeCtx = canvasEl.getContext('2d');
    const vid = $('cam-video');
    if (camera) camera.stop();
    camera = new window.Camera(vid, {
      onFrame: async () => { await hands.send({ image: vid }); },
      width: 640, height: 480
    });
    camera.start();
  }

  // ─── COUNTDOWN ────────────────────────────────────────
  function countdown(overlayEl, numEl, ringEl, secs) {
    return new Promise(resolve => {
      overlayEl.classList.remove('hidden');
      numEl.textContent = secs;
      const C = 2 * Math.PI * 54; // ~339.3
      ringEl.style.transition = 'none';
      ringEl.style.strokeDashoffset = '0';
      ringEl.getBoundingClientRect(); // force reflow
      ringEl.style.transition = `stroke-dashoffset ${secs}s linear`;
      ringEl.style.strokeDashoffset = C;

      let t = secs;
      const iv = setInterval(() => {
        t--;
        if (t > 0) { numEl.textContent = t; }
        else {
          numEl.textContent = 'GO';
          clearInterval(iv);
          setTimeout(() => {
            overlayEl.classList.add('hidden');
            resolve();
          }, 500);
        }
      }, 1000);
    });
  }

  // ─── FLASH ────────────────────────────────────────────
  function flash(text, cls, dur = 1800) {
    const el = $('game-flash');
    el.textContent = text;
    el.className = 'flash ' + cls;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), dur);
  }

  // ─── RESET GAME ───────────────────────────────────────
  function resetGame() {
    game = {
      innings: 1, round: 1,
      p1Score: 0, p2Score: 0,
      p1Role: null, p2Role: null,
      target: null, tossChoice: null,
      history: []
    };
    busy = false;
    latestGesture = null;
  }

  // ─── UI UPDATES ───────────────────────────────────────
  function updateGameUI() {
    $('badge-innings').textContent = `INNINGS ${game.innings}`;
    $('badge-round').textContent = `ROUND ${game.round}`;
    if (game.target) {
      $('badge-target').textContent = `TARGET: ${game.target}`;
      $('badge-target').classList.remove('hidden');
    } else {
      $('badge-target').classList.add('hidden');
    }
    $('pscore-1').textContent = game.p1Score;
    $('pscore-2').textContent = game.p2Score;

    const r1 = $('prole-1');
    r1.textContent = game.p1Role ? game.p1Role.toUpperCase() : '--';
    r1.className = 'panel-role ' + (game.p1Role === 'batting' ? 'role-bat' : 'role-bowl');

    const r2 = $('prole-2');
    r2.textContent = game.p2Role ? game.p2Role.toUpperCase() : '--';
    r2.className = 'panel-role ' + (game.p2Role === 'batting' ? 'role-bat' : 'role-bowl');

    $('panel-1').classList.toggle('is-batting', game.p1Role === 'batting');
    $('panel-2').classList.toggle('is-batting', game.p2Role === 'batting');

    // History
    const hbl = $('hb-list');
    hbl.innerHTML = '';
    for (const h of game.history) {
      const d = document.createElement('div');
      d.className = 'hb-entry' + (h.out ? ' hb-out' : '');
      d.innerHTML = `<span class="hb-p1">${h.p1}</span><div class="hb-div"></div><span class="hb-p2">${h.p2}</span>`;
      hbl.appendChild(d);
    }
  }

  // ================================================================
  //   AI MODE
  // ================================================================

  function aiStartToss() {
    show('scr-toss');
    $('toss-msg').textContent = 'Choose Odd or Even';
    $('toss-btns').classList.remove('hidden');
    $('toss-cam').classList.add('hidden');
    $('toss-result').classList.add('hidden');
    $('role-btns').classList.add('hidden');
    $('toss-winner').textContent = '';
    $('tr-p2-label').textContent = 'AI';
    initHands();
  }

  function aiTossChosen(choice) {
    game.tossChoice = choice;
    $('toss-btns').classList.add('hidden');
    $('toss-cam').classList.remove('hidden');
    $('toss-msg').textContent = `You chose ${choice.toUpperCase()}. Show your hand and click THROW.`;
    startCamera($('toss-canvas'));
  }

  async function aiTossThrow() {
    if (busy) return;
    busy = true;

    await countdown($('toss-cd'), $('toss-cd-num'), $('toss-ring'), 3);

    const p1 = latestGesture;
    if (!p1) {
      $('toss-msg').textContent = 'No hand detected! Show your hand clearly and try again.';
      busy = false;
      return;
    }
    if (!MOVES.includes(p1)) {
      $('toss-msg').textContent = `Invalid gesture (${p1}). Use 1-5 fingers or fist. Try again.`;
      busy = false;
      return;
    }

    const p2 = MOVES[Math.floor(Math.random() * MOVES.length)];
    const sum = p1 + p2;
    const isEven = sum % 2 === 0;
    const p1Won = (game.tossChoice === 'even' && isEven) || (game.tossChoice === 'odd' && !isEven);

    // Show result
    $('toss-result').classList.remove('hidden');
    $('tr-p1').textContent = p1;
    $('tr-p2').textContent = p2;
    $('tr-sum').textContent = `${sum} (${isEven ? 'EVEN' : 'ODD'})`;

    if (p1Won) {
      $('toss-winner').textContent = 'You won the toss!';
      $('role-btns').classList.remove('hidden');
      $('btn-toss-throw').classList.add('hidden');
    } else {
      $('toss-winner').textContent = 'AI won the toss.';
      $('btn-toss-throw').classList.add('hidden');
      setTimeout(() => {
        const aiRole = Math.random() > 0.5 ? 'batting' : 'bowling';
        $('toss-winner').textContent += ` AI chose to ${aiRole.toUpperCase()}.`;
        setTimeout(() => {
          aiBeginGame(aiRole === 'batting' ? 'bowling' : 'batting');
        }, 1500);
      }, 1000);
    }
    busy = false;
  }

  function aiBeginGame(p1Role) {
    game.p1Role = p1Role;
    game.p2Role = p1Role === 'batting' ? 'bowling' : 'batting';

    show('scr-game');
    $('pname-1').textContent = 'YOU';
    $('pname-2').textContent = 'AI';
    $('pthrow-1').textContent = '-';
    $('pthrow-2').textContent = '-';
    $('btn-throw').disabled = false;
    startCamera($('game-canvas'));
    updateGameUI();
  }

  async function aiThrowRound() {
    if (busy) return;
    busy = true;
    $('btn-throw').disabled = true;
    $('pthrow-1').textContent = '-';
    $('pthrow-2').textContent = '-';

    await countdown($('game-cd'), $('game-cd-num'), $('game-ring'), 3);

    const p1 = latestGesture;
    if (!p1 || !MOVES.includes(p1)) {
      flash('NO HAND!', 'flash-info', 1500);
      busy = false;
      $('btn-throw').disabled = false;
      return;
    }

    // AI decides
    const isBowling = game.p2Role === 'bowling';
    const p2 = ai.decide(isBowling);
    ai.update(p1);

    // Show throws
    $('pthrow-1').textContent = p1;
    $('pthrow-2').textContent = p2;

    // Process
    processRound(p1, p2);
  }

  function processRound(p1, p2) {
    const isOut = p1 === p2;
    game.history.unshift({ p1, p2, out: isOut });
    if (game.history.length > 12) game.history.pop();

    if (isOut) {
      flash('OUT!', 'flash-out', 2000);

      if (game.innings === 1) {
        const batScore = game.p1Role === 'batting' ? game.p1Score : game.p2Score;
        game.target = batScore + 1;
        game.innings = 2;
        game.round = 1;
        const tmp = game.p1Role;
        game.p1Role = game.p2Role;
        game.p2Role = tmp;

        setTimeout(() => {
          flash(`TARGET: ${game.target}`, 'flash-info', 2500);
          updateGameUI();
          busy = false;
          $('btn-throw').disabled = false;
          // Auto-continue after innings change
          if ($('chk-auto') && $('chk-auto').checked) {
            setTimeout(() => {
              if (!busy && !$('btn-throw').disabled) aiThrowRound();
            }, 2800);
          }
        }, 2200);
      } else {
        // Match over
        setTimeout(() => showResult(), 2200);
      }
    } else {
      // Add runs to batter
      if (game.p1Role === 'batting') game.p1Score += p1;
      else game.p2Score += p2;
      const runs = game.p1Role === 'batting' ? p1 : p2;
      flash(`+${runs}`, 'flash-runs', 1500);
      game.round++;

      // Check target
      if (game.innings === 2 && game.target) {
        const chaser = game.p1Role === 'batting' ? game.p1Score : game.p2Score;
        if (chaser >= game.target) {
          updateGameUI();
          setTimeout(() => showResult(), 1800);
          return;
        }
      }

      updateGameUI();
      setTimeout(() => {
        busy = false;
        $('btn-throw').disabled = false;
        // Auto-continue
        if ($('chk-auto') && $('chk-auto').checked) {
          setTimeout(() => {
            if (!busy && !$('btn-throw').disabled) aiThrowRound();
          }, 600);
        }
      }, 1800);
    }
  }

  function showResult() {
    show('scr-result');
    $('fn-1').textContent = mode === 'online' ? `PLAYER ${myNum}` : 'YOU';
    $('fn-2').textContent = mode === 'online' ? `PLAYER ${myNum === 1 ? 2 : 1}` : 'AI';
    $('fs-1').textContent = game.p1Score;
    $('fs-2').textContent = game.p2Score;

    let w;
    if (game.p1Score > game.p2Score) w = mode === 'online' ? 'PLAYER 1 WINS' : 'YOU WIN!';
    else if (game.p2Score > game.p1Score) w = mode === 'online' ? 'PLAYER 2 WINS' : 'AI WINS!';
    else w = "IT'S A TIE!";
    $('winner-text').textContent = w;

    if (camera) camera.stop();
  }

  // ================================================================
  //   ONLINE MODE
  // ================================================================

  function wsConnect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      handleServerMsg(msg);
    };
    ws.onclose = () => {
      // Only show alert if user is in a game
      if (mode === 'online') {
        alert('Connection lost. Returning to menu.');
        show('scr-menu');
      }
    };
    return new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
  }

  function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function handleServerMsg(msg) {
    switch (msg.type) {
      case 'room_created':
        $('lobby-code').textContent = msg.code;
        show('scr-lobby');
        break;

      case 'room_ready':
        myNum = msg.you;
        show('scr-toss');
        $('tr-p2-label').textContent = `P${myNum === 1 ? 2 : 1}`;
        if (myNum === 1) {
          $('toss-msg').textContent = 'You are Player 1. Choose Odd or Even.';
          $('toss-btns').classList.remove('hidden');
        } else {
          $('toss-msg').textContent = 'Waiting for Player 1 to choose Odd/Even...';
          $('toss-btns').classList.add('hidden');
        }
        $('toss-cam').classList.add('hidden');
        $('toss-result').classList.add('hidden');
        $('role-btns').classList.add('hidden');
        $('toss-winner').textContent = '';
        initHands();
        break;

      case 'do_countdown': {
        if (msg.reason === 'toss') {
          $('toss-cam').classList.remove('hidden');
          $('toss-btns').classList.add('hidden');
          $('toss-msg').textContent = `Toss: ${msg.choice.toUpperCase()} chosen. Show hand!`;
          startCamera($('toss-canvas'));
          setTimeout(async () => {
            await countdown($('toss-cd'), $('toss-cd-num'), $('toss-ring'), 3);
            const g = latestGesture;
            wsSend({ type: 'throw', value: (g && MOVES.includes(g)) ? g : MOVES[Math.floor(Math.random() * MOVES.length)] });
          }, 500);
        } else if (msg.reason === 'round') {
          onlineRoundCountdown();
        }
        break;
      }

      case 'toss_result': {
        $('toss-result').classList.remove('hidden');
        $('tr-p1').textContent = msg.p1Throw;
        $('tr-p2').textContent = msg.p2Throw;
        $('tr-sum').textContent = `${msg.sum} (${msg.isEven ? 'EVEN' : 'ODD'})`;
        const iWon = msg.winner === myNum;
        if (iWon) {
          $('toss-winner').textContent = 'You won the toss! Choose your role:';
          $('role-btns').classList.remove('hidden');
        } else {
          $('toss-winner').textContent = 'Opponent won the toss. Waiting for their choice...';
        }
        $('btn-toss-throw').classList.add('hidden');
        break;
      }

      case 'game_start': {
        game.p1Role = msg.p1Role;
        game.p2Role = msg.p2Role;

        show('scr-game');
        $('pname-1').textContent = `P${myNum}`;
        $('pname-2').textContent = `P${myNum === 1 ? 2 : 1}`;
        // If I'm P2, I see my score on the left panel but server tracks p1Score for player 1
        // For simplicity: left panel = P1, right panel = P2 (server perspective)
        $('pthrow-1').textContent = '-';
        $('pthrow-2').textContent = '-';
        $('btn-throw').disabled = false;
        startCamera($('game-canvas'));
        updateGameUI();
        break;
      }

      case 'wait_opponent':
        $('btn-throw').disabled = true;
        flash('WAITING...', 'flash-info', 2000);
        break;

      case 'round_result': {
        const p1t = msg.p1Throw;
        const p2t = msg.p2Throw;
        $('pthrow-1').textContent = p1t;
        $('pthrow-2').textContent = p2t;

        game.history.unshift({ p1: p1t, p2: p2t, out: msg.out });
        if (game.history.length > 12) game.history.pop();

        if (msg.out) {
          flash('OUT!', 'flash-out', 2000);
          if (msg.inningsOver) {
            game.target = msg.target;
            game.innings = msg.innings;
            game.round = 1;
            game.p1Role = msg.p1Role;
            game.p2Role = msg.p2Role;
            setTimeout(() => {
              flash(`TARGET: ${game.target}`, 'flash-info', 2500);
              updateGameUI();
              $('btn-throw').disabled = false;
              busy = false;
            }, 2200);
          }
        } else {
          game.p1Score = msg.p1Score;
          game.p2Score = msg.p2Score;
          game.innings = msg.innings;
          game.round = msg.round;
          game.p1Role = msg.p1Role;
          game.p2Role = msg.p2Role;
          flash(`+${msg.runs}`, 'flash-runs', 1500);
          updateGameUI();
          setTimeout(() => { $('btn-throw').disabled = false; busy = false; }, 1800);
        }
        break;
      }

      case 'match_over': {
        $('pthrow-1').textContent = msg.p1Throw;
        $('pthrow-2').textContent = msg.p2Throw;
        game.p1Score = msg.p1Score;
        game.p2Score = msg.p2Score;
        if (msg.out) flash('OUT!', 'flash-out', 2000);
        setTimeout(() => showResult(), 2200);
        break;
      }

      case 'opponent_left':
        alert('Opponent disconnected.');
        show('scr-menu');
        break;

      case 'error':
        alert(msg.text);
        break;
    }
  }

  async function onlineRoundCountdown() {
    $('pthrow-1').textContent = '-';
    $('pthrow-2').textContent = '-';
    $('btn-throw').disabled = true;
    busy = true;

    await countdown($('game-cd'), $('game-cd-num'), $('game-ring'), 3);

    const g = latestGesture;
    if (!g || !MOVES.includes(g)) {
      // In online mode, we MUST send something — notify user but still send
      flash('NO HAND!', 'flash-info', 1500);
      // Send random as fallback (can't hold up opponent)
      wsSend({ type: 'throw', value: MOVES[Math.floor(Math.random() * MOVES.length)] });
    } else {
      wsSend({ type: 'throw', value: g });
    }
  }

  // ================================================================
  //   EVENT LISTENERS
  // ================================================================

  // Menu
  $('btn-ai').addEventListener('click', () => {
    mode = 'ai';
    resetGame();
    aiStartToss();
  });

  $('btn-create').addEventListener('click', async () => {
    mode = 'online';
    resetGame();
    try {
      await wsConnect();
      wsSend({ type: 'create_room' });
    } catch {
      alert('Could not connect to server. Make sure server.js is running.');
    }
  });

  $('btn-join').addEventListener('click', async () => {
    const code = $('inp-code').value.trim().toUpperCase();
    if (code.length < 4) { alert('Enter a valid room code.'); return; }
    mode = 'online';
    resetGame();
    try {
      await wsConnect();
      wsSend({ type: 'join_room', code });
    } catch {
      alert('Could not connect to server. Make sure server.js is running.');
    }
  });

  $('btn-lobby-back').addEventListener('click', () => {
    if (ws) ws.close();
    show('scr-menu');
  });

  // Toss
  $('btn-odd').addEventListener('click', () => {
    if (mode === 'ai') {
      aiTossChosen('odd');
    } else {
      wsSend({ type: 'toss_choice', choice: 'odd' });
      $('toss-btns').classList.add('hidden');
      $('toss-msg').textContent = 'You chose ODD. Get ready...';
    }
  });

  $('btn-even').addEventListener('click', () => {
    if (mode === 'ai') {
      aiTossChosen('even');
    } else {
      wsSend({ type: 'toss_choice', choice: 'even' });
      $('toss-btns').classList.add('hidden');
      $('toss-msg').textContent = 'You chose EVEN. Get ready...';
    }
  });

  $('btn-toss-throw').addEventListener('click', () => {
    if (mode === 'ai') aiTossThrow();
  });

  // Role choice
  $('btn-bat').addEventListener('click', () => {
    if (mode === 'ai') {
      aiBeginGame('batting');
    } else {
      wsSend({ type: 'role_choice', role: 'batting' });
    }
  });

  $('btn-bowl').addEventListener('click', () => {
    if (mode === 'ai') {
      aiBeginGame('bowling');
    } else {
      wsSend({ type: 'role_choice', role: 'bowling' });
    }
  });

  // Game throw
  $('btn-throw').addEventListener('click', () => {
    if (mode === 'ai') {
      aiThrowRound();
    } else {
      wsSend({ type: 'request_round' });
      $('btn-throw').disabled = true;
      flash('READY', 'flash-info', 1000);
    }
  });

  // Play again
  $('btn-again').addEventListener('click', () => {
    if (ws) ws.close();
    resetGame();
    show('scr-menu');
  });

  // ─── BOOT ─────────────────────────────────────────────
  window.addEventListener('load', () => {
    if (typeof window.Hands === 'undefined') {
      document.body.innerHTML = `
        <div style="display:flex;height:100vh;width:100vw;justify-content:center;align-items:center;flex-direction:column;background:#0a0e17;color:#00d4ff;font-family:Poppins,sans-serif;text-align:center;padding:2rem;">
          <h2>MediaPipe Failed to Load</h2>
          <p style="margin-top:1rem;color:#627080;max-width:420px;">Could not load the hand tracking library. Check your internet and reload.</p>
          <button onclick="location.reload()" style="margin-top:1.5rem;padding:12px 30px;background:transparent;border:2px solid #00d4ff;color:#00d4ff;cursor:pointer;font-family:inherit;font-size:1rem;border-radius:8px;">RETRY</button>
        </div>`;
    }
  });

})();
