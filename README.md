# Two-Player Shooting Game

A simple two-player shooting game built with Phaser 3.

## How to Play

1. Open `index.html` in a web browser
2. Player 1 (Blue):
   - Arrow keys to move (Up/Down for speed, Left/Right for steering)
   - Space to shoot
3. Player 2 (Red):
   - WASD keys to move (W/S for speed, A/D for steering)
   - Shift to shoot

## Game Rules

- Each player controls a colored ball
- Move around the screen and shoot at your opponent
- When hit, the opponent respawns and the shooter gets a point
- The score is displayed at the top of the screen

## Technical Details

This game uses:
- Phaser 3.55.2
- HTML5 Canvas
- Vanilla JavaScript

## Running Locally

### Method 1: Direct Browser Opening
Simply open `index.html` in a web browser.

### Method 2: Using the included Node.js server
1. Make sure you have Node.js installed
2. Run the following commands:

```bash
# Install dependencies (if any)
npm install

# Start the server
npm start
```

3. Open `http://localhost:3000` in your browser

### Method 3: Using other servers

```bash
# Using Python
python -m http.server

# Using Node.js http-server
npx http-server
```

Then open `http://localhost:8000` in your browser. 