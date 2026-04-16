console.log('Client loaded');

// ============================================
// DOM Elements
// ============================================

// Setup elements
const setupContainer = document.getElementById('setupContainer');
const gameContainer = document.getElementById('gameContainer');
const progressDots = [
  document.getElementById('progressDot1'),
  document.getElementById('progressDot2'),
  document.getElementById('progressDot3')
];

// Setup panels
const setupNamePanel = document.getElementById('setupName');
const setupCameraPanel = document.getElementById('setupCamera');
const setupModelPanel = document.getElementById('setupModel');
const setupReadyPanel = document.getElementById('setupReady');

// Setup inputs
const nameInput = document.getElementById('nameInput');
const nameError = document.getElementById('nameError');
const submitNameBtn = document.getElementById('submitNameBtn');
const enableCameraBtn = document.getElementById('enableCameraBtn');
const cameraPreview = document.getElementById('cameraPreview');
const setupVideo = document.getElementById('setupVideo');
const cameraError = document.getElementById('cameraError');
const modelProgressBar = document.getElementById('modelProgressBar');
const modelStatusText = document.getElementById('modelStatusText');
const enterGameBtn = document.getElementById('enterGameBtn');

// Game elements
const playerNameEl = document.getElementById('playerName');
const playerStatsEl = document.getElementById('playerStats');
const matchStatusEl = document.getElementById('matchStatus');
const opponentNameEl = document.getElementById('opponentName');
const gameVideo = document.getElementById('gameVideo');
const handCanvasEl = document.getElementById('handCanvas');
const canvasCtx = handCanvasEl.getContext('2d');
const gestureDisplay = document.getElementById('gestureDisplay');
const gestureEmojiEl = document.getElementById('gestureEmoji');
const gestureNameEl = document.getElementById('gestureName');
const gestureConfidenceEl = document.getElementById('gestureConfidence');
const joinQueueBtn = document.getElementById('joinQueueBtn');
const cancelQueueBtn = document.getElementById('cancelQueueBtn');

// Overlay elements
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownText = document.getElementById('countdownText');
const resultOverlay = document.getElementById('resultOverlay');
const resultTitle = document.getElementById('resultTitle');
const outcomeMessage = document.getElementById('outcomeMessage');
const resultPlayers = document.getElementById('resultPlayers');
const resultScores = document.getElementById('resultScores');
const playAgainBtn = document.getElementById('playAgainBtn');
const leaveMatchBtn = document.getElementById('leaveMatchBtn');
const disconnectOverlay = document.getElementById('disconnectOverlay');
const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');

// Leaderboard elements
const leaderboardToggle = document.getElementById('leaderboardToggle');
const leaderboardSidebar = document.getElementById('leaderboardSidebar');
const leaderboardList = document.getElementById('leaderboardList');
const yourRankDisplay = document.getElementById('yourRankDisplay');
const yourRankNumber = document.getElementById('yourRankNumber');

// ============================================
// State Constants
// ============================================

const SETUP_STATES = {
  NAME: 'name',
  CAMERA: 'camera',
  MODEL: 'model',
  READY: 'ready',
  COMPLETE: 'complete'
};

const GAME_STATES = {
  IDLE: 'idle',
  QUEUED: 'queued',
  MATCHED: 'matched',
  COUNTDOWN: 'countdown',
  LOCKED: 'locked',
  RESULT: 'result'
};

const GESTURES = {
  ROCK: 'rock',
  PAPER: 'paper',
  SCISSORS: 'scissors',
  NONE: 'none'
};

const GESTURE_EMOJIS = {
  rock: '\u270A',
  paper: '\u270B',
  scissors: '\u270C',
  none: '\u2753'
};

// ============================================
// State Variables
// ============================================

let setupState = SETUP_STATES.NAME;
let gameState = GAME_STATES.IDLE;
let playerName = null;
let playerStats = { totalWins: 0, totalLosses: 0 };
let playerRank = null;
let matchId = null;
let playerRole = null;
let opponentName = null;
let currentOpponentName = null;

// Camera and hand detection
let mediaStream = null;
let handLandmarker = null;
let lastVideoTime = -1;
let gestureBuffer = null;
let currentGesture = GESTURES.NONE;
let currentConfidence = 0;
let lockedGesture = null;
let countdownInterval = null;

