export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = 'SETUP'; // SETUP, PLAYING, ENDED
    this.innings = 1;
    this.round = 1;
    this.playerScore = 0;
    this.aiScore = 0;
    this.roles = {
      player: null, // 'batting' or 'bowling'
      ai: null
    };
    this.target = null;
    this.history = []; // last 10 throws {"player": X, "ai": Y}
  }

  setToss(playerChoice) {
    this.playerTossChoice = playerChoice; // 'odd' or 'even'
  }

  resolveToss(playerThrow, aiThrow) {
    const sum = playerThrow + aiThrow;
    const isEven = sum % 2 === 0;
    
    let playerWonToss;
    if (this.playerTossChoice === 'even' && isEven) playerWonToss = true;
    else if (this.playerTossChoice === 'odd' && !isEven) playerWonToss = true;
    else playerWonToss = false;

    return {
      sum,
      isEven,
      playerWonToss
    };
  }

  setRoles(playerRole) {
    this.roles.player = playerRole;
    this.roles.ai = playerRole === 'batting' ? 'bowling' : 'batting';
    this.state = 'PLAYING';
  }

  playThrows(playerThrow, aiThrow) {
    if (this.state !== 'PLAYING') return null;

    let result = {
      playerThrow,
      aiThrow,
      isOut: false,
      runsScored: 0,
      inningsChanged: false,
      gameOver: false,
      winner: null
    };

    // Add to history
    this.history.unshift({ player: playerThrow, ai: aiThrow });
    if (this.history.length > 5) {
      this.history.pop();
    }
    
    this.round++;

    if (playerThrow === aiThrow) {
      result.isOut = true;
      if (this.innings === 1) {
        // Innings transition
        this.innings = 2;
        this.round = 1;
        this.target = (this.roles.player === 'batting' ? this.playerScore : this.aiScore) + 1;
        
        // Swap roles
        this.roles.player = this.roles.player === 'batting' ? 'bowling' : 'batting';
        this.roles.ai = this.roles.ai === 'batting' ? 'bowling' : 'batting';
        
        result.inningsChanged = true;
      } else {
        // Match over
        this.state = 'ENDED';
        result.gameOver = true;
        result.winner = this.getWinner();
      }
    } else {
      // Not out, add runs
      let runScorer = this.roles.player === 'batting' ? 'player' : 'ai';
      let addedRuns = runScorer === 'player' ? playerThrow : aiThrow;
      
      if (runScorer === 'player') this.playerScore += addedRuns;
      else this.aiScore += addedRuns;
      
      result.runsScored = addedRuns;

      // Check if target reached in 2nd innings
      if (this.innings === 2 && this.target !== null) {
        let currentBatScore = runScorer === 'player' ? this.playerScore : this.aiScore;
        if (currentBatScore >= this.target) {
          this.state = 'ENDED';
          result.gameOver = true;
          result.winner = runScorer;
        }
      }
    }

    return result;
  }

  getWinner() {
    if (this.playerScore > this.aiScore) return 'player';
    if (this.aiScore > this.playerScore) return 'ai';
    return 'tie';
  }
}
