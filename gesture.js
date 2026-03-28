export class GestureController {
  constructor(videoElement, canvasElement, onResultsCallback) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.canvasCtx = this.canvasElement.getContext('2d');
    this.onResultsCallback = onResultsCallback;

    this.hands = new window.Hands({
      locateFile: (file) => `https://unpkg.com/@mediapipe/hands/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });

    this.hands.onResults(this.onResults.bind(this));

    this.camera = new window.Camera(this.videoElement, {
      onFrame: async () => {
        await this.hands.send({ image: this.videoElement });
      },
      width: 640,
      height: 480
    });
  }

  start() {
    this.camera.start();
  }

  stop() {
    this.camera.stop();
  }

  onResults(results) {
    this.canvasCtx.save();
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

    let detectedHands = [];

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i].label; // Left/Right (MediaPipe's guess)
        
        // Draw skeletons
        window.drawConnectors(this.canvasCtx, landmarks, window.HAND_CONNECTIONS, {color: '#d88dff', lineWidth: 4});
        window.drawLandmarks(this.canvasCtx, landmarks, {color: '#ffffff', lineWidth: 2, radius: 3});

        // Determine which player based on X position.
        // Raw camera coords: x=0 is left edge, x=1 is right edge. 
        // Players physically stand: P1 on left, P2 on right.
        // Camera sees P1 on its right (x > 0.5), P2 on its left (x < 0.5).
        const wristX = landmarks[0].x;
        const playerSide = wristX > 0.5 ? 'p1' : 'p2';

        const { gesture, confidence } = this.detectGesture(landmarks, handedness);
        detectedHands.push({ playerSide, gesture, confidence });
      }
    }

    if (this.onResultsCallback) {
      this.onResultsCallback(detectedHands);
    }
    
    this.canvasCtx.restore();
  }

  detectGesture(landmarks, handedness) {
    const isRight = handedness === 'Right';
    
    // For y, smaller value means higher up on the screen
    // Check if fingers are extended relative to their pip joint
    const indexUp = landmarks[8].y < landmarks[6].y;
    const middleUp = landmarks[12].y < landmarks[10].y;
    const ringUp = landmarks[16].y < landmarks[14].y;
    const pinkyUp = landmarks[20].y < landmarks[18].y;
    
    // Thumb logic: depends on left vs right handedness
    const thumbUp = isRight ? landmarks[4].x < landmarks[3].x : landmarks[4].x > landmarks[3].x;

    let count = 0;
    if (thumbUp) count++;
    if (indexUp) count++;
    if (middleUp) count++;
    if (ringUp) count++;
    if (pinkyUp) count++;

    // Only allow 1,2,3,4,5 and Fist (10)
    let gesture = 10;
    if (count > 0 && count <= 5) {
      gesture = count;
    }

    return { gesture: gesture, confidence: 1.0 }; // Keep confidence simple for now
  }
}