// ============================================
// Hand Detection Constants
// ============================================

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const WRIST = 0;
const FINGER_TIPS = [8, 12, 16, 20];
const FINGER_BASES = [5, 9, 13, 17];
const FINGER_EXTENSION_THRESHOLD = 1.2;
const STABILITY_WINDOW_MS = 400;

// ============================================
// Socket Connection
// ============================================

const socket = io();

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// ============================================
// Setup Flow Functions
// ============================================

function updateSetupProgress(step) {
  const stepIndex = {
    [SETUP_STATES.NAME]: 0,
    [SETUP_STATES.CAMERA]: 1,
    [SETUP_STATES.MODEL]: 2,
    [SETUP_STATES.READY]: 2,
    [SETUP_STATES.COMPLETE]: 3
  };

  const currentIndex = stepIndex[step];

  progressDots.forEach((dot, i) => {
    dot.classList.remove('active', 'completed');
    if (i < currentIndex) {
      dot.classList.add('completed');
    } else if (i === currentIndex) {
      dot.classList.add('active');
    }
  });
}

function showSetupPanel(panel) {
  [setupNamePanel, setupCameraPanel, setupModelPanel, setupReadyPanel].forEach(p => {
    p.classList.remove('active');
  });
  panel.classList.add('active');
}

function goToSetupStep(step) {
  setupState = step;
  updateSetupProgress(step);

  switch (step) {
    case SETUP_STATES.NAME:
      showSetupPanel(setupNamePanel);
      nameInput.focus();
      break;
    case SETUP_STATES.CAMERA:
      showSetupPanel(setupCameraPanel);
      break;
    case SETUP_STATES.MODEL:
      showSetupPanel(setupModelPanel);
      initHandDetection();
      break;
    case SETUP_STATES.READY:
      showSetupPanel(setupReadyPanel);
      break;
    case SETUP_STATES.COMPLETE:
      setupContainer.classList.add('hidden');
      gameContainer.classList.add('active');
      transferVideoToGame();
      startGameDetection();
      break;
  }
}

// ============================================
// Step 1: Name Entry
// ============================================

function validateName(name) {
  if (!name || name.trim().length < 2) {
    return 'Name must be at least 2 characters';
  }
  if (name.trim().length > 12) {
    return 'Name must be 12 characters or less';
  }
  if (!/^[a-zA-Z0-9 ]+$/.test(name.trim())) {
    return 'Only letters, numbers, and spaces allowed';
  }
  return null;
}

submitNameBtn.addEventListener('click', submitName);
nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitName();
});

nameInput.addEventListener('input', () => {
  nameInput.classList.remove('error');
  nameError.textContent = '';
});

function submitName() {
  const name = nameInput.value;
  const error = validateName(name);

  if (error) {
    nameInput.classList.add('error');
    nameError.textContent = error;
    return;
  }

  submitNameBtn.disabled = true;
  submitNameBtn.textContent = 'Registering...';

  socket.emit('register_player', { name: name.trim() });
}

socket.on('registration_result', (data) => {
  if (data.success) {
    playerName = data.player.name;
    playerStats = {
      totalWins: data.player.totalWins,
      totalLosses: data.player.totalLosses
    };
    playerRank = data.rank;

    // Update leaderboard if provided
    if (data.leaderboard) {
      updateLeaderboard(data.leaderboard, playerRank);
    }

    goToSetupStep(SETUP_STATES.CAMERA);
  } else {
    nameInput.classList.add('error');
    nameError.textContent = data.error || 'Registration failed';
    submitNameBtn.disabled = false;
    submitNameBtn.textContent = 'Continue';
  }
});

// ============================================
// Step 2: Camera Permission
// ============================================

enableCameraBtn.addEventListener('click', requestCamera);

async function requestCamera() {
  enableCameraBtn.disabled = true;
  enableCameraBtn.textContent = 'Requesting...';
  cameraError.textContent = '';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraError.textContent = window.isSecureContext
      ? 'Camera not supported on this device'
      : 'HTTPS required for camera access';
    enableCameraBtn.disabled = false;
    enableCameraBtn.textContent = 'Enable Camera';
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });

    setupVideo.srcObject = mediaStream;
    await setupVideo.play();

    cameraPreview.classList.add('active');
    enableCameraBtn.style.display = 'none';

    // Auto-advance after camera is ready
    setTimeout(() => {
      goToSetupStep(SETUP_STATES.MODEL);
    }, 1000);

  } catch (error) {
    console.error('Camera setup failed:', error);
    enableCameraBtn.disabled = false;
    enableCameraBtn.textContent = 'Try Again';

    if (error.name === 'NotAllowedError') {
      cameraError.textContent = 'Camera permission denied';
    } else if (error.name === 'NotFoundError') {
      cameraError.textContent = 'No camera found';
    } else if (error.name === 'NotReadableError') {
      cameraError.textContent = 'Camera in use by another app';
    } else {
      cameraError.textContent = 'Camera error: ' + error.message;
    }
  }
}

