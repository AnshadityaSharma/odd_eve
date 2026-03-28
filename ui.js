export class UIController {
  constructor() {
    this.els = {
      modeCtl: document.getElementById('controls-mode'),
      tossCtl: document.getElementById('controls-toss'),
      roleCtl: document.getElementById('controls-role'),
      actionCtl: document.getElementById('controls-action'),
      endCtl: document.getElementById('controls-end'),

      btn1p: document.getElementById('btn-1p'),
      btn2p: document.getElementById('btn-2p'),
      btnOdd: document.getElementById('btn-odd'),
      btnEven: document.getElementById('btn-even'),
      btnBat: document.getElementById('btn-bat'),
      btnBowl: document.getElementById('btn-bowl'),
      btnStartTurn: document.getElementById('btn-start-round'),
      btnRestart: document.getElementById('btn-restart'),
      autoPlay: document.getElementById('auto-play-checkbox'),
      
      statusBanner: document.getElementById('game-status'),
      tossWinnerMsg: document.getElementById('toss-winner-msg'),
      finalWinnerMsg: document.getElementById('final-winner-msg'),

      panelP1: document.getElementById('panel-p1'),
      scoreP1: document.getElementById('score-p1'),
      roleP1: document.getElementById('role-p1'),
      throwP1: document.getElementById('throw-p1'),

      panelP2: document.getElementById('panel-p2'),
      nameP2: document.getElementById('name-p2'),
      scoreP2: document.getElementById('score-p2'),
      roleP2: document.getElementById('role-p2'),
      throwP2: document.getElementById('throw-p2'),

      countdownOverlay: document.getElementById('countdown-overlay'),
      countdownText: document.getElementById('countdown-text'),
      timerCircle: document.getElementById('timer-circle'),
      msgOverlay: document.getElementById('message-overlay')
    };
  }

  showControls(group) {
    this.els.modeCtl.classList.add('hidden');
    this.els.tossCtl.classList.add('hidden');
    this.els.roleCtl.classList.add('hidden');
    this.els.actionCtl.classList.add('hidden');
    this.els.endCtl.classList.add('hidden');
    if (group && this.els[group]) {
      this.els[group].classList.remove('hidden');
    }
  }

  setStatus(text) {
    this.els.statusBanner.innerText = text;
  }

  getEmoji(gesture) {
    switch(gesture) {
      case 1: return '☝️';
      case 2: return '✌️';
      case 3: return '3️⃣'; // The 3 fingers emoji isn't standard across all platforms, 3️⃣ is safe
      case 4: return '4️⃣';
      case 5: return '🖐️';
      case 10: return '✊';
      default: return '?';
    }
  }

  updateBoard(state, mode) {
    if (mode === '2P') {
      this.els.nameP2.innerText = 'PLAYER 2';
    } else {
      this.els.nameP2.innerText = 'AI';
    }

    this.els.scoreP1.innerText = state.playerScore;
    this.els.scoreP2.innerText = state.aiScore;

    this.els.roleP1.innerText = state.roles.player ? state.roles.player.toUpperCase() : 'WAITING';
    this.els.roleP2.innerText = state.roles.ai ? state.roles.ai.toUpperCase() : 'WAITING';

    this.els.roleP1.className = 'role-badge ' + (state.roles.player || '');
    this.els.roleP2.className = 'role-badge ' + (state.roles.ai || '');

    // Active Turn Highlighting
    if (state.roles.player === 'batting') {
      this.els.panelP1.classList.add('active-turn');
      this.els.panelP2.classList.remove('active-turn');
    } else if (state.roles.player === 'bowling') {
      this.els.panelP1.classList.remove('active-turn');
      this.els.panelP2.classList.add('active-turn');
    } else {
      this.els.panelP1.classList.remove('active-turn');
      this.els.panelP2.classList.remove('active-turn');
    }
  }

  updateThrows(p1Throw, p2Throw) {
    this.els.throwP1.innerText = p1Throw ? `${p1Throw} ${this.getEmoji(p1Throw)}` : '?';
    this.els.throwP2.innerText = p2Throw ? `${p2Throw} ${this.getEmoji(p2Throw)}` : '?';
  }

  startCountdown(seconds, onComplete, onTick) {
    this.els.countdownOverlay.classList.remove('hidden');
    this.els.countdownText.innerText = seconds;
    this.els.timerCircle.style.strokeDashoffset = '283'; // Full invisible
    
    // Animate the circle filling up
    this.els.timerCircle.style.transition = `stroke-dashoffset ${seconds}s linear`;
    setTimeout(() => {
      this.els.timerCircle.style.strokeDashoffset = '0'; // Full visible
    }, 50);

    let current = seconds;
    const interval = setInterval(() => {
      current--;
      if (current > 0) {
        this.els.countdownText.innerText = current;
        if (onTick) onTick(current);
      } else {
        clearInterval(interval);
        this.els.countdownText.innerText = 'SHOOT!';
        if (onComplete) onComplete();
        setTimeout(() => {
          this.els.countdownOverlay.classList.add('hidden');
        }, 800);
      }
    }, 1000);
  }

  showMessage(msg, duration = 2000) {
    this.els.msgOverlay.innerText = msg;
    this.els.msgOverlay.classList.remove('hidden');
    setTimeout(() => {
      this.els.msgOverlay.classList.add('hidden');
    }, duration);
  }
}
