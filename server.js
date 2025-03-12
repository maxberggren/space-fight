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
    bullets: [],
    planets: {} // New planets object to store player planets
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
        lastShootTime: null,
        landedOnPlanet: null // Track if player is landed on a planet
    };
    
    // Create a planet for the player
    createPlanetForPlayer(socket.id);
    
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

        // If player is landed on a planet, handle takeoff
        if (player.landedOnPlanet && input.isThrusting) {
            // Player is thrusting, so they take off from the planet
            player.landedOnPlanet = null;
            
            // Give a small boost away from the planet
            const planet = gameState.planets[socket.id];
            if (planet) {
                const dx = player.x - planet.x;
                const dy = player.y - planet.y;
                const angle = Math.atan2(dy, dx);
                player.velocity.x = Math.cos(angle) * PHYSICS.takeoffBoost;
                player.velocity.y = Math.sin(angle) * PHYSICS.takeoffBoost;
            }
        }

        // Update player state based on input (only if not landed)
        if (!player.landedOnPlanet) {
            player.isThrusting = input.isThrusting;
            player.angle = input.angle;
        }

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

        // Apply thrust if player is thrusting and not landed
        if (player.isThrusting && !player.landedOnPlanet) {
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
            
            // Update planet color to match player color
            if (gameState.planets[socket.id]) {
                gameState.planets[socket.id].color = info.color;
            }
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
        
        // Keep the planet in the game for a while after player disconnects
        // We'll set a timer to remove it after some time
        if (gameState.planets[socket.id]) {
            setTimeout(() => {
                delete gameState.planets[socket.id];
                io.emit('planetRemoved', socket.id);
            }, GAME.planetRemovalDelay || 60000); // Default 1 minute delay
        }
        
        io.emit('playerLeft', socket.id);
    });
});