// ============================================
// Step 3: Model Loading
// ============================================

function updateModelProgress(progress, text) {
  const segments = modelProgressBar.querySelectorAll('.progress-segment');
  const filled = Math.floor(progress * segments.length);

  segments.forEach((seg, i) => {
    if (i < filled) {
      seg.classList.add('filled');
    } else {
      seg.classList.remove('filled');
    }
  });

  modelStatusText.textContent = text;
}

async function initHandDetection() {
  updateModelProgress(0.1, 'Loading MediaPipe...');

  try {
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision');
    const { FilesetResolver, HandLandmarker } = vision;

    updateModelProgress(0.3, 'Downloading WASM files...');

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );

    updateModelProgress(0.5, 'Downloading hand model...');

    handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });

    updateModelProgress(0.8, 'Initializing...');

    // Brief delay to show progress
    await new Promise(resolve => setTimeout(resolve, 500));

    updateModelProgress(1.0, 'Ready!');
    gestureBuffer = new GestureBuffer();

    // Auto-advance to ready state
    setTimeout(() => {
      goToSetupStep(SETUP_STATES.READY);
    }, 800);

  } catch (error) {
    console.error('Failed to initialize hand detection:', error);
    modelStatusText.textContent = 'Error loading model. Please refresh.';
  }
}

// ============================================
// Step 4: Ready State
// ============================================

enterGameBtn.addEventListener('click', () => {
  goToSetupStep(SETUP_STATES.COMPLETE);
});

// ============================================
// Video Transfer to Game
// ============================================

function transferVideoToGame() {
  if (mediaStream) {
    gameVideo.srcObject = mediaStream;
    gameVideo.play();
    setupCanvas();
  }

  // Update player info
  playerNameEl.textContent = playerName;
  updatePlayerStats();
}

function setupCanvas() {
  handCanvasEl.width = gameVideo.videoWidth || 640;
  handCanvasEl.height = gameVideo.videoHeight || 480;
}

function updatePlayerStats() {
  playerStatsEl.textContent = `W: ${playerStats.totalWins} L: ${playerStats.totalLosses}`;
}

// ============================================
// Gesture Classification
// ============================================

class GestureBuffer {
  constructor(windowMs = STABILITY_WINDOW_MS) {
    this.buffer = [];
    this.windowMs = windowMs;
  }

  add(gesture, timestamp = performance.now()) {
    this.buffer.push({ gesture, timestamp });
    const cutoff = timestamp - this.windowMs;
    this.buffer = this.buffer.filter(entry => entry.timestamp > cutoff);
  }

