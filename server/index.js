const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const morgan = require('morgan');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server);

// Request logging
app.use(morgan('dev'));

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

const PORT = process.env.PORT || 8000;

// Matchmaking queue (in-memory array)
const matchmakingQueue = [];

// Active matches: Map<matchId, matchData>
const matches = new Map();
let matchIdCounter = 1;
let roundIdCounter = 1;

// Player storage: Map<playerName, playerData>
const players = new Map();
// Socket to player lookup: Map<socketId, playerName>
const socketToPlayer = new Map();

// Player name validation
function isValidPlayerName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 12) return false;
  // Alphanumeric + spaces only
  return /^[a-zA-Z0-9 ]+$/.test(trimmed);
}

// Get player by socket
function getPlayerBySocket(socket) {
  const playerName = socketToPlayer.get(socket.id);
  if (!playerName) return null;
  return players.get(playerName);
}

// Get leaderboard (top 10 players sorted by wins)
function getLeaderboard() {
  const playerList = Array.from(players.values());

  // Sort by wins (desc), then fewer losses (asc), then alphabetically
  playerList.sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    if (a.totalLosses !== b.totalLosses) return a.totalLosses - b.totalLosses;
    return a.name.localeCompare(b.name);
  });

  // Return top 10 with rank
  return playerList.slice(0, 10).map((player, index) => ({
    rank: index + 1,
    name: player.name,
    wins: player.totalWins,
    losses: player.totalLosses
  }));
}

// Get a specific player's rank
function getPlayerRank(playerName) {
  const playerList = Array.from(players.values());

  playerList.sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    if (a.totalLosses !== b.totalLosses) return a.totalLosses - b.totalLosses;
    return a.name.localeCompare(b.name);
  });

  const index = playerList.findIndex(p => p.name === playerName);
  return index === -1 ? null : index + 1;
}

// Game constants
const COUNTDOWN_MS = 3000;
const MOVE_TIMEOUT_MS = 2000;
const VALID_MOVES = ['rock', 'paper', 'scissors', 'none'];

// Winner calculation
function determineWinner(p1Move, p2Move) {
  if (p1Move === p2Move) return 'draw';
  if (p1Move === 'none') return 'p2';
  if (p2Move === 'none') return 'p1';
  const wins = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  return wins[p1Move] === p2Move ? 'p1' : 'p2';
}

// Start a new round for a match
function startRound(matchId) {
  const match = matches.get(matchId);
  if (!match) return;

  const roundId = roundIdCounter++;
  const startAtMs = Date.now() + 500; // Small delay to allow clients to prepare

  match.state = 'COUNTDOWN';
  match.currentRound = {
    id: roundId,
    startAtMs,
    p1Move: null,
    p2Move: null,
    timeout: null
  };

  const ts = new Date().toISOString();
  console.log(`[${ts}] Round ${roundId} starting for match ${matchId}`);

  // Emit round_start to both players
  const roundStartData = { matchId, roundId, startAtMs, countdownMs: COUNTDOWN_MS };
  match.p1.emit('round_start', roundStartData);
  match.p2.emit('round_start', roundStartData);

  // Set timeout to finalize round after countdown + grace period
  match.currentRound.timeout = setTimeout(() => {
    finalizeRound(matchId);
  }, COUNTDOWN_MS + MOVE_TIMEOUT_MS + 500); // Extra 500ms buffer
}

