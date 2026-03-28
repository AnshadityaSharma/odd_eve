import { GestureController } from './gesture.js';
import { AIEngine } from './ai.js';
import { GameState } from './game.js';
import { UIController } from './ui.js';

class GameController {
  constructor() {
    this.gestureCtrl = new GestureController(
      document.querySelector('.input_video'),
      document.querySelector('.output_canvas'),
      this.onHandsDetected.bind(this)
    );
    this.ai = new AIEngine();
    this.state = new GameState();
    this.ui = new UIController();

    this.mode = '1P'; // '1P' or '2P'
    this.currentHands = { p1: null, p2: null }; // Last detected gestures mapping
    
    // Status states
    this.isResolving = false;
    this.isTossPhase = false;

    this.initEvents();
  }

  initEvents() {
    this.ui.els.btn1p.onclick = () => this.startSetup('1P');
    this.ui.els.btn2p.onclick = () => this.startSetup('2P');
    
    this.ui.els.btnOdd.onclick = () => this.startToss('odd');
    this.ui.els.btnEven.onclick = () => this.startToss('even');
    
    this.ui.els.btnBat.onclick = () => this.startGame('batting');
    this.ui.els.btnBowl.onclick = () => this.startGame('bowling');

    this.ui.els.btnStartTurn.onclick = () => this.playRound();
    this.ui.els.btnRestart.onclick = () => {
      this.state.reset();
      this.ui.showControls('modeCtl');
      this.ui.setStatus('SELECT GAME MODE');
      this.ui.updateBoard(this.state, '1P');
    };
  }

  startSetup(mode) {
    this.mode = mode;
    this.ui.showControls('tossCtl');
    this.ui.setStatus('TOSS SELECTION');
    this.ui.updateBoard(this.state, this.mode);
    
    // Show camera
    this.gestureCtrl.videoElement.style.display = 'block';
    this.gestureCtrl.videoElement.classList.add('hidden'); // keep visually hidden
    this.gestureCtrl.start();
  }

  startToss(p1Choice) {
    this.state.setToss(p1Choice);
    this.ui.showControls('');
    this.ui.setStatus(`TOSS: P1 CHOSE ${p1Choice.toUpperCase()}. GET READY!`);
    
    // Countdown for Toss
    this.ui.startCountdown(3, () => {
      this.resolveToss();
    });
  }

  onHandsDetected(handsData) {
    if (this.isResolving) return;

    this.currentHands.p1 = null;
    this.currentHands.p2 = null;

    if (this.mode === '2P') {
      // For 2 Players, sort by x-coord assignment from gesture.js
      for (const h of handsData) {
        if (h.playerSide === 'p1') this.currentHands.p1 = h.gesture;
        if (h.playerSide === 'p2') this.currentHands.p2 = h.gesture;
      }
    } else {
      // 1 Player: accept the first hand detected as P1
      if (handsData.length > 0) {
        this.currentHands.p1 = handsData[0].gesture;
      }
    }
  }

  resolveToss() {
    this.isResolving = true;
    
    const p1Throw = this.currentHands.p1 || 10; // default to 10 if missing
    let p2Throw = 10;

    if (this.mode === '2P') {
      p2Throw = this.currentHands.p2 || 10;
    } else {
      p2Throw = [1,2,3,4,5,10][Math.floor(Math.random() * 6)];
    }

    this.ui.updateThrows(p1Throw, p2Throw);

    const res = this.state.resolveToss(p1Throw, p2Throw);
    if (res.playerWonToss) {
      this.ui.els.tossWinnerMsg.innerText = `Sum is ${res.sum} (${res.isEven ? 'Even' : 'Odd'}). P1 won toss!`;
      this.ui.showControls('roleCtl');
    } else {
      const winnerName = this.mode === '2P' ? 'P2' : 'AI';
      this.ui.els.tossWinnerMsg.innerText = `Sum is ${res.sum} (${res.isEven ? 'Even' : 'Odd'}). ${winnerName} won toss.`;
      this.ui.showControls('');
      
      setTimeout(() => {
        let aiChoice = Math.random() > 0.5 ? 'batting' : 'bowling';
        if (this.mode === '2P') {
          // just random assign since UI doesn't have P2 manual selection for brevity
          this.ui.showMessage(`P2 chose to ${aiChoice === 'batting' ? 'BAT' : 'BOWL'}`);
        } else {
          this.ui.showMessage(`AI chose to ${aiChoice === 'batting' ? 'BAT' : 'BOWL'}`);
        }
        
        setTimeout(() => {
          this.startGame(aiChoice === 'batting' ? 'bowling' : 'batting');
        }, 2000);
      }, 1000);
    }
    this.isResolving = false;
  }