  getMostFrequent() {
    if (this.buffer.length === 0) return { gesture: GESTURES.NONE, confidence: 0 };
    const counts = {};
    for (const entry of this.buffer) {
      counts[entry.gesture] = (counts[entry.gesture] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [gesture, count] = sorted[0];
    return { gesture, confidence: count / this.buffer.length };
  }

  clear() {
    this.buffer = [];
  }
}

function distance(landmark1, landmark2) {
  const dx = landmark1.x - landmark2.x;
  const dy = landmark1.y - landmark2.y;
  const dz = (landmark1.z || 0) - (landmark2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFingerExtended(landmarks, fingerTipIndex, fingerBaseIndex) {
  const wrist = landmarks[WRIST];
  const tip = landmarks[fingerTipIndex];
  const base = landmarks[fingerBaseIndex];
  return distance(tip, wrist) > distance(base, wrist) * FINGER_EXTENSION_THRESHOLD;
}

function getFingerExtensions(landmarks) {
  return FINGER_TIPS.map((tip, i) => isFingerExtended(landmarks, tip, FINGER_BASES[i]));
}

function classifyGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return GESTURES.NONE;

  const extensions = getFingerExtensions(landmarks);
  const [index, middle, ring, pinky] = extensions;
  const extendedCount = extensions.filter(e => e).length;

  if (extendedCount === 0) return GESTURES.ROCK;
  if (extendedCount === 4) return GESTURES.PAPER;
  if (extendedCount === 2 && index && middle && !ring && !pinky) return GESTURES.SCISSORS;

  return GESTURES.NONE;
}

// ============================================
// Hand Detection Loop
// ============================================

function startGameDetection() {
  if (!handLandmarker) return;
  detectHands();
}

function detectHands() {
  if (!handLandmarker || setupState !== SETUP_STATES.COMPLETE) {
    return;
  }

  if (gameVideo.currentTime !== lastVideoTime && gameVideo.readyState >= 2) {
    lastVideoTime = gameVideo.currentTime;

    const results = handLandmarker.detectForVideo(gameVideo, performance.now());

    if (results.landmarks && results.landmarks.length > 0) {
      drawLandmarks(results.landmarks);

      const hand = results.landmarks[0];
      const rawGesture = classifyGesture(hand);
      gestureBuffer.add(rawGesture);
      const { gesture, confidence } = gestureBuffer.getMostFrequent();
      updateGestureDisplay(gesture, confidence);
    } else {
      drawLandmarks(null);
      if (gestureBuffer) gestureBuffer.clear();
      updateGestureDisplay(GESTURES.NONE, 0);
    }
  }

  requestAnimationFrame(detectHands);
}

function drawLandmarks(landmarks) {
  canvasCtx.clearRect(0, 0, handCanvasEl.width, handCanvasEl.height);

  if (!landmarks || landmarks.length === 0) return;

  const hand = landmarks[0];

  // Draw connections
  canvasCtx.strokeStyle = '#00ff66';
  canvasCtx.lineWidth = 3;

  for (const [start, end] of HAND_CONNECTIONS) {
    const startPoint = hand[start];
    const endPoint = hand[end];

    canvasCtx.beginPath();
    canvasCtx.moveTo(startPoint.x * handCanvasEl.width, startPoint.y * handCanvasEl.height);
    canvasCtx.lineTo(endPoint.x * handCanvasEl.width, endPoint.y * handCanvasEl.height);
    canvasCtx.stroke();
  }

  // Draw landmark points
  canvasCtx.fillStyle = '#00f0ff';

  for (const landmark of hand) {
    const x = landmark.x * handCanvasEl.width;
    const y = landmark.y * handCanvasEl.height;

    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 5, 0, 2 * Math.PI);
    canvasCtx.fill();
  }
}

function updateGestureDisplay(gesture, confidence) {
  currentGesture = gesture;
  currentConfidence = confidence;

  const gestureText = gesture.charAt(0).toUpperCase() + gesture.slice(1);

  gestureEmojiEl.textContent = GESTURE_EMOJIS[gesture];
  gestureNameEl.textContent = gameState === GAME_STATES.LOCKED
    ? `${gestureText} (LOCKED)`
    : gestureText;
  gestureConfidenceEl.textContent = `Confidence: ${Math.round(confidence * 100)}%`;

  gestureDisplay.classList.remove('gesture-confident', 'gesture-locked');
  if (gameState === GAME_STATES.LOCKED) {
    gestureDisplay.classList.add('gesture-locked');
  } else if (gesture !== GESTURES.NONE && confidence >= 0.6) {
    gestureDisplay.classList.add('gesture-confident');
  }
}

// ============================================
// Snapshot Capture
// ============================================

function captureSnapshot() {
  if (!gameVideo || !mediaStream) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = gameVideo.videoWidth || 640;
    canvas.height = gameVideo.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    // Draw video frame (flip horizontally to match mirrored display)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(gameVideo, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (error) {
    console.error('Snapshot capture failed:', error);
    return null;
  }
}

// ============================================
// Game Flow
// ============================================

joinQueueBtn.addEventListener('click', () => {
  if (gameState !== GAME_STATES.IDLE) return;

  socket.emit('join_queue');
  gameState = GAME_STATES.QUEUED;
  joinQueueBtn.disabled = true;
  joinQueueBtn.textContent = 'Searching...';
  cancelQueueBtn.style.display = 'inline-block';
  matchStatusEl.textContent = 'Finding opponent...';
});

cancelQueueBtn.addEventListener('click', () => {
  if (gameState !== GAME_STATES.QUEUED) return;

  console.log('Canceling queue search...');
  socket.emit('leave_queue');
  resetToLobby();
});

socket.on('queue_left', () => {
  console.log('Left queue/match');
  resetToLobby();
});

socket.on('queue_error', (data) => {
  console.error('Queue error:', data.error);
  resetToLobby();
});

socket.on('matched', (data) => {
  console.log('Matched!', data);
  matchId = data.matchId;
  playerRole = data.you;
  currentOpponentName = data.opponentName;

  gameState = GAME_STATES.MATCHED;
  matchStatusEl.textContent = `Match #${data.matchId}`;
  opponentNameEl.textContent = `VS ${data.opponentName}`;
  joinQueueBtn.textContent = 'Matched!';
  cancelQueueBtn.style.display = 'none';
});

socket.on('round_start', (data) => {
  console.log('Round starting!', data);
  gameState = GAME_STATES.COUNTDOWN;
  lockedGesture = null;

  // Hide other overlays
  resultOverlay.classList.add('hidden');
  disconnectOverlay.classList.add('hidden');
  countdownOverlay.classList.remove('hidden');

  const now = Date.now();
  const countdownEndTime = data.startAtMs + data.countdownMs;
  let secondsLeft = Math.ceil((countdownEndTime - now) / 1000);

  countdownText.textContent = secondsLeft;

  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    secondsLeft--;

    if (secondsLeft > 0) {
      countdownText.textContent = secondsLeft;
    } else if (secondsLeft === 0) {
      countdownText.textContent = 'GO!';
      lockAndSubmitGesture();
    } else {
      clearInterval(countdownInterval);
      countdownInterval = null;
      countdownOverlay.classList.add('hidden');
    }
  }, 1000);
});