// Finalize round and determine winner
function finalizeRound(matchId) {
  const match = matches.get(matchId);
  if (!match || !match.currentRound) return;
  if (match.state === 'RESULT') return; // Already finalized

  const round = match.currentRound;

  // Clear timeout if still pending
  if (round.timeout) {
    clearTimeout(round.timeout);
    round.timeout = null;
  }

  // Default missing moves to 'none'
  const p1Move = round.p1Move || 'none';
  const p2Move = round.p2Move || 'none';
  const p1Snapshot = round.p1Snapshot || null;
  const p2Snapshot = round.p2Snapshot || null;

  const winner = determineWinner(p1Move, p2Move);

  // Update scores
  if (winner === 'p1') match.scores.p1++;
  else if (winner === 'p2') match.scores.p2++;

  match.state = 'RESULT';

  const ts = new Date().toISOString();
  console.log(`[${ts}] Round ${round.id} result: ${p1Move} vs ${p2Move} = ${winner}`);

  // Update player stats (totalWins/totalLosses)
  const p1Player = players.get(match.p1Name);
  const p2Player = players.get(match.p2Name);

  if (winner === 'p1' && p1Player && p2Player) {
    p1Player.totalWins++;
    p2Player.totalLosses++;
    console.log(`[${ts}] Updated stats: "${match.p1Name}" wins, "${match.p2Name}" loses`);
  } else if (winner === 'p2' && p1Player && p2Player) {
    p2Player.totalWins++;
    p1Player.totalLosses++;
    console.log(`[${ts}] Updated stats: "${match.p2Name}" wins, "${match.p1Name}" loses`);
  }

  // Generate outcome message
  const outcomeMessages = {
    rock: { scissors: 'ROCK CRUSHES SCISSORS' },
    scissors: { paper: 'SCISSORS CUTS PAPER' },
    paper: { rock: 'PAPER COVERS ROCK' }
  };
  let outcome = '';
  if (winner === 'p1' && outcomeMessages[p1Move]) {
    outcome = outcomeMessages[p1Move][p2Move] || '';
  } else if (winner === 'p2' && outcomeMessages[p2Move]) {
    outcome = outcomeMessages[p2Move][p1Move] || '';
  }

  // Emit results to both players (with snapshots and names)
  match.p1.emit('round_result', {
    matchId,
    roundId: round.id,
    winner: winner === 'p1' ? 'you' : winner === 'p2' ? 'opponent' : 'draw',
    p1: { name: match.p1Name, move: p1Move, snapshot: p1Snapshot },
    p2: { name: match.p2Name, move: p2Move, snapshot: p2Snapshot },
    scores: { p1: match.scores.p1, p2: match.scores.p2 },
    outcome,
    yourStats: p1Player ? { totalWins: p1Player.totalWins, totalLosses: p1Player.totalLosses } : null,
    yourRank: getPlayerRank(match.p1Name)
  });

  match.p2.emit('round_result', {
    matchId,
    roundId: round.id,
    winner: winner === 'p2' ? 'you' : winner === 'p1' ? 'opponent' : 'draw',
    p1: { name: match.p1Name, move: p1Move, snapshot: p1Snapshot },
    p2: { name: match.p2Name, move: p2Move, snapshot: p2Snapshot },
    scores: { p1: match.scores.p1, p2: match.scores.p2 },
    outcome,
    yourStats: p2Player ? { totalWins: p2Player.totalWins, totalLosses: p2Player.totalLosses } : null,
    yourRank: getPlayerRank(match.p2Name)
  });

  // Broadcast leaderboard update to all connected clients
  if (winner !== 'draw') {
    const leaderboard = getLeaderboard();
    io.emit('leaderboard_update', { leaderboard });
  }

  // Clear snapshots from memory
  round.p1Snapshot = null;
  round.p2Snapshot = null;
}