// Game loop - update rate from shared config
setInterval(() => {
    updateGameState();
    
    // Create a compressed version of the game state to reduce network traffic
    const compressedState = {
        players: {},
        bullets: [],
        planets: {}
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
            lastProcessedInput: player.lastProcessedInput,
            landedOnPlanet: player.landedOnPlanet
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
    
    // Include planet data
    Object.keys(gameState.planets).forEach(id => {
        const planet = gameState.planets[id];
        compressedState.planets[id] = {
            id: planet.id,
            ownerId: planet.ownerId,
            x: planet.x,
            y: planet.y,
            radius: planet.radius,
            color: planet.color,
            segments: planet.segments
        };
    });
    
    io.emit('gameStateUpdate', compressedState);
}, 1000 / NETWORK.updateRate);

function updateGameState() {
    // Update player positions
    Object.values(gameState.players).forEach(player => {
        // Skip update if player is landed on a planet
        if (player.landedOnPlanet) return;
        
        // Apply drag
        player.velocity.x *= PHYSICS.drag;
        player.velocity.y *= PHYSICS.drag;
        
        // Apply gravity from all planets
        applyPlanetaryGravity(player);

        // Update position
        player.x += player.velocity.x;
        player.y += player.velocity.y;

        // Wrap around world edges
        if (player.x > WORLD.size/2) player.x = -WORLD.size/2;
        if (player.x < -WORLD.size/2) player.x = WORLD.size/2;
        if (player.y > WORLD.size/2) player.y = -WORLD.size/2;
        if (player.y < -WORLD.size/2) player.y = WORLD.size/2;
        
        // Check for planet collisions
        checkPlanetCollisions(player);
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
        // Apply gravity to bullets too
        applyPlanetaryGravityToBullet(bullet);
        
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
        
        // Check for collisions with planets
        Object.values(gameState.planets).forEach(planet => {
            const dx = planet.x - bullet.x;
            const dy = planet.y - bullet.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < planet.radius) {
                // Bullet hit planet
                console.log(`Bullet hit planet owned by ${planet.ownerId.substring(0,4)}`);
                
                // Calculate impact angle
                const impactAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                
                // Damage the planet (remove a segment)
                damagePlanet(planet, impactAngle);
                
                // Emit planet hit event to all clients
                io.emit('planetHit', {
                    planetId: planet.id,
                    bulletOwnerId: bullet.ownerId,
                    x: bullet.x,
                    y: bullet.y,
                    impactAngle: impactAngle
                });
                
                bulletsToRemove.push(index);
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
    player.landedOnPlanet = null;
    
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

// Create a planet for a player
function createPlanetForPlayer(playerId) {
    // Get player data
    const player = gameState.players[playerId];
    if (!player) return;
    
    // Create planet at a random position away from the player
    const angle = Math.random() * Math.PI * 2;
    const distance = 800 + Math.random() * 400; // Place planet 800-1200 units away
    
    const planet = {
        id: playerId, // Use player ID as planet ID for easy reference
        ownerId: playerId,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        radius: 100 + Math.random() * 50, // Random radius between 100-150
        color: player.color,
        segments: [] // Will store segments that are damaged
    };
    
    // Initialize planet with full health (no damaged segments)
    gameState.planets[playerId] = planet;
    
    console.log(`Created planet for player ${playerId} at (${planet.x.toFixed(2)}, ${planet.y.toFixed(2)}), radius: ${planet.radius.toFixed(2)}`);
    
    // Notify all clients about the new planet
    io.emit('planetCreated', planet);
    
    return planet;
}

// Apply gravity from planets to a player
function applyPlanetaryGravity(player) {
    Object.values(gameState.planets).forEach(planet => {
        const dx = planet.x - player.x;
        const dy = planet.y - player.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Skip if too far away (optimization)
        if (distance > planet.radius * 10) return;
        
        // Calculate gravitational force (F = G * m1 * m2 / r^2)
        // We'll simplify by using radius as mass and a constant for G
        const force = PHYSICS.gravitationalConstant * planet.radius / distanceSquared;
        
        // Apply force in direction of planet
        const angle = Math.atan2(dy, dx);
        player.velocity.x += Math.cos(angle) * force;
        player.velocity.y += Math.sin(angle) * force;
    });
}

// Apply gravity to bullets too
function applyPlanetaryGravityToBullet(bullet) {
    Object.values(gameState.planets).forEach(planet => {
        const dx = planet.x - bullet.x;
        const dy = planet.y - bullet.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Skip if too far away (optimization)
        if (distance > planet.radius * 5) return;
        
        // Calculate gravitational force (simplified)
        const force = PHYSICS.gravitationalConstant * planet.radius / distanceSquared * 0.3; // Reduced effect on bullets
        
        // Apply force in direction of planet
        const angle = Math.atan2(dy, dx);
        bullet.velocityX += Math.cos(angle) * force;
        bullet.velocityY += Math.sin(angle) * force;
    });
}

// Check for collisions between players and planets
function checkPlanetCollisions(player) {
    // Skip if player is already landed
    if (player.landedOnPlanet) return;
    
    Object.values(gameState.planets).forEach(planet => {
        const dx = planet.x - player.x;
        const dy = planet.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if player is colliding with planet
        if (distance < planet.radius + 10) { // 10 is ship radius
            // Calculate impact velocity (speed towards the planet)
            const impactAngle = Math.atan2(dy, dx);
            const velocityTowardsPlanet = 
                player.velocity.x * Math.cos(impactAngle) + 
                player.velocity.y * Math.sin(impactAngle);
            
            const impactSpeed = Math.abs(velocityTowardsPlanet);
            
            console.log(`Player ${player.id} collided with planet at speed ${impactSpeed.toFixed(2)}`);
            
            // If impact speed is too high, player dies
            if (impactSpeed > PHYSICS.maxLandingSpeed) {
                console.log(`Impact speed too high (${impactSpeed.toFixed(2)} > ${PHYSICS.maxLandingSpeed})! Player ${player.id} crashed!`);
                
                // Emit crash event
                io.emit('playerCrashed', {
                    playerId: player.id,
                    planetId: planet.id,
                    x: player.x,
                    y: player.y,
                    impactSpeed: impactSpeed
                });
                
                respawnPlayer(player);
            } else {
                // Safe landing - position player on planet surface and stop movement
                console.log(`Player ${player.id} safely landed on planet ${planet.id}`);
                
                // Calculate position on planet surface
                const surfaceAngle = Math.atan2(dy, dx);
                player.x = planet.x - Math.cos(surfaceAngle) * (planet.radius + 5);
                player.y = planet.y - Math.sin(surfaceAngle) * (planet.radius + 5);
                
                // Set player angle to be tangent to planet surface
                player.angle = (surfaceAngle * (180 / Math.PI) + 90) % 360;
                
                // Stop player movement
                player.velocity = { x: 0, y: 0 };
                
                // Mark player as landed
                player.landedOnPlanet = planet.id;
                
                // Emit landing event
                io.emit('playerLanded', {
                    playerId: player.id,
                    planetId: planet.id,
                    x: player.x,
                    y: player.y,
                    angle: player.angle
                });
            }
        }
    });
}

// Damage a planet when hit by a bullet
function damagePlanet(planet, impactAngle) {
    // Normalize angle to 0-360 range
    const normalizedAngle = ((impactAngle % 360) + 360) % 360;
    
    // Add damaged segment if it doesn't already exist
    // Each segment covers a 10-degree arc
    const segmentSize = 10;
    const segmentIndex = Math.floor(normalizedAngle / segmentSize);
    
    // Check if this segment is already damaged
    if (!planet.segments.includes(segmentIndex)) {
        planet.segments.push(segmentIndex);
        console.log(`Planet ${planet.id} damaged at angle ${normalizedAngle.toFixed(2)}° (segment ${segmentIndex})`);
        
        // If too many segments are damaged, planet is destroyed
        if (planet.segments.length > 36 - 5) { // 36 segments total (360/10), leave at least 5 intact
            console.log(`Planet ${planet.id} has been severely damaged!`);
            
            // Emit planet severely damaged event
            io.emit('planetSeverelyDamaged', {
                planetId: planet.id,
                ownerId: planet.ownerId
            });
        }
    }
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