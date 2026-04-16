# Rock Paper Scissors

Multiplayer RPS game with real-time hand gesture detection via webcam.

## Tech Stack

- **Server**: Node.js, Express, Socket.IO
- **Client**: Vanilla JS, MediaPipe Hand Landmarker
- **Real-time**: WebSocket for matchmaking and game state

## Run

**Docker:**
```bash
docker compose up --build
```

**Local:**
```bash
npm install
npm run dev
```

Open `http://localhost:8000`

## How It Works

1. Enter name, grant camera access, wait for hand model to load
2. Join queue to find opponent
3. Show rock/paper/scissors gesture during countdown
4. Gesture locks at "GO!" - winner determined server-side

## Project Structure

```
client/
  index.html    # UI + styles
  main.js       # Game logic, hand detection, socket events
server/
  index.js      # Express server, Socket.IO, matchmaking, game state
```

## Features

- Real-time hand gesture classification (rock/paper/scissors)
- Matchmaking queue with auto-requeue on opponent leave
- Live leaderboard (top 10 by wins)
- Snapshot capture of gestures at lock time
- Reconnection support