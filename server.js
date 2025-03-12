const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Import shared configuration
const { PHYSICS, WORLD, GAME, NETWORK } = require('./shared-config');

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Game state
const gameState = {
    players: {},
    bullets: []
};

// Handle socket connections
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create new player
    const spawnPoint = getRandomSpawnPoint();
    gameState.players[socket.id] = {
        id: socket.id,
        x: spawnPoint.x,
        y: spawnPoint.y,
        angle: spawnPoint.angle,
        velocity: { x: 0, y: 0 },
        isThrusting: false,
        health: 100,
        name: "Player", // Default player name
        color: 0x0000ff, // Default player color (blue)
        invulnerable: true,
        lastProcessedInput: 0,
        lastShootTime: null
    };
    
    // Set a timer to remove initial invulnerability
    setTimeout(() => {
        if (gameState.players[socket.id]) {
            gameState.players[socket.id].invulnerable = false;
            console.log(`Initial invulnerability removed for player ${socket.id}`);
        }
    }, GAME.respawnInvulnerabilityTime);

    // Send initial game state to new player
    socket.emit('gameState', gameState);

    // Broadcast new player to all other players
    socket.broadcast.emit('playerJoined', gameState.players[socket.id]);

    // Handle player input
    socket.on('playerInput', (input) => {
        const player = gameState.players[socket.id];
        if (!player) return;

        // Store the input sequence number for client-side prediction
        if (input.sequenceNumber) {
            player.lastProcessedInput = input.sequenceNumber;
        }

        // Update player state based on input
        player.isThrusting = input.isThrusting;
        player.angle = input.angle;

        // Handle shooting with cooldown
        const now = Date.now();
        if (input.isShooting) {
            console.log(`Shooting attempt from player ${player.id}, lastShootTime: ${player.lastShootTime}, cooldown: ${GAME.shootCooldown}ms`);
            
            // Allow shooting regardless of invulnerability
            if (!player.lastShootTime || now - player.lastShootTime > GAME.shootCooldown) {
                const bullet = createBullet(player);
                player.lastShootTime = now;
                console.log(`Bullet created at (${bullet.x.toFixed(2)}, ${bullet.y.toFixed(2)}), velocity: (${bullet.velocityX.toFixed(2)}, ${bullet.velocityY.toFixed(2)})`);
            }
        }

        // Apply thrust if player is thrusting
        if (player.isThrusting) {
            const angleRad = player.angle * (Math.PI / 180);
            player.velocity.x += Math.cos(angleRad) * PHYSICS.thrustPower;
            player.velocity.y += Math.sin(angleRad) * PHYSICS.thrustPower;

            // Limit speed
            const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
            if (speed > PHYSICS.maxSpeed) {
                const scale = PHYSICS.maxSpeed / speed;
                player.velocity.x *= scale;
                player.velocity.y *= scale;
            }
        }
    });

    // Handle player info updates (name and color)
    socket.on('updatePlayerInfo', (info) => {
        const player = gameState.players[socket.id];
        if (!player) return;
        
        // Update player info
        if (info.name) {
            player.name = info.name.substring(0, 20); // Limit name length
        }
        
        if (info.color) {
            player.color = info.color;
        }
        
        console.log(`Player ${socket.id} updated info: name=${player.name}, color=${player.color}`);
        
        // Broadcast player info update to all clients
        io.emit('playerInfoUpdate', {
            id: socket.id,
            name: player.name,
            color: player.color
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete gameState.players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// Game loop - update rate from shared config
setInterval(() => {
    updateGameState();
    
    // Create a compressed version of the game state to reduce network traffic
    const compressedState = {
        players: {},
        bullets: []
    };
    
    // Only send necessary player data
    Object.keys(gameState.players).forEach(id => {
        const player = gameState.players[id];
        compressedState.players[id] = {
            id: player.id,
            x: player.x,
            y: player.y,
            angle: player.angle,
            name: player.name,
            color: player.color,
            invulnerable: player.invulnerable,
            lastProcessedInput: player.lastProcessedInput
        };
    });
    
    // Include all bullet data
    gameState.bullets.forEach(bullet => {
        compressedState.bullets.push({
            x: bullet.x,
            y: bullet.y,
            velocityX: bullet.velocityX,
            velocityY: bullet.velocityY,
            ownerId: bullet.ownerId,
            createdAt: bullet.createdAt
        });
    });
    
    io.emit('gameStateUpdate', compressedState);
}, 1000 / NETWORK.updateRate);

function updateGameState() {
    // Update player positions
    Object.values(gameState.players).forEach(player => {
        // Apply drag
        player.velocity.x *= PHYSICS.drag;
        player.velocity.y *= PHYSICS.drag;

        // Update position
        player.x += player.velocity.x;
        player.y += player.velocity.y;

        // Wrap around world edges
        if (player.x > WORLD.size/2) player.x = -WORLD.size/2;
        if (player.x < -WORLD.size/2) player.x = WORLD.size/2;
        if (player.y > WORLD.size/2) player.y = -WORLD.size/2;
        if (player.y < -WORLD.size/2) player.y = WORLD.size/2;
    });

    // Update bullets
    updateBullets();
}

function createBullet(player) {
    const angleRad = player.angle * (Math.PI / 180);
    
    // Calculate bullet spawn position at the tip of the ship
    const tipDistance = 20; // Distance from ship center to tip
    const bulletX = player.x + Math.cos(angleRad) * tipDistance;
    const bulletY = player.y + Math.sin(angleRad) * tipDistance;
    
    // Create the bullet with proper velocity
    const bullet = {
        x: bulletX,
        y: bulletY,
        velocityX: Math.cos(angleRad) * GAME.bulletSpeed + player.velocity.x * 0.5,
        velocityY: Math.sin(angleRad) * GAME.bulletSpeed + player.velocity.y * 0.5,
        ownerId: player.id,
        createdAt: Date.now()
    };
    
    gameState.bullets.push(bullet);
    
    // Log for debugging
    console.log(`Player ${player.id} fired a bullet at position (${bulletX.toFixed(2)}, ${bulletY.toFixed(2)})`);
    
    return bullet;
}

function updateBullets() {
    const now = Date.now();
    const bulletsToRemove = [];

    // First update all bullet positions
    gameState.bullets.forEach((bullet, index) => {
        // Update bullet position
        bullet.x += bullet.velocityX;
        bullet.y += bullet.velocityY;

        // Check for collisions with players
        Object.values(gameState.players).forEach(player => {
            if (player.id !== bullet.ownerId) {
                const dx = player.x - bullet.x;
                const dy = player.y - bullet.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < GAME.hitRadius) { // Hit radius from shared config
                    if (player.invulnerable) {
                        console.log(`HIT DETECTED but player ${player.id.substring(0,4)} is invulnerable!`);
                    } else {
                        // Player hit
                        const shooter = gameState.players[bullet.ownerId];
                        if (shooter) {
                            console.log(`HIT CONFIRMED! Player ${shooter.id.substring(0,4)} hit ${player.id.substring(0,4)}!`);
                            
                            // Emit hit event to all clients
                            io.emit('playerHit', {
                                playerId: player.id,
                                shooterId: shooter.id,
                                x: player.x,
                                y: player.y
                            });
                        }
                        respawnPlayer(player);
                        bulletsToRemove.push(index);
                    }
                }
            }
        });

        // Remove bullets after lifetime from shared config
        if (now - bullet.createdAt >= GAME.bulletLifetime) {
            bulletsToRemove.push(index);
        }
    });

    // Remove bullets in reverse order to avoid index shifting issues
    bulletsToRemove.sort((a, b) => b - a).forEach(index => {
        gameState.bullets.splice(index, 1);
    });
}

function respawnPlayer(player) {
    const spawnPoint = getRandomSpawnPoint();
    player.x = spawnPoint.x;
    player.y = spawnPoint.y;
    player.angle = spawnPoint.angle;
    player.velocity = { x: 0, y: 0 };
    player.invulnerable = true;
    
    console.log(`Player ${player.id} was hit and respawned at (${player.x.toFixed(2)}, ${player.y.toFixed(2)})`);
    console.log(`Player ${player.id} is now invulnerable for ${GAME.respawnInvulnerabilityTime}ms`);
    
    // Clear any existing invulnerability timer
    if (player.invulnerabilityTimer) {
        clearTimeout(player.invulnerabilityTimer);
    }
    
    // Remove invulnerability after time from shared config
    player.invulnerabilityTimer = setTimeout(() => {
        if (gameState.players[player.id]) {
            gameState.players[player.id].invulnerable = false;
            console.log(`Player ${player.id} is no longer invulnerable`);
        }
    }, GAME.respawnInvulnerabilityTime);
}

function getRandomSpawnPoint() {
    const distance = 300 + Math.random() * 200;
    const angle = Math.random() * Math.PI * 2;
    
    return {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        angle: angle * (180 / Math.PI)
    };
}

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access from other devices at http://${getLocalIpAddress()}:${PORT}`);
});

// Add this function to get your local IP address to display in the console
function getLocalIpAddress() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (loopback) addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost'; // Fallback
} 