function lockAndSubmitGesture() {
  gameState = GAME_STATES.LOCKED;
  lockedGesture = currentGesture;

  console.log(`Locking gesture: ${lockedGesture}`);

  // Capture snapshot at lock-in moment
  const snapshot = captureSnapshot();

  socket.emit('submit_move', {
    matchId: matchId,
    move: lockedGesture,
    snapshot: snapshot
  });

  updateGestureDisplay(lockedGesture, currentConfidence);
}

socket.on('round_result', (data) => {
  console.log('Round result!', data);
  gameState = GAME_STATES.RESULT;

  // Clear countdown
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownOverlay.classList.add('hidden');

  // Update player stats if provided
  if (data.yourStats) {
    playerStats = data.yourStats;
    updatePlayerStats();
  }

  if (data.yourRank) {
    playerRank = data.yourRank;
  }

  // Set result title
  if (data.winner === 'you') {
    resultTitle.textContent = 'YOU WIN!';
    resultTitle.className = 'result-title win';
  } else if (data.winner === 'opponent') {
    resultTitle.textContent = 'YOU LOSE';
    resultTitle.className = 'result-title lose';
  } else {
    resultTitle.textContent = 'DRAW';
    resultTitle.className = 'result-title draw';
  }

  // Show outcome message
  outcomeMessage.textContent = data.outcome || '';

  // Build player cards
  const isP1 = playerRole === 'p1';
  const myData = isP1 ? data.p1 : data.p2;
  const opData = isP1 ? data.p2 : data.p1;
  const myWon = data.winner === 'you';
  const opWon = data.winner === 'opponent';
  const isDraw = data.winner === 'draw';

  resultPlayers.innerHTML = `
    <div class="player-card ${myWon ? 'winner' : isDraw ? 'draw-card' : 'loser'}">
      <div class="player-card-name">${myData.name} (YOU)</div>
      <div class="player-card-snapshot">
        ${myData.snapshot
          ? `<img src="${myData.snapshot}" alt="Your snapshot">`
          : '<span class="snapshot-placeholder">\u{1F464}</span>'}
      </div>
      <div class="player-card-move">${GESTURE_EMOJIS[myData.move]}</div>
    </div>
    <div class="player-card ${opWon ? 'winner' : isDraw ? 'draw-card' : 'loser'}">
      <div class="player-card-name">${opData.name}</div>
      <div class="player-card-snapshot">
        ${opData.snapshot
          ? `<img src="${opData.snapshot}" alt="Opponent snapshot">`
          : '<span class="snapshot-placeholder">\u{1F464}</span>'}
      </div>
      <div class="player-card-move">${GESTURE_EMOJIS[opData.move]}</div>
    </div>
  `;

  // Show scores
  const myScore = isP1 ? data.scores.p1 : data.scores.p2;
  const opScore = isP1 ? data.scores.p2 : data.scores.p1;
  resultScores.textContent = `Match Score: ${myScore} - ${opScore}`;

  resultOverlay.classList.remove('hidden');
  gestureDisplay.classList.remove('gesture-locked');
});