  startGame(p1Role) {
    this.state.setRoles(p1Role);
    this.ui.showControls('actionCtl');
    this.ui.updateBoard(this.state, this.mode);
    this.ui.setStatus(`INNINGS ${this.state.innings} · ROUND ${this.state.round}`);
  }

  playRound() {
    this.ui.showControls('');
    this.ui.setStatus('GET READY TO THROW!');
    this.ui.updateThrows('?','?');
    
    this.ui.startCountdown(3, () => {
      this.resolveRound();
    });
  }

  resolveRound() {
    this.isResolving = true;
    
    const p1Throw = this.currentHands.p1 || 10;
    let p2Throw = 10;

    if (this.mode === '2P') {
      p2Throw = this.currentHands.p2 || 10;
    } else {
      const isAIBowling = this.state.roles.ai === 'bowling';
      p2Throw = this.ai.makeDecision(isAIBowling);
      this.ai.update(p1Throw); // AI learns
    }

    this.ui.updateThrows(p1Throw, p2Throw);
    
    // Evaluate Game
    const result = this.state.playThrows(p1Throw, p2Throw);
    
    if (result.isOut) {
      this.ui.showMessage(`OUT!`, 1500);
    } else {
      this.ui.showMessage(`+${result.runsScored}`, 1500);
    }
    
    setTimeout(() => {
      this.ui.updateBoard(this.state, this.mode);
      this.ui.setStatus(`INNINGS ${this.state.innings} · ROUND ${this.state.round}`);
      
      if (result.inningsChanged) {
        this.ui.showMessage(`INNINGS CHANGE! TARGET: ${this.state.target}`, 2500);
      }
      
      if (result.gameOver) {
        let winnerStr = result.winner;
        if (winnerStr === 'player') winnerStr = 'PLAYER 1';
        else if (winnerStr === 'ai') winnerStr = this.mode === '2P' ? 'PLAYER 2' : 'AI';
        else winnerStr = 'TIE';
        
        this.ui.els.finalWinnerMsg.innerText = `MATCH OVER. WINNER: ${winnerStr}`;
        this.ui.showControls('endCtl');
        this.gestureCtrl.stop();
      } else {
        // Show next round button
        this.ui.showControls('actionCtl');
        if (this.ui.els.autoPlay.checked) {
          setTimeout(() => {
            if (document.getElementById('controls-action').classList.contains('hidden') === false) {
               this.playRound();
            }
          }, 800); // Small pause before auto starting next round
        }
      }
      
      this.isResolving = false;
    }, 1500); // Wait for message to vanish
  }
}

// Start game
window.onload = () => {
  if (typeof window.Hands !== 'undefined') {
    new GameController();
  } else {
    document.body.innerHTML = `
      <div style="display:flex; height:100vh; width:100vw; justify-content:center; align-items:center; flex-direction:column; background:#120a1a; color:#d88dff; font-family:'Space Mono', monospace; text-align:center;">
        <h2>Network Error</h2>
        <p>Failed to load MediaPipe from CDN.</p>
        <button onclick="window.location.reload()" style="margin-top:20px; padding:10px 20px; background:transparent; border:1px solid #d88dff; color:#d88dff; cursor:pointer;">Retry</button>
      </div>
    `;
  }
};
