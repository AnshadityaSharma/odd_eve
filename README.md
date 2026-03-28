# Hand Cricket (Odd-Even) Gesture Arena

An AI-powered web-based Hand Cricket game featuring:
- **Gesture Recognition:** Play using your webcam via MediaPipe Hand Tracking (1-5 fingers and fist for 10).
- **Adaptive AI:** Learns your patterns in real-time using Markov Chains, Frequency Analysis, and Recency Bias.
- **Online Multiplayer:** Play private matches with friends using room codes via WebSockets.
- **Modern UI:** Clean, responsive design with a dark navy, teal, and gold color scheme.

## How to Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   node server.js
   ```
3. Open your browser and navigate to `http://localhost:3000`.

## How it Works
- The app uses MediaPipe to detect hand landmarks and counts extended fingers.
- The Node.js server acts as a static file server and a WebSocket hub for synchronized online multiplayer games.
- The AI engine tracks your moves in `localStorage` and calculates a weighted probability to predict your next throw.