playAgainBtn.addEventListener('click', () => {
  console.log('Requesting play again...');
  socket.emit('play_again', { matchId: matchId });
  resultOverlay.classList.add('hidden');
  gameState = GAME_STATES.MATCHED;
});

leaveMatchBtn.addEventListener('click', () => {
  console.log('Leaving match...');
  socket.emit('leave_match');
  resultOverlay.classList.add('hidden');
  resetToLobby();
});

socket.on('opponent_left', () => {
  console.log('Opponent left - auto-requeuing...');

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  countdownOverlay.classList.add('hidden');
  resultOverlay.classList.add('hidden');

  // Auto-requeue: set state and UI to searching
  gameState = GAME_STATES.QUEUED;
  matchId = null;
  playerRole = null;
  lockedGesture = null;
  currentOpponentName = null;

  matchStatusEl.textContent = 'Opponent left - finding new match...';
  opponentNameEl.textContent = '';
  joinQueueBtn.disabled = true;
  joinQueueBtn.textContent = 'Searching...';
  cancelQueueBtn.style.display = 'inline-block';
  gestureDisplay.classList.remove('gesture-locked');
});

socket.on('opponent_disconnected', () => {
  console.log('Opponent disconnected!');

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  countdownOverlay.classList.add('hidden');
  resultOverlay.classList.add('hidden');
  disconnectOverlay.classList.remove('hidden');
});

returnToLobbyBtn.addEventListener('click', () => {
  disconnectOverlay.classList.add('hidden');
  resetToLobby();
});

function resetToLobby() {
  gameState = GAME_STATES.IDLE;
  matchId = null;
  playerRole = null;
  lockedGesture = null;
  currentOpponentName = null;

  matchStatusEl.textContent = 'Ready to Play';
  opponentNameEl.textContent = '';
  joinQueueBtn.textContent = 'Join Queue';
  joinQueueBtn.disabled = false;
  cancelQueueBtn.style.display = 'none';
  gestureDisplay.classList.remove('gesture-locked');
}

// ============================================
// Leaderboard
// ============================================

leaderboardToggle.addEventListener('click', () => {
  leaderboardSidebar.classList.toggle('open');
  leaderboardToggle.classList.toggle('open');
});

function updateLeaderboard(leaderboard, yourRank = null) {
  if (!leaderboard || leaderboard.length === 0) {
    leaderboardList.innerHTML = '<div class="leaderboard-empty">NO CHALLENGERS YET</div>';
    yourRankDisplay.style.display = 'none';
    return;
  }

  let html = '';
  let foundSelf = false;

  for (const entry of leaderboard) {
    const isYou = entry.name === playerName;
    if (isYou) foundSelf = true;

    let rankClass = '';
    if (entry.rank === 1) rankClass = 'gold';
    else if (entry.rank === 2) rankClass = 'silver';
    else if (entry.rank === 3) rankClass = 'bronze';

    html += `
      <div class="leaderboard-entry ${isYou ? 'you' : ''}">
        <span class="leaderboard-rank ${rankClass}">#${entry.rank}</span>
        <span class="leaderboard-name">${entry.name}</span>
        <span class="leaderboard-stats">W:${entry.wins} L:${entry.losses}</span>
      </div>
    `;
  }

  leaderboardList.innerHTML = html;

  // Show "YOUR RANK" if not in top 10
  if (yourRank && !foundSelf && yourRank > 10) {
    yourRankDisplay.style.display = 'block';
    yourRankNumber.textContent = `#${yourRank}`;
  } else {
    yourRankDisplay.style.display = 'none';
  }
}

socket.on('leaderboard_update', (data) => {
  updateLeaderboard(data.leaderboard, data.yourRank || playerRank);
});

// Request leaderboard on connect
socket.on('connect', () => {
  socket.emit('get_leaderboard');
});

// ============================================
// Initialization
// ============================================

goToSetupStep(SETUP_STATES.NAME);
