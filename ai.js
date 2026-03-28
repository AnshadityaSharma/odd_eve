/* ============================================================
   AI Engine – Hybrid Prediction (Markov + Frequency + Recency)
   ============================================================ */
class AIEngine {
  constructor() {
    this.MOVES = [1, 2, 3, 4, 5, 10];
    this.KEY = 'hc_ai_v3';
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY));
      if (d && d.freq) {
        this.history = d.history || [];
        this.trans = d.trans || this._emptyTrans();
        this.freq = d.freq || this._emptyFreq();
        this.total = d.total || 0;
        return;
      }
    } catch (_) {}
    this.history = [];
    this.trans = this._emptyTrans();
    this.freq = this._emptyFreq();
    this.total = 0;
  }

  save() {
    localStorage.setItem(this.KEY, JSON.stringify({
      history: this.history, trans: this.trans, freq: this.freq, total: this.total
    }));
  }

  _emptyFreq() { const f = {}; for (const m of this.MOVES) f[m] = 0; return f; }
  _emptyTrans() { const t = {}; for (const m of this.MOVES) t[m] = this._emptyFreq(); return t; }

  update(move) {
    if (!this.MOVES.includes(move)) return;
    this.freq[move]++;
    this.total++;
    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      this.trans[last][move]++;
    }
    this.history.push(move);
    if (this.history.length > 60) this.history.shift();
    this.save();
  }

  _scores() {
    if (this.total < 3) return null;
    const scores = {};
    for (const m of this.MOVES) {
      let markov = 0;
      const last = this.history[this.history.length - 1];
      if (last && this.trans[last]) {
        const row = this.trans[last];
        const rt = Object.values(row).reduce((a, b) => a + b, 0);
        if (rt > 0) markov = row[m] / rt;
      }
      let freq = this.total > 0 ? this.freq[m] / this.total : 0;
      let recent = 0;
      const rc = this.history.slice(-8);
      if (rc.length > 0) recent = rc.filter(x => x === m).length / rc.length;
      scores[m] = 0.5 * markov + 0.3 * freq + 0.2 * recent;
    }
    return scores;
  }

  decide(isBowling) {
    const scores = this._scores();
    if (!scores) return this.MOVES[Math.floor(Math.random() * this.MOVES.length)];
    if (isBowling) {
      let best = this.MOVES[0], bs = -1;
      for (const m of this.MOVES) { if (scores[m] > bs) { bs = scores[m]; best = m; } }
      return best;
    } else {
      let best = this.MOVES[0], bs = Infinity;
      for (const m of this.MOVES) { if (scores[m] < bs) { bs = scores[m]; best = m; } }
      return best;
    }
  }
}
