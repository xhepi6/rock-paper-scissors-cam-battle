# Rock Paper Scissors Cam Battle

Multiplayer Rock Paper Scissors game with real-time hand gesture detection via webcam. Challenge opponents online — your camera reads your hand gesture and locks it in at "GO!".

## Demo

**Live at [rps.xhepi.dev](https://rps.xhepi.dev)**

## How to Play

1. **Enter your name** — pick a player name (up to 12 characters)
2. **Enable your camera** — the game uses your webcam to detect hand gestures in real-time
3. **Wait for the hand tracker to load** — a progress bar shows the MediaPipe model downloading
4. **Enter the arcade** — you'll see your live camera feed with gesture detection overlay
5. **Join the queue** — hit "Join Queue" to find an opponent
6. **Show your gesture during the countdown** — hold up rock, paper, or scissors clearly in front of the camera
7. **Gesture locks at "GO!"** — whatever your hand shows at that moment is your move, no take-backs
8. **See the results** — snapshots of both players' gestures are shown alongside the winner
9. **Play again or leave** — rematch the same opponent or return to the lobby

### Gestures

- **Rock** — closed fist
- **Paper** — open hand, all fingers extended
- **Scissors** — index and middle finger extended, rest closed

### Tips

- Make sure you have good lighting so the camera can read your hand clearly
- Hold your gesture steady during the countdown for a confident detection
- Check the confidence percentage below your gesture — higher is better
- The leaderboard tracks top 10 players by wins

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

## Features

- Real-time hand gesture classification (rock/paper/scissors)
- Matchmaking queue with auto-requeue on opponent leave
- Live leaderboard (top 10 by wins)
- Snapshot capture of gestures at lock time
- Reconnection support

## Project Structure

```
client/
  index.html    # UI + styles
  main.js       # Game logic, hand detection, socket events
server/
  index.js      # Express server, Socket.IO, matchmaking, game state
```