// Find match by socket
function findMatchBySocket(socket) {
  for (const [matchId, match] of matches) {
    if (match.p1 === socket || match.p2 === socket) {
      return { matchId, match, role: match.p1 === socket ? 'p1' : 'p2' };
    }
  }
  return null;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Client connected: ${socket.id}`);

  // Handle player registration
  socket.on('register_player', ({ name }) => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] Registration attempt: "${name}" from ${socket.id}`);

    // Validate name
    if (!isValidPlayerName(name)) {
      socket.emit('registration_result', {
        success: false,
        error: 'Invalid name. Use 2-12 alphanumeric characters.'
      });
      return;
    }

    const trimmedName = name.trim();

    // Check if this socket is already registered
    const existingPlayerName = socketToPlayer.get(socket.id);
    if (existingPlayerName) {
      console.log(`[${ts}] Socket already registered as "${existingPlayerName}"`);
      const player = players.get(existingPlayerName);
      socket.emit('registration_result', {
        success: true,
        player: {
          name: player.name,
          totalWins: player.totalWins,
          totalLosses: player.totalLosses
        },
        rank: getPlayerRank(player.name),
        leaderboard: getLeaderboard()
      });
      return;
    }

    // Check if name exists (reconnection case)
    let player = players.get(trimmedName);
    if (player) {
      // Update socket ID for reconnection
      player.currentSocketId = socket.id;
      console.log(`[${ts}] Player "${trimmedName}" reconnected`);
    } else {
      // Create new player
      player = {
        name: trimmedName,
        totalWins: 0,
        totalLosses: 0,
        currentSocketId: socket.id
      };
      players.set(trimmedName, player);
      console.log(`[${ts}] New player "${trimmedName}" registered`);
    }

    // Map socket to player
    socketToPlayer.set(socket.id, trimmedName);

    socket.emit('registration_result', {
      success: true,
      player: {
        name: player.name,
        totalWins: player.totalWins,
        totalLosses: player.totalLosses
      },
      rank: getPlayerRank(player.name),
      leaderboard: getLeaderboard()
    });
  });

  // Handle leaderboard request
  socket.on('get_leaderboard', () => {
    const playerName = socketToPlayer.get(socket.id);
    socket.emit('leaderboard_update', {
      leaderboard: getLeaderboard(),
      yourRank: playerName ? getPlayerRank(playerName) : null
    });
  });

  // Handle player joining the matchmaking queue
  socket.on('join_queue', () => {
    const ts = new Date().toISOString();

    // Check if player is registered
    const playerName = socketToPlayer.get(socket.id);
    if (!playerName) {
      console.log(`[${ts}] Unregistered player ${socket.id} tried to join queue`);
      socket.emit('queue_error', { error: 'Must register before joining queue' });
      return;
    }

    console.log(`[${ts}] Player "${playerName}" (${socket.id}) joined queue`);

    // Check if player is already in queue
    if (matchmakingQueue.includes(socket)) {
      console.log(`[${ts}] Player "${playerName}" already in queue`);
      return;
    }

    matchmakingQueue.push(socket);
    console.log(`[${ts}] Queue size: ${matchmakingQueue.length}`);

    // If we have 2 players, match them
    if (matchmakingQueue.length >= 2) {
      const p1Socket = matchmakingQueue.shift();
      const p2Socket = matchmakingQueue.shift();
      const matchId = matchIdCounter++;

      const p1Name = socketToPlayer.get(p1Socket.id);
      const p2Name = socketToPlayer.get(p2Socket.id);

      // Store the match with full state including player names
      matches.set(matchId, {
        p1: p1Socket,
        p2: p2Socket,
        p1Name,
        p2Name,
        state: 'MATCHED',
        currentRound: null,
        scores: { p1: 0, p2: 0 }
      });

      const matchTs = new Date().toISOString();
      console.log(`[${matchTs}] Match ${matchId} created: "${p1Name}" vs "${p2Name}"`);

      // Notify both players with opponent names
      p1Socket.emit('matched', { matchId, you: 'p1', opponentName: p2Name });
      p2Socket.emit('matched', { matchId, you: 'p2', opponentName: p1Name });

      // Auto-start first round after a short delay
      setTimeout(() => startRound(matchId), 1000);
    }
  });

  // Handle move submission (with optional snapshot)
  socket.on('submit_move', ({ matchId, move, snapshot }) => {
    const ts = new Date().toISOString();
    const match = matches.get(matchId);

    if (!match || !match.currentRound) {
      console.log(`[${ts}] Invalid submit_move: no active round for match ${matchId}`);
      return;
    }

    if (!VALID_MOVES.includes(move)) {
      console.log(`[${ts}] Invalid move: ${move}`);
      return;
    }

    const role = match.p1 === socket ? 'p1' : match.p2 === socket ? 'p2' : null;
    if (!role) {
      console.log(`[${ts}] Socket not part of match ${matchId}`);
      return;
    }

    // Store the move and snapshot
    const moveKey = role === 'p1' ? 'p1Move' : 'p2Move';
    const snapshotKey = role === 'p1' ? 'p1Snapshot' : 'p2Snapshot';
    if (match.currentRound[moveKey] === null) {
      match.currentRound[moveKey] = move;
      match.currentRound[snapshotKey] = snapshot || null;
      console.log(`[${ts}] ${role} submitted move: ${move} for match ${matchId}${snapshot ? ' (with snapshot)' : ''}`);

      // Check if both moves are in
      if (match.currentRound.p1Move !== null && match.currentRound.p2Move !== null) {
        finalizeRound(matchId);
      }
    }
  });

  // Handle play again request
  socket.on('play_again', ({ matchId }) => {
    const ts = new Date().toISOString();
    const match = matches.get(matchId);

    if (!match) {
      console.log(`[${ts}] Invalid play_again: match ${matchId} not found`);
      return;
    }

    if (match.state !== 'RESULT') {
      console.log(`[${ts}] Cannot play again: match ${matchId} not in RESULT state`);
      return;
    }

    console.log(`[${ts}] Starting new round for match ${matchId}`);
    startRound(matchId);
  });

  // Handle leaving the queue
  socket.on('leave_queue', () => {
    const ts = new Date().toISOString();
    const playerName = socketToPlayer.get(socket.id);

    const queueIndex = matchmakingQueue.indexOf(socket);
    if (queueIndex !== -1) {
      matchmakingQueue.splice(queueIndex, 1);
      console.log(`[${ts}] Player "${playerName}" left queue. Queue size: ${matchmakingQueue.length}`);
      socket.emit('queue_left');
    }
  });

  // Handle leaving a match (from results screen)
  socket.on('leave_match', () => {
    const ts = new Date().toISOString();
    const playerName = socketToPlayer.get(socket.id);

    const matchInfo = findMatchBySocket(socket);
    if (!matchInfo) {
      console.log(`[${ts}] Player "${playerName}" tried to leave but not in a match`);
      socket.emit('queue_left');
      return;
    }

    const { matchId, match, role } = matchInfo;
    const opponent = role === 'p1' ? match.p2 : match.p1;
    const opponentName = role === 'p1' ? match.p2Name : match.p1Name;

    console.log(`[${ts}] Player "${playerName}" left match ${matchId}`);

    // Clear any pending timeout
    if (match.currentRound && match.currentRound.timeout) {
      clearTimeout(match.currentRound.timeout);
    }

    // Remove the match
    matches.delete(matchId);

    // Confirm to the quitting player
    socket.emit('queue_left');

    // Auto-requeue the opponent
    console.log(`[${ts}] Auto-requeuing opponent "${opponentName}"`);
    opponent.emit('opponent_left');

    // Add opponent back to queue
    if (!matchmakingQueue.includes(opponent)) {
      matchmakingQueue.push(opponent);
      console.log(`[${ts}] Queue size: ${matchmakingQueue.length}`);

      // Check if we can match immediately
      if (matchmakingQueue.length >= 2) {
        const p1Socket = matchmakingQueue.shift();
        const p2Socket = matchmakingQueue.shift();
        const newMatchId = matchIdCounter++;

        const p1Name = socketToPlayer.get(p1Socket.id);
        const p2Name = socketToPlayer.get(p2Socket.id);

        matches.set(newMatchId, {
          p1: p1Socket,
          p2: p2Socket,
          p1Name,
          p2Name,
          state: 'MATCHED',
          currentRound: null,
          scores: { p1: 0, p2: 0 }
        });

        console.log(`[${ts}] New match ${newMatchId} created: "${p1Name}" vs "${p2Name}"`);

        p1Socket.emit('matched', { matchId: newMatchId, you: 'p1', opponentName: p2Name });
        p2Socket.emit('matched', { matchId: newMatchId, you: 'p2', opponentName: p1Name });

        setTimeout(() => startRound(newMatchId), 1000);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const ts = new Date().toISOString();
    const playerName = socketToPlayer.get(socket.id);
    console.log(`[${ts}] Client disconnected: ${socket.id}${playerName ? ` ("${playerName}")` : ''}`);

    // Clean up socket to player mapping (player data persists for reconnection)
    socketToPlayer.delete(socket.id);

    // Remove from matchmaking queue if present
    const queueIndex = matchmakingQueue.indexOf(socket);
    if (queueIndex !== -1) {
      matchmakingQueue.splice(queueIndex, 1);
      console.log(`[${ts}] Removed ${socket.id} from queue. Queue size: ${matchmakingQueue.length}`);
    }

    // Check if player was in an active match
    const matchInfo = findMatchBySocket(socket);
    if (matchInfo) {
      const { matchId, match, role } = matchInfo;
      const opponent = role === 'p1' ? match.p2 : match.p1;

      // Clear any pending timeout
      if (match.currentRound && match.currentRound.timeout) {
        clearTimeout(match.currentRound.timeout);
      }

      // Notify opponent
      opponent.emit('opponent_disconnected', { matchId });
      console.log(`[${ts}] Notified opponent of disconnect in match ${matchId}`);

      // Remove the match
      matches.delete(matchId);
      console.log(`[${ts}] Match ${matchId} removed`);
    }
  });
});

server.listen(PORT, () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Server running on http://localhost:${PORT}`);
});
