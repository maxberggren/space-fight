// Game configuration
const config = {
    type: Phaser.AUTO,
    // Use window dimensions for full viewport width and height
    width: window.innerWidth,
    height: window.innerHeight,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            gravity: { x: 0, y: 0 }
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    // Enable camera bounds to be much larger than the visible area
    backgroundColor: '#000000',
    // Use EXPAND mode to fill the screen while maintaining aspect ratio
    scale: {
        mode: Phaser.Scale.EXPAND,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

// Debug flag - set to true to enable debug features
const DEBUG_MODE = true;

// Initialize the game
const game = new Phaser.Game(config);

// Handle window resizing
window.addEventListener('resize', function() {
    // Update the game size while maintaining aspect ratio
    game.scale.resize(window.innerWidth, window.innerHeight);
});

// Load shared configuration
let PHYSICS, WORLD, GAME, NETWORK;

// Fetch the shared configuration
fetch('/shared-config.js')
    .then(response => response.text())
    .then(text => {
        // Extract the configuration objects from the text
        const configText = text.replace('// shared-config.js', '');
        
        // Create a function to evaluate the configuration
        const configFunc = new Function(`
            ${configText}
            return { PHYSICS, WORLD, GAME, NETWORK };
        `);
        
        // Get the configuration objects
        const config = configFunc();
        PHYSICS = config.PHYSICS;
        WORLD = config.WORLD;
        GAME = config.GAME;
        NETWORK = config.NETWORK;
        
        console.log('Shared configuration loaded:', config);
    })
    .catch(error => {
        console.error('Error loading shared configuration:', error);
        // Fallback values if loading fails
        PHYSICS = {
            thrustPower: 0.01,
            maxSpeed: 1,
            drag: 0.9
        };
        WORLD = {
            size: 10000,
            maxPlayerDistance: 1200
        };
        GAME = {
            bulletSpeed: 0.6,
            bulletLifetime: 2000,
            respawnInvulnerabilityTime: 3000,
            hitRadius: 20
        };
        NETWORK = {
            updateRate: 30
        };
    });

// Game variables
let socket;
let myPlayer;
let otherPlayers = {};
let bullets;
let cursors;
let shootKey;
let shootSound;
let explosionSound;
let respawnSound;
let debugText;
let scoreTexts = {};
let sequenceNumber = 0; // Add sequence number for input prediction
let pendingInputs = []; // Store inputs that haven't been processed by server

// Camera variables
let mainCamera;
let targetZoom = 1;
let currentZoom = 1;
let zoomSpeed = 0.05;
let minZoom = 0.5;
let maxZoom = 2;
let cameraMargin = 150; // Increased margin to keep around players

// Preload game assets
function preload() {
    // Load only the explosion spritesheet and sounds
    this.load.spritesheet('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/explosion.png', { frameWidth: 64, frameHeight: 64, endFrame: 23 });
    
    // Load sound effects
    this.load.audio('shoot', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/blaster.mp3');
    this.load.audio('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/explosion.mp3');
    this.load.audio('respawn', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/alien_death1.wav');
}

// Create game objects
function create() {
    // Set up the world bounds to be much larger than the visible area
    // Use WORLD.size if available, otherwise use fallback
    const worldSize = WORLD ? WORLD.size : 10000;
    this.physics.world.setBounds(-worldSize/2, -worldSize/2, worldSize, worldSize);
    
    // Set up the main camera
    mainCamera = this.cameras.main;
    mainCamera.setBackgroundColor('#000000');
    
    // Create a grid background to visualize the infinite world
    createGridBackground(this);
    
    // Create bullet graphics
    const bulletGraphics = this.add.graphics();
    bulletGraphics.fillStyle(0xffff00, 1);
    bulletGraphics.lineStyle(2, 0xffffff, 1);
    bulletGraphics.beginPath();
    bulletGraphics.arc(0, 0, 4, 0, Math.PI * 2);
    bulletGraphics.closePath();
    bulletGraphics.fillPath();
    bulletGraphics.strokePath();
    bulletGraphics.generateTexture('bullet_yellow', 10, 10);
    
    // Create shield graphics
    bulletGraphics.clear();
    bulletGraphics.lineStyle(2, 0x00ffff, 0.5);
    bulletGraphics.beginPath();
    bulletGraphics.arc(0, 0, 20, 0, Math.PI * 2);
    bulletGraphics.closePath();
    bulletGraphics.strokePath();
    bulletGraphics.generateTexture('shield', 40, 40);
    
    // Destroy the graphics object as we no longer need it
    bulletGraphics.destroy();

    // Initialize socket connection
    socket = io();
    
    // Set up socket event handlers
    setupSocketHandlers(this);

    // Set up input controls
    cursors = this.input.keyboard.createCursorKeys();
    shootKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    
    // Create bullet group
    bullets = this.physics.add.group({
        defaultKey: 'bullet_yellow',
        maxSize: 30
    });
    
    // Load sound effects
    shootSound = this.sound.add('shoot');
    explosionSound = this.sound.add('explosion');
    respawnSound = this.sound.add('respawn');

    // Create explosion animation
    this.anims.create({
        key: 'explode',
        frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 23 }),
        frameRate: 20,
        hideOnComplete: true
    });
    
    // Create debug text
    if (DEBUG_MODE) {
        debugText = this.add.text(20, this.cameras.main.height - 40, 'Debug: Game started', {
            fontSize: '16px',
            fill: '#00FF00',
            stroke: '#000000',
            strokeThickness: 1
        });
        debugText.setScrollFactor(0);
    }
}

function setupSocketHandlers(scene) {
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('gameState', (state) => {
        // Handle initial game state
        Object.keys(state.players).forEach(playerId => {
            const playerData = state.players[playerId];
            if (playerId === socket.id) {
                // Create our player
                myPlayer = createPlayerTriangle(scene, playerData.x, playerData.y, 0x0000ff, playerData.angle);
                myPlayer.id = playerId;
                // Set initial invulnerability state
                updatePlayerInvulnerability(myPlayer, playerData.invulnerable);
            } else {
                // Create other players
                const otherPlayer = createPlayerTriangle(scene, playerData.x, playerData.y, 0xff0000, playerData.angle);
                otherPlayer.id = playerId;
                otherPlayers[playerId] = otherPlayer;
                // Set initial invulnerability state
                updatePlayerInvulnerability(otherPlayer, playerData.invulnerable);
                createScoreText(scene, playerId);
            }
        });
    });

    socket.on('playerJoined', (playerData) => {
        if (playerData.id !== socket.id) {
            const newPlayer = createPlayerTriangle(scene, playerData.x, playerData.y, 0xff0000, playerData.angle);
            newPlayer.id = playerData.id;
            otherPlayers[playerData.id] = newPlayer;
            createScoreText(scene, playerData.id);
        }
    });

    socket.on('playerLeft', (playerId) => {
        if (otherPlayers[playerId]) {
            otherPlayers[playerId].destroy();
            delete otherPlayers[playerId];
            if (scoreTexts[playerId]) {
                scoreTexts[playerId].destroy();
                delete scoreTexts[playerId];
            }
        }
    });

    socket.on('gameStateUpdate', (state) => {
        // Update all players
        Object.keys(state.players).forEach(playerId => {
            const playerData = state.players[playerId];
            
            if (playerId === socket.id && myPlayer) {
                // Update score
                updateScoreText(playerId, playerData.score);
                
                // Update invulnerability state with visual effect
                updatePlayerInvulnerability(myPlayer, playerData.invulnerable);
                
                // Server reconciliation
                if (playerData.lastProcessedInput) {
                    // Remove older inputs that have been processed
                    pendingInputs = pendingInputs.filter(input => 
                        input.sequenceNumber > playerData.lastProcessedInput
                    );
                    
                    // Reset position to server position
                    myPlayer.x = playerData.x;
                    myPlayer.y = playerData.y;
                    myPlayer.body.velocity.x = 0;
                    myPlayer.body.velocity.y = 0;
                    
                    // Re-apply all pending inputs
                    pendingInputs.forEach(input => {
                        applyInput(myPlayer, input);
                    });
                } else {
                    // Smooth position correction if needed (for older server versions)
                    const distance = Phaser.Math.Distance.Between(myPlayer.x, myPlayer.y, playerData.x, playerData.y);
                    if (distance > 100) {
                        myPlayer.x = playerData.x;
                        myPlayer.y = playerData.y;
                    }
                }
            } else if (otherPlayers[playerId]) {
                // Update other players with interpolation for smoother movement
                const otherPlayer = otherPlayers[playerId];
                
                // Store current position for interpolation
                otherPlayer.oldX = otherPlayer.x;
                otherPlayer.oldY = otherPlayer.y;
                otherPlayer.oldAngle = otherPlayer.angle;
                
                // Set target position from server
                otherPlayer.targetX = playerData.x;
                otherPlayer.targetY = playerData.y;
                otherPlayer.targetAngle = playerData.angle;
                
                // Reset interpolation timer
                otherPlayer.interpTime = 0;
                
                // Update invulnerability state with visual effect
                updatePlayerInvulnerability(otherPlayer, playerData.invulnerable);
                updateScoreText(playerId, playerData.score);
            }
        });

        // Update bullets
        updateBulletsFromState(scene, state.bullets);
    });
}

// Function to update player invulnerability with visual feedback
function updatePlayerInvulnerability(player, isInvulnerable) {
    // Store previous state to detect changes
    const wasInvulnerable = player.getData('isInvulnerable');
    
    // Update the data
    player.setData('isInvulnerable', isInvulnerable);
    
    // Visual feedback for invulnerability
    if (isInvulnerable) {
        // Add shield effect if not already present
        if (!player.shield) {
            player.shield = player.scene.add.sprite(player.x, player.y, 'shield');
            player.shield.setAlpha(0.7);
            console.log(`Shield added to player ${player.id}`);
        }
    } else {
        // Remove shield effect if present
        if (player.shield) {
            player.shield.destroy();
            player.shield = null;
            console.log(`Shield removed from player ${player.id}`);
        }
    }
    
    // Log state change
    if (wasInvulnerable !== isInvulnerable) {
        console.log(`Player ${player.id} invulnerability changed: ${isInvulnerable}`);
    }
}

// Create a grid background to help visualize the infinite world
function createGridBackground(scene) {
    const gridSize = 100;
    const gridColor = 0x222222;
    const gridAlpha = 0.3;
    
    // Create a graphics object for the grid
    const gridGraphics = scene.add.graphics();
    gridGraphics.lineStyle(1, gridColor, gridAlpha);
    
    // Draw a large grid centered at 0,0
    const gridExtent = 5000; // How far the grid extends in each direction
    
    // Draw horizontal lines
    for (let y = -gridExtent; y <= gridExtent; y += gridSize) {
        gridGraphics.moveTo(-gridExtent, y);
        gridGraphics.lineTo(gridExtent, y);
    }
    
    // Draw vertical lines
    for (let x = -gridExtent; x <= gridExtent; x += gridSize) {
        gridGraphics.moveTo(x, -gridExtent);
        gridGraphics.lineTo(x, gridExtent);
    }
    
    // Draw coordinate axes with different color
    gridGraphics.lineStyle(2, 0x444444, 0.8);
    
    // X-axis
    gridGraphics.moveTo(-gridExtent, 0);
    gridGraphics.lineTo(gridExtent, 0);
    
    // Y-axis
    gridGraphics.moveTo(0, -gridExtent);
    gridGraphics.lineTo(0, gridExtent);
    
    // Draw the grid
    gridGraphics.strokePath();
}

// Update game state
function update(time, delta) {
    if (!myPlayer || !socket || !PHYSICS) return;

    // Handle player input
    const input = {
        isThrusting: false,
        angle: myPlayer.angle,
        isShooting: false,
        sequenceNumber: sequenceNumber++ // Add sequence number to track inputs
    };
    
    if (cursors.up.isDown) {
        input.isThrusting = true;
        myPlayer.isThrusting = true;
    } else {
        myPlayer.isThrusting = false;
    }

    if (cursors.left.isDown) {
        myPlayer.angle -= 4;
        input.angle = myPlayer.angle;
    } else if (cursors.right.isDown) {
        myPlayer.angle += 4;
        input.angle = myPlayer.angle;
    }

    // Check for shooting with spacebar
    if (Phaser.Input.Keyboard.JustDown(shootKey)) {
        input.isShooting = true;
        console.log("Spacebar pressed - shooting");
        
        // Visual feedback for shooting attempt
        if (!myPlayer.getData('isInvulnerable')) {
            const now = time;
            const lastShot = myPlayer.getData('lastShot') || 0;
            const cooldown = GAME?.shootCooldown || 500;
            
            if (now - lastShot > cooldown) {
                myPlayer.setData('lastShot', now);
                // Flash the player briefly to indicate shooting attempt
                myPlayer.setTint(0xffff00);
                setTimeout(() => myPlayer.clearTint(), 50);
            }
        }
    }

    // Apply input locally for immediate feedback
    applyInput(myPlayer, input);
    
    // Save this input for later reconciliation
    pendingInputs.push(input);
    
    // Send input to server
    socket.emit('playerInput', input);

    // Update camera
    updateMultiplayerCamera();

    // Update shield positions for all players
    if (myPlayer.shield) {
        myPlayer.shield.x = myPlayer.x;
        myPlayer.shield.y = myPlayer.y;
    }
    
    Object.values(otherPlayers).forEach(player => {
        if (player.shield) {
            player.shield.x = player.x;
            player.shield.y = player.y;
        }
        
        if (player.oldX !== undefined && player.targetX !== undefined) {
            // Increment interpolation timer
            player.interpTime = Math.min(1, (player.interpTime || 0) + (delta / 1000) * 15); // 15 is the interpolation speed factor
            
            // Interpolate position and angle
            player.x = Phaser.Math.Linear(player.oldX, player.targetX, player.interpTime);
            player.y = Phaser.Math.Linear(player.oldY, player.targetY, player.interpTime);
            
            // Use shortest path for angle interpolation
            let angleDiff = player.targetAngle - player.oldAngle;
            if (angleDiff > 180) angleDiff -= 360;
            if (angleDiff < -180) angleDiff += 360;
            player.angle = player.oldAngle + angleDiff * player.interpTime;
        }
    });
}

function updateMultiplayerCamera() {
    if (!myPlayer || !mainCamera) return;

    // Get all active players including our player
    const allPlayers = [myPlayer, ...Object.values(otherPlayers)];
    
    // Calculate the bounding box of all players
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    allPlayers.forEach(player => {
        minX = Math.min(minX, player.x);
        minY = Math.min(minY, player.y);
        maxX = Math.max(maxX, player.x);
        maxY = Math.max(maxY, player.y);
    });

    // Calculate center point
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate required zoom level to fit all players
    const width = maxX - minX + cameraMargin * 2;
    const height = maxY - minY + cameraMargin * 2;
    const widthZoom = game.scale.width / width;
    const heightZoom = game.scale.height / height;
    targetZoom = Math.min(maxZoom, Math.max(minZoom, Math.min(widthZoom, heightZoom)));
    
    // Smoothly interpolate current zoom towards target zoom
    currentZoom = Phaser.Math.Linear(currentZoom, targetZoom, zoomSpeed);

    // Update camera
    mainCamera.pan(centerX, centerY, 100, 'Linear', true);
    mainCamera.zoomTo(currentZoom, 100);
    
    if (DEBUG_MODE && debugText) {
        debugText.setText(`Players: ${allPlayers.length}, Zoom: ${currentZoom.toFixed(2)}`);
        debugText.setScrollFactor(0);
    }
}

function createScoreText(scene, playerId) {
    const isMyPlayer = playerId === socket.id;
    const color = isMyPlayer ? '#0000FF' : '#FF0000';
    const x = isMyPlayer ? 20 : game.scale.width - 120;
    
    scoreTexts[playerId] = scene.add.text(x, 20, `${isMyPlayer ? 'You' : 'Player'}: 0`, {
        fontSize: '24px', 
        fill: color,
        stroke: '#000000',
        strokeThickness: 2
    });
    
    scoreTexts[playerId].setScrollFactor(0);
}

function updateScoreText(playerId, score) {
    if (scoreTexts[playerId]) {
        const isMyPlayer = playerId === socket.id;
        scoreTexts[playerId].setText(`${isMyPlayer ? 'You' : 'Player'}: ${score}`);
    }
}

function updateBulletsFromState(scene, bulletState) {
    // Clear existing bullets
    bullets.clear(true, true);
    
    // Create new bullets based on state
    if (bulletState && bulletState.length > 0) {
        console.log(`Rendering ${bulletState.length} bullets`);
        
        bulletState.forEach(bulletData => {
            try {
                // Create a new bullet sprite directly
                const bullet = scene.physics.add.sprite(bulletData.x, bulletData.y, 'bullet_yellow');
                bullet.setScale(1.5); // Make bullets more visible
                bullets.add(bullet);
                
                bullet.setActive(true);
                bullet.setVisible(true);
                bullet.ownerId = bulletData.ownerId;
                
                // Check if this is a new bullet from our player
                if (bulletData.ownerId === socket.id && bulletData.createdAt) {
                    const timeSinceCreation = Date.now() - bulletData.createdAt;
                    if (timeSinceCreation < 100) { // Only play sound for bullets created in the last 100ms
                        shootSound.play({ volume: 0.5 });
                        console.log("Playing shoot sound for new bullet");
                    }
                }
            } catch (error) {
                console.error("Error creating bullet:", error);
            }
        });
    } else {
        console.log("No bullets to render");
    }
    
    // Debug info
    if (DEBUG_MODE && debugText) {
        const bulletCount = bulletState ? bulletState.length : 0;
        const playerCount = Object.keys(otherPlayers).length + 1;
        debugText.setText(`Players: ${playerCount}, Bullets: ${bulletCount}, My ID: ${socket?.id || 'unknown'}`);
        debugText.setPosition(20, scene.cameras.main.height - 40);
        debugText.setScrollFactor(0);
    }
}

// Create player triangles with proper center pivot
function createPlayerTriangle(scene, x, y, color, angle) {
    // Define triangle vertices relative to center (0,0)
    const size = 20; // Half size of the triangle
    const vertices = [
        { x: size, y: 0 },          // Tip (pointing right)
        { x: -size, y: -size },     // Left top
        { x: -size, y: size }       // Left bottom
    ];
    
    // Calculate the bounds for the texture
    const textureSize = size * 2.5; // Make texture big enough to contain the triangle
    
    // Create the triangle graphics object to generate the texture
    const graphics = scene.add.graphics();
    
    // Position the graphics at the center of the texture
    graphics.clear();
    graphics.fillStyle(color, 1);
    graphics.lineStyle(2, 0xffffff, 1);
    
    // Draw the triangle centered in the texture
    graphics.beginPath();
    graphics.moveTo(vertices[0].x + textureSize/2, vertices[0].y + textureSize/2);
    graphics.lineTo(vertices[1].x + textureSize/2, vertices[1].y + textureSize/2);
    graphics.lineTo(vertices[2].x + textureSize/2, vertices[2].y + textureSize/2);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
    
    // Create unique key for this triangle
    const key = 'triangle_' + color.toString(16);
    
    // Generate texture from the graphics
    graphics.generateTexture(key, textureSize, textureSize);
    graphics.destroy();
    
    // Create the ship using the generated texture
    const ship = scene.add.sprite(x, y, key);
    ship.setOrigin(0.5, 0.5); // Set origin to center for proper rotation
    
    // Add physics
    scene.physics.add.existing(ship);
    ship.body.setDamping(true);
    
    // Use PHYSICS if available, otherwise use fallback values
    const dragValue = PHYSICS ? PHYSICS.drag : 0.9;
    const maxSpeedValue = PHYSICS ? PHYSICS.maxSpeed : 1;
    
    ship.body.setDrag(dragValue);
    ship.body.setMaxVelocity(maxSpeedValue, maxSpeedValue);
    ship.body.setAngularDrag(0.9);
    ship.angle = angle;
    
    // Add custom properties
    ship.isThrusting = false;
    ship.setData('isShooting', false);
    ship.setData('lastShot', 0);
    ship.setData('isInvulnerable', false);
    
    // Store the tip position for bullet spawning (in local space)
    ship.tipOffset = { x: size, y: 0 };
    
    return ship;
}

// Apply an input to a player
function applyInput(player, input) {
    if (!PHYSICS) return;
    
    // Update angle
    player.angle = input.angle;
    
    // Apply thrust if thrusting
    if (input.isThrusting) {
        const angleRad = player.angle * (Math.PI / 180);
        player.body.velocity.x += Math.cos(angleRad) * PHYSICS.thrustPower;
        player.body.velocity.y += Math.sin(angleRad) * PHYSICS.thrustPower;
        
        // Limit speed
        const speed = Math.sqrt(player.body.velocity.x ** 2 + player.body.velocity.y ** 2);
        if (speed > PHYSICS.maxSpeed) {
            const scale = PHYSICS.maxSpeed / speed;
            player.body.velocity.x *= scale;
            player.body.velocity.y *= scale;
        }
    }
} 