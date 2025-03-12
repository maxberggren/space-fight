// Game configuration
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth * 4,  // Double the internal resolution
    height: window.innerHeight * 4,
    resolution: 4,  // Display at half size (effectively supersampling)
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
let sequenceNumber = 0; // Add sequence number for input prediction
let pendingInputs = []; // Store inputs that haven't been processed by server
let playerName = "Player"; // Default player name
let playerColor = 0x0000ff; // Default player color (blue)
let playerNameTexts = {}; // Store text objects for player names
let scene; // Store reference to the current scene
let planets = {}; // Store planet objects
let planetGraphics; // Graphics object for rendering planets

// Available colors for player ships with friendly names
const PLAYER_COLORS = [
    { value: 0x0000ff, name: 'Blue' },
    { value: 0xff0000, name: 'Red' },
    { value: 0x00ff00, name: 'Green' },
    { value: 0xffff00, name: 'Yellow' },
    { value: 0xff00ff, name: 'Magenta' },
    { value: 0x00ffff, name: 'Cyan' },
    { value: 0xff8800, name: 'Orange' },
    { value: 0x8800ff, name: 'Purple' },
    { value: 0xffffff, name: 'White' },
    { value: 0x888888, name: 'Gray' }
];

// Camera variables
let mainCamera;
let targetZoom = 0.3; // Default very zoomed-out level
let currentZoom = 0.3;
let zoomSpeed = 0.05; // Smooth transition speed
let minZoom = 1.25; // Minimum zoom (most zoomed out)
let maxZoom = 3.1; // Maximum zoom when players are close (more zoomed in)
let cameraMargin = 200; // Margin around players

// Initialize HTML UI elements
function initializeUI() {
    // Create color options
    const colorOptionsContainer = document.getElementById('color-options');
    
    // Clear any existing color options
    colorOptionsContainer.innerHTML = '';
    
    // Add color options
    PLAYER_COLORS.forEach((color, index) => {
        const colorOption = document.createElement('div');
        colorOption.className = 'color-option';
        colorOption.style.backgroundColor = '#' + color.value.toString(16).padStart(6, '0');
        
        // Add tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'color-tooltip';
        tooltip.textContent = color.name;
        colorOption.appendChild(tooltip);
        
        // Set selected state for current color
        if (color.value === playerColor) {
            colorOption.classList.add('selected');
        }
        
        // Add click handler
        colorOption.addEventListener('click', () => {
            // Update selected color
            playerColor = color.value;
            
            // Update UI
            document.querySelectorAll('.color-option').forEach(el => {
                el.classList.remove('selected');
            });
            colorOption.classList.add('selected');
            
            // Update player info
            updatePlayerInfo();
        });
        
        colorOptionsContainer.appendChild(colorOption);
    });
    
    // Set up name input handler
    const nameInput = document.getElementById('player-name');
    nameInput.value = playerName;
    
    nameInput.addEventListener('change', () => {
        playerName = nameInput.value.trim();
        updatePlayerInfo();
    });
    
    // Also update on input to be more responsive
    nameInput.addEventListener('input', () => {
        playerName = nameInput.value.trim();
        updatePlayerInfo();
    });
}

// Preload game assets
function preload() {
    // Load only the explosion spritesheet and sounds
    this.load.spritesheet('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/explosion.png', { frameWidth: 64, frameHeight: 64, endFrame: 23 });
    
    // Load sound effects
    this.load.audio('shoot', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/blaster.mp3');
    this.load.audio('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/explosion.mp3');
    this.load.audio('respawn', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/alien_death1.wav');
    
    // Try to load planet texture, with fallback to generate one if it fails
    this.load.image('planet', 'assets/planet.png');
    this.load.on('filecomplete-image-planet', () => {
        console.log('Planet texture loaded successfully');
    });
    
    this.load.on('loaderror', (fileObj) => {
        if (fileObj.key === 'planet') {
            console.log('Planet texture failed to load, generating one programmatically');
            if (typeof this.generatePlanetTexture === 'function') {
                this.generatePlanetTexture();
            } else {
                // Simple fallback - create a basic graphics texture for the planet
                const graphics = this.add.graphics();
                const radius = 100; // Default planet radius
                graphics.fillStyle(0x888888, 1); // Gray color
                graphics.fillCircle(radius, radius, radius);
                
                // Create a texture from the graphics object
                const texture = graphics.generateTexture('planet-fallback', radius * 2, radius * 2);
                graphics.destroy();
                
                // Use this texture for planets that failed to load
                console.log('Created fallback planet texture');
            }
        }
    });
}

// Generate a planet texture programmatically
function generatePlanetTexture() {
    if (!scene) return;
    
    // Create graphics object for the planet texture
    const graphics = scene.add.graphics();
    
    // Set size
    const size = 256;
    
    // Draw a circular planet with some texture
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 10;
    
    // Draw the main circle
    graphics.fillStyle(0x888888, 1);
    graphics.fillCircle(centerX, centerY, radius);
    
    // Add some craters
    for (let i = 0; i < 15; i++) {
        const craterX = centerX + (Math.random() * 2 - 1) * radius * 0.8;
        const craterY = centerY + (Math.random() * 2 - 1) * radius * 0.8;
        const craterRadius = 5 + Math.random() * 15;
        
        graphics.fillStyle(0x000000, 0.3);
        graphics.fillCircle(craterX, craterY, craterRadius);
    }
    
    // Add a subtle highlight
    graphics.fillStyle(0xffffff, 0.1);
    graphics.fillCircle(centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.5);
    
    // Generate texture
    graphics.generateTexture('planet', size, size);
    
    // Destroy the graphics object as we no longer need it
    graphics.destroy();
    
    console.log('Planet texture generated programmatically');
}

// Create game objects
function create() {
    // Store reference to the current scene
    scene = this;
    
    // Set up the world bounds to be much larger than the visible area
    // Use WORLD.size if available, otherwise use fallback
    const worldSize = WORLD ? WORLD.size : 10000;
    this.physics.world.setBounds(-worldSize/2, -worldSize/2, worldSize, worldSize);
    
    // Set up the main camera
    mainCamera = this.cameras.main;
    mainCamera.setBackgroundColor('#000000');
    
    // Create a grid background to visualize the infinite world
    createGridBackground(this);
    
    // Create graphics object for planets
    planetGraphics = this.add.graphics();
    
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
    
    // Initialize HTML UI
    initializeUI();
}

function setupSocketHandlers(scene) {
    socket.on('connect', () => {
        console.log('Connected to server');
        
        // Send initial player info when connected
        updatePlayerInfo();
    });

    socket.on('gameState', (state) => {
        // Handle initial game state
        Object.keys(state.players).forEach(playerId => {
            const playerData = state.players[playerId];
            if (playerId === socket.id) {
                // Create our player
                myPlayer = createPlayerTriangle(scene, playerData.x, playerData.y, 
                    playerData.color || playerColor, playerData.angle);
                myPlayer.id = playerId;
                // Set initial invulnerability state
                updatePlayerInvulnerability(myPlayer, playerData.invulnerable);
                
                // Update our name and color if server has them
                if (playerData.name) {
                    playerName = playerData.name;
                    document.getElementById('player-name').value = playerName;
                }
                if (playerData.color) {
                    playerColor = playerData.color;
                    // Update color selection in UI
                    document.querySelectorAll('.color-option').forEach(el => {
                        const colorHex = '#' + playerData.color.toString(16).padStart(6, '0');
                        if (el.style.backgroundColor === colorHex) {
                            el.classList.add('selected');
                        } else {
                            el.classList.remove('selected');
                        }
                    });
                }
                
                // Create name text for our player
                createPlayerNameText(scene, playerId, playerData.name || playerName);
            } else {
                // Create other players
                const otherPlayer = createPlayerTriangle(scene, playerData.x, playerData.y, 
                    playerData.color || 0xff0000, playerData.angle);
                otherPlayer.id = playerId;
                otherPlayers[playerId] = otherPlayer;
                // Set initial invulnerability state
                updatePlayerInvulnerability(otherPlayer, playerData.invulnerable);
                
                // Create name text for other player
                createPlayerNameText(scene, playerId, playerData.name || "Player");
            }
        });
        
        // Initialize planets
        if (state.planets) {
            Object.keys(state.planets).forEach(planetId => {
                planets[planetId] = state.planets[planetId];
                console.log(`Initialized planet ${planetId} at (${planets[planetId].x}, ${planets[planetId].y})`);
            });
        }
    });

    socket.on('playerJoined', (playerData) => {
        if (playerData.id !== socket.id) {
            const newPlayer = createPlayerTriangle(scene, playerData.x, playerData.y, 
                playerData.color || 0xff0000, playerData.angle);
            newPlayer.id = playerData.id;
            otherPlayers[playerData.id] = newPlayer;
            
            // Create name text for new player
            createPlayerNameText(scene, playerData.id, playerData.name || "Player");
        }
    });

    socket.on('playerLeft', (playerId) => {
        if (otherPlayers[playerId]) {
            otherPlayers[playerId].destroy();
            delete otherPlayers[playerId];
            
            // Remove player name text
            if (playerNameTexts[playerId]) {
                playerNameTexts[playerId].destroy();
                delete playerNameTexts[playerId];
            }
        }
    });

    socket.on('playerInfoUpdate', (playerData) => {
        // Update other player's info (name, color)
        if (playerData.id !== socket.id && otherPlayers[playerData.id]) {
            const otherPlayer = otherPlayers[playerData.id];
            
            // Update player name
            if (playerData.name && playerNameTexts[playerData.id]) {
                playerNameTexts[playerData.id].setText(playerData.name);
            }
            
            // Update player color - recreate the triangle with new color
            if (playerData.color) {
                const x = otherPlayer.x;
                const y = otherPlayer.y;
                const angle = otherPlayer.angle;
                
                // Store any custom properties
                const isInvulnerable = otherPlayer.getData('isInvulnerable');
                const shield = otherPlayer.shield;
                
                // Remove old player sprite
                otherPlayer.destroy();
                
                // Create new player sprite with updated color
                const updatedPlayer = createPlayerTriangle(scene, x, y, playerData.color, angle);
                updatedPlayer.id = playerData.id;
                otherPlayers[playerData.id] = updatedPlayer;
                
                // Restore custom properties
                updatePlayerInvulnerability(updatedPlayer, isInvulnerable);
            }
        }
    });

    socket.on('gameStateUpdate', (state) => {
        // Update all players
        Object.keys(state.players).forEach(playerId => {
            const playerData = state.players[playerId];
            
            if (playerId === socket.id && myPlayer) {
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
                
                // Update player name position
                if (playerNameTexts[playerId]) {
                    playerNameTexts[playerId].x = myPlayer.x;
                    playerNameTexts[playerId].y = myPlayer.y + 30;
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
                
                // Update player name position
                if (playerNameTexts[playerId]) {
                    playerNameTexts[playerId].x = otherPlayer.x;
                    playerNameTexts[playerId].y = otherPlayer.y + 30;
                }
            }
        });

        // Update bullets
        updateBulletsFromState(scene, state.bullets);

        // Update planets
        if (state.planets) {
            // Update existing planets and add new ones
            Object.keys(state.planets).forEach(planetId => {
                planets[planetId] = state.planets[planetId];
            });
            
            // Remove planets that no longer exist
            Object.keys(planets).forEach(planetId => {
                if (!state.planets[planetId]) {
                    delete planets[planetId];
                }
            });
        }
    });
    
    // Handle planet creation
    socket.on('planetCreated', (planetData) => {
        console.log(`Planet created: ${planetData.id} at (${planetData.x}, ${planetData.y})`);
        planets[planetData.id] = planetData;
    });
    
    // Handle planet hit
    socket.on('planetHit', (data) => {
        console.log(`Planet hit: ${data.planetId} at angle ${data.impactAngle.toFixed(2)}`);
        
        // Create explosion effect ONLY at the actual impact point
        const explosion = scene.add.sprite(data.x, data.y, 'explosion');
        explosion.setScale(0.5);
        explosion.play('explode');
        explosion.once('animationcomplete', () => {
            explosion.destroy();
        });
        
        // Play explosion sound
        explosionSound.play({ volume: 0.3 });
    });
    
    // Handle crater created
    socket.on('craterCreated', (data) => {
        console.log(`Crater created on planet ${data.planetId} at (${data.crater.x.toFixed(2)}, ${data.crater.y.toFixed(2)})`);
        
        // Make sure the planet exists
        if (planets[data.planetId]) {
            // Initialize craters array if it doesn't exist
            if (!planets[data.planetId].craters) {
                planets[data.planetId].craters = [];
            }
            
            // Add the new crater
            planets[data.planetId].craters.push(data.crater);
            
            // Calculate the vector from planet center to crater
            const planet = planets[data.planetId];
            const dx = data.crater.x - planet.x;
            const dy = data.crater.y - planet.y;
            
            // Create debris particles flying out from the crater
            const particleCount = 8 + Math.floor(Math.random() * 5);
            for (let i = 0; i < particleCount; i++) {
                // Calculate random direction for debris - only in the outward hemisphere
                // This ensures debris only flies outward from the impact point
                const baseAngle = Math.atan2(dy, dx);
                const debrisAngle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.8; // Limit to outward hemisphere
                const debrisSpeed = 1 + Math.random() * 2;
                const debrisDistance = Math.random() * data.crater.radius;
                
                // Create a small particle
                const particle = scene.add.graphics();
                const particleSize = 1 + Math.random() * 3;
                const particleColor = 0x888888;
                
                // Draw particle
                particle.fillStyle(particleColor, 0.7);
                particle.fillCircle(
                    data.crater.x + Math.cos(debrisAngle) * debrisDistance,
                    data.crater.y + Math.sin(debrisAngle) * debrisDistance,
                    particleSize
                );
                
                // Animate particle flying outward and fading
                scene.tweens.add({
                    targets: particle,
                    x: Math.cos(debrisAngle) * 50 * debrisSpeed,
                    y: Math.sin(debrisAngle) * 50 * debrisSpeed,
                    alpha: 0,
                    duration: 1000 + Math.random() * 500,
                    onComplete: () => {
                        particle.destroy();
                    }
                });
            }
            
            // Add a dust cloud effect
            const dust = scene.add.sprite(data.crater.x, data.crater.y, 'explosion');
            dust.setScale(0.3 + (data.crater.radius / 50)); // Scale based on crater size
            dust.setAlpha(0.6);
            dust.setTint(0x888888);
            dust.play('explode');
            dust.once('animationcomplete', () => {
                dust.destroy();
            });
        }
    });
    
    // Handle planet removed
    socket.on('planetRemoved', (planetId) => {
        console.log(`Planet removed: ${planetId}`);
        delete planets[planetId];
    });
    
    // Handle player crashed on planet
    socket.on('playerCrashed', (data) => {
        console.log(`Player crashed: ${data.playerId} on planet ${data.planetId}`);
        
        // Create large explosion effect
        const explosion = scene.add.sprite(data.x, data.y, 'explosion');
        explosion.setScale(2);
        explosion.play('explode');
        explosion.once('animationcomplete', () => {
            explosion.destroy();
        });
        
        // Play explosion sound
        explosionSound.play({ volume: 0.6 });
    });
    
    // Handle player landed on planet
    socket.on('playerLanded', (data) => {
        console.log(`Player landed: ${data.playerId} on planet ${data.planetId}`);
        
        // Create small dust effect
        const dust = scene.add.sprite(data.x, data.y, 'explosion');
        dust.setScale(0.3);
        dust.setAlpha(0.5);
        dust.play('explode');
        dust.once('animationcomplete', () => {
            dust.destroy();
        });
        
        // If this is our player, show a takeoff hint
        if (data.playerId === socket.id) {
            const hintText = scene.add.text(data.x, data.y - 50, "Press UP to take off", {
                fontSize: '16px',
                fill: '#FFFFFF',
                stroke: '#000000',
                strokeThickness: 3
            });
            hintText.setOrigin(0.5, 0.5);
            hintText.setName('takeoffHint');
            
            // Fade out after 3 seconds
            scene.tweens.add({
                targets: hintText,
                alpha: 0,
                duration: 3000,
                delay: 2000,
                onComplete: () => {
                    hintText.destroy();
                }
            });
            
            // If we claimed the planet, show a message
            if (data.claimed) {
                let claimMessage = "Planet claimed!";
                if (data.wasClaimed) {
                    claimMessage = "Planet conquered!";
                }
                
                const claimText = scene.add.text(data.x, data.y - 80, claimMessage, {
                    fontSize: '18px',
                    fill: '#FFFF00',
                    stroke: '#000000',
                    strokeThickness: 3,
                    fontStyle: 'bold'
                });
                claimText.setOrigin(0.5, 0.5);
                
                // Add scale animation
                scene.tweens.add({
                    targets: claimText,
                    scaleX: 1.2,
                    scaleY: 1.2,
                    duration: 500,
                    yoyo: true,
                    repeat: 1
                });
                
                // Fade out
                scene.tweens.add({
                    targets: claimText,
                    alpha: 0,
                    y: claimText.y - 30,
                    duration: 2000,
                    delay: 1500,
                    onComplete: () => {
                        claimText.destroy();
                    }
                });
            }
        }
    });
    
    // Handle player takeoff from planet
    socket.on('playerTakeoff', (data) => {
        console.log(`Player took off: ${data.playerId} from planet ${data.planetId}`);
        
        // Create multiple thrust effects for a more dramatic takeoff
        for (let i = 0; i < 3; i++) {
            scene.time.delayedCall(i * 100, () => {
                // Create thrust effect with slight position variation
                const offsetX = (Math.random() - 0.5) * 10;
                const offsetY = (Math.random() - 0.5) * 10;
                const thrust = scene.add.sprite(data.x + offsetX, data.y + offsetY, 'explosion');
                thrust.setScale(0.3 + Math.random() * 0.2);
                thrust.setTint(0x00ffff);
                thrust.setAlpha(0.7);
                thrust.play('explode');
                thrust.once('animationcomplete', () => {
                    thrust.destroy();
                });
            });
        }
        
        // Play a sound for takeoff
        if (data.playerId === socket.id) {
            // Remove any takeoff hint
            const hint = scene.children.getByName('takeoffHint');
            if (hint) hint.destroy();
            
            // Play sound if available
            if (shootSound) shootSound.play({ volume: 0.3, detune: -300 });
            
            // Add a temporary shield effect to visualize invulnerability
            if (myPlayer) {
                // Flash the player briefly
                myPlayer.setTint(0x00ffff);
                scene.time.delayedCall(500, () => {
                    myPlayer.clearTint();
                });
                
                // Show a temporary message
                const safeText = scene.add.text(data.x, data.y - 40, "Safe takeoff!", {
                    fontSize: '14px',
                    fill: '#00FFFF',
                    stroke: '#000000',
                    strokeThickness: 3
                });
                safeText.setOrigin(0.5, 0.5);
                
                // Fade out
                scene.tweens.add({
                    targets: safeText,
                    alpha: 0,
                    y: safeText.y - 30,
                    duration: 1500,
                    onComplete: () => {
                        safeText.destroy();
                    }
                });
            }
        }
    });
    
    // Handle planet severely damaged
    socket.on('planetSeverelyDamaged', (data) => {
        console.log(`Planet severely damaged: ${data.planetId}`);
        
        // Create visual effect
        if (planets[data.planetId]) {
            const planet = planets[data.planetId];
            
            // Create multiple explosions around the planet
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = planet.radius * 0.8;
                const x = planet.x + Math.cos(angle) * distance;
                const y = planet.y + Math.sin(angle) * distance;
                
                // Add delayed explosions
                scene.time.delayedCall(i * 200, () => {
                    const explosion = scene.add.sprite(x, y, 'explosion');
                    explosion.setScale(0.7);
                    explosion.play('explode');
                    explosion.once('animationcomplete', () => {
                        explosion.destroy();
                    });
                    
                    // Play explosion sound
                    explosionSound.play({ volume: 0.4 });
                });
            }
        }
    });
    
    // Handle planet claimed event
    socket.on('planetClaimed', (data) => {
        console.log(`Planet ${data.planetId} claimed by player ${data.newOwnerId}`);
        
        // Update planet data
        if (planets[data.planetId]) {
            planets[data.planetId].ownerId = data.newOwnerId;
            planets[data.planetId].color = data.playerColor;
            
            // Get the planet position for effects
            const planet = planets[data.planetId];
            
            // Create claim effect - ripple emanating from the planet
            const rippleCount = 3;
            for (let i = 0; i < rippleCount; i++) {
                scene.time.delayedCall(i * 300, () => {
                    const ripple = scene.add.graphics();
                    const color = data.playerColor || 0xFFFFFF;
                    
                    // Draw ripple
                    ripple.lineStyle(3, color, 0.7 - (i * 0.2));
                    ripple.strokeCircle(planet.x, planet.y, planet.radius + 10);
                    
                    // Animate ripple expanding and fading
                    scene.tweens.add({
                        targets: ripple,
                        scale: 1.5 + (i * 0.5),
                        alpha: 0,
                        duration: 1000,
                        onComplete: () => {
                            ripple.destroy();
                        }
                    });
                });
            }
            
            // Play sound effect if available
            if (data.newOwnerId === socket.id) {
                // Play claim sound (using explosion sound with different pitch)
                if (explosionSound) {
                    explosionSound.play({ volume: 0.3, detune: -600 });
                }
            }
            
            // Show claim notification for all players
            const claimingPlayerName = data.playerName || "Unknown player";
            let notificationText;
            
            if (data.newOwnerId === socket.id) {
                notificationText = "You claimed a planet!";
            } else if (data.previousOwnerId === socket.id) {
                notificationText = `${claimingPlayerName} took your planet!`;
            } else {
                notificationText = `${claimingPlayerName} claimed a planet!`;
            }
            
            // Create notification at top of screen
            const notification = scene.add.text(
                scene.cameras.main.centerX, 
                50, 
                notificationText, 
                {
                    fontSize: '18px',
                    fill: '#FFFFFF',
                    stroke: '#000000',
                    strokeThickness: 3,
                    fontStyle: 'bold'
                }
            );
            notification.setOrigin(0.5, 0.5);
            notification.setScrollFactor(0); // Fix to camera
            
            // Fade out notification
            scene.tweens.add({
                targets: notification,
                alpha: 0,
                y: 30,
                duration: 2000,
                delay: 2000,
                onComplete: () => {
                    notification.destroy();
                }
            });
        }
    });
}

// Create text for player names
function createPlayerNameText(scene, playerId, name) {
    // Create text object for player name
    const nameText = scene.add.text(0, 0, name, {
        fontSize: '14px',
        fill: '#FFFFFF',
        stroke: '#000000',
        strokeThickness: 3,
        fontStyle: 'bold'
    });
    nameText.setOrigin(0.5, 0);
    
    // Store reference to name text
    playerNameTexts[playerId] = nameText;
    
    // Set initial position
    const player = playerId === socket.id ? myPlayer : otherPlayers[playerId];
    if (player) {
        nameText.x = player.x;
        nameText.y = player.y + 30; // Position below player
    }
}

// Update player info (name and color) and send to server
function updatePlayerInfo() {
    if (!socket || !socket.connected) return;
    
    // Send updated player info to server
    socket.emit('updatePlayerInfo', {
        name: playerName,
        color: playerColor
    });
    
    // Update local player if it exists
    if (myPlayer && scene) {
        // Update name text
        if (playerNameTexts[socket.id]) {
            playerNameTexts[socket.id].setText(playerName);
        }
        
        // Update player color - recreate the triangle with new color
        const x = myPlayer.x;
        const y = myPlayer.y;
        const angle = myPlayer.angle;
        
        // Store any custom properties
        const isInvulnerable = myPlayer.getData('isInvulnerable');
        const shield = myPlayer.shield;
        
        // Remove old player sprite
        myPlayer.destroy();
        
        // Create new player sprite with updated color
        myPlayer = createPlayerTriangle(scene, x, y, playerColor, angle);
        myPlayer.id = socket.id;
        
        // Restore custom properties
        updatePlayerInvulnerability(myPlayer, isInvulnerable);
    }
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
    
    // Update player name positions
    if (playerNameTexts[socket.id]) {
        playerNameTexts[socket.id].x = myPlayer.x;
        playerNameTexts[socket.id].y = myPlayer.y + 30;
    }
    
    Object.values(otherPlayers).forEach(player => {
        if (player.shield) {
            player.shield.x = player.x;
            player.shield.y = player.y;
        }
        
        // Update name position for this player
        if (playerNameTexts[player.id]) {
            playerNameTexts[player.id].x = player.x;
            playerNameTexts[player.id].y = player.y + 30;
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

    // Render planets
    renderPlanets();
}

function updateMultiplayerCamera() {
    if (!myPlayer || !mainCamera) return;

    // Default to focusing on the player with a zoomed-out view
    let targetX = myPlayer.x;
    let targetY = myPlayer.y;
    let newTargetZoom = minZoom; // Start with the most zoomed out view
    
    // Find nearby players (within a certain distance)
    const nearbyPlayers = [];
    const detectionRadius = 600; // How far to detect other players for zoom-in
    
    Object.values(otherPlayers).forEach(player => {
        const distance = Phaser.Math.Distance.Between(myPlayer.x, myPlayer.y, player.x, player.y);
        if (distance < detectionRadius) {
            nearbyPlayers.push({
                player: player,
                distance: distance
            });
        }
    });
    
    // If there are nearby players, adjust the camera
    if (nearbyPlayers.length > 0) {
        // Sort players by distance (closest first)
        nearbyPlayers.sort((a, b) => a.distance - b.distance);
        
        // Calculate the bounding box of the player and nearby players
        let minX = myPlayer.x;
        let minY = myPlayer.y;
        let maxX = myPlayer.x;
        let maxY = myPlayer.y;

        // Only include the closest player for camera calculations
        const closestPlayer = nearbyPlayers[0].player;
        minX = Math.min(minX, closestPlayer.x);
        minY = Math.min(minY, closestPlayer.y);
        maxX = Math.max(maxX, closestPlayer.x);
        maxY = Math.max(maxY, closestPlayer.y);

        // Calculate center point between player and closest opponent
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        // Bias the camera position toward the player
        targetX = myPlayer.x * 0.7 + centerX * 0.3;
        targetY = myPlayer.y * 0.7 + centerY * 0.3;
        
        // Calculate required zoom level based on distance between players
        const width = (maxX - minX) + cameraMargin * 2;
        const height = (maxY - minY) + cameraMargin * 2;
        const widthZoom = game.scale.width / width;
        const heightZoom = game.scale.height / height;
        
        // Use the more constrained dimension for zoom
        const calculatedZoom = Math.min(widthZoom, heightZoom);
        
        // Clamp zoom between min and max values
        newTargetZoom = Math.min(maxZoom, Math.max(minZoom, calculatedZoom));
    }
    
    // Smoothly transition to the target zoom
    targetZoom = Phaser.Math.Linear(targetZoom, newTargetZoom, 0.1);
    currentZoom = Phaser.Math.Linear(currentZoom, targetZoom, zoomSpeed);
    
    // Update camera position and zoom
    mainCamera.pan(targetX, targetY, 100, 'Linear', true);
    mainCamera.zoomTo(currentZoom, 100);
}

function updateBulletsFromState(scene, bulletState) {
    // Clear existing bullets
    bullets.clear(true, true);
    
    // Create new bullets based on state
    if (bulletState && bulletState.length > 0) {
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
                    }
                }
            } catch (error) {
                console.error("Error creating bullet:", error);
            }
        });
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

// Render planets
function renderPlanets() {
    if (!planetGraphics || !scene) return;
    
    // Clear previous planet graphics
    planetGraphics.clear();
    
    // Render each planet
    Object.values(planets).forEach(planet => {
        if (!planet || typeof planet.x !== 'number' || typeof planet.y !== 'number') {
            console.warn('Invalid planet data:', planet);
            return;
        }
        
        // Get planet color (default to gray if not specified)
        const color = planet.color || 0x888888;
        const radius = planet.radius || 100;
        
        // Draw planet base
        planetGraphics.fillStyle(color, 0.7);
        planetGraphics.lineStyle(2, 0xffffff, 0.8);
        
        // Draw complete circle first as base
        planetGraphics.fillCircle(planet.x, planet.y, radius);
        planetGraphics.strokeCircle(planet.x, planet.y, radius);
        
        // Draw ownership indicator (pulsing glow for owned planets)
        const isOwnedByMe = planet.ownerId === socket.id;
        const isOriginalPlanet = planet.id === planet.ownerId;
        
        // If this is a claimed planet (not original owner), add a crown or flag
        if (!isOriginalPlanet) {
            // Draw a flag or crown on top of the planet
            const flagHeight = radius * 0.4;
            const flagX = planet.x;
            const flagY = planet.y - radius - flagHeight/2;
            
            // Draw flag pole
            planetGraphics.lineStyle(3, 0xFFFFFF, 0.9);
            planetGraphics.beginPath();
            planetGraphics.moveTo(flagX, planet.y - radius);
            planetGraphics.lineTo(flagX, flagY - flagHeight/2);
            planetGraphics.strokePath();
            
            // Draw flag
            planetGraphics.fillStyle(color, 1);
            planetGraphics.fillTriangle(
                flagX, flagY - flagHeight/2,
                flagX + flagHeight * 0.7, flagY,
                flagX, flagY + flagHeight/2
            );
        }
        
        // Add pulsing effect for planets owned by the current player
        if (isOwnedByMe) {
            // Calculate pulse based on time
            const time = scene.time.now / 1000;
            const pulseSize = Math.sin(time * 3) * 5 + 10; // Pulsing between 5 and 15
            
            // Draw pulsing ring
            planetGraphics.lineStyle(2, color, 0.3);
            planetGraphics.strokeCircle(planet.x, planet.y, radius + pulseSize);
        }
        
        // Draw debug visualizations if debug mode is enabled
        if (DEBUG_MODE) {
            // Draw a faint "influence zone" around the planet to visualize minimum distance
            planetGraphics.lineStyle(1, 0xffffff, 0.1);
            planetGraphics.strokeCircle(planet.x, planet.y, radius + 200); // Visualize minimum distance
            
            // Draw the gravity field radius
            planetGraphics.lineStyle(1, 0x00ffff, 0.05);
            planetGraphics.strokeCircle(planet.x, planet.y, radius * 25); // Visualize gravity field
            
            // Draw a stronger inner gravity field for bullets
            planetGraphics.lineStyle(1, 0xffff00, 0.05);
            planetGraphics.strokeCircle(planet.x, planet.y, radius * 15); // Visualize bullet gravity field
        }
        
        // Draw craters (circular cutouts)
        if (planet.craters && planet.craters.length > 0) {
            planetGraphics.fillStyle(0x000000, 1);
            
            planet.craters.forEach(crater => {
                // Draw crater as a black circle
                planetGraphics.fillCircle(crater.x, crater.y, crater.radius);
                
                // Add a subtle inner highlight to give depth
                const innerHighlightRadius = crater.radius * 0.7;
                const highlightColor = 0x333333; // Dark gray for subtle depth
                
                // Draw inner highlight
                planetGraphics.fillStyle(highlightColor, 0.3);
                planetGraphics.fillCircle(crater.x, crater.y, innerHighlightRadius);
            });
        }
        
        // Draw planet owner name
        let ownerName = "Unclaimed";
        let nameColor = '#FFFFFF';
        
        if (planet.ownerId === socket.id) {
            ownerName = playerName + "'s Planet";
            nameColor = '#FFFF00'; // Yellow for player's own planets
        } else if (otherPlayers[planet.ownerId]) {
            const otherPlayerName = playerNameTexts[planet.ownerId] ? 
                playerNameTexts[planet.ownerId].text : "Player";
            ownerName = otherPlayerName + "'s Planet";
            
            // If this is a claimed planet (not original), show it differently
            if (planet.id !== planet.ownerId) {
                ownerName = "Claimed by " + otherPlayerName;
            }
        } else if (planet.ownerId !== planet.id) {
            // Planet claimed by a player who is no longer connected
            ownerName = "Abandoned Planet";
            nameColor = '#AAAAAA';
        }
        
        // Check if text already exists for this planet
        const textKey = `planet_text_${planet.id}`;
        let planetText = scene.children.getByName(textKey);
        
        if (!planetText) {
            // Create new text
            planetText = scene.add.text(planet.x, planet.y - radius - 20, ownerName, {
                fontSize: '16px',
                fill: nameColor,
                stroke: '#000000',
                strokeThickness: 3,
                fontStyle: 'bold'
            });
            planetText.setName(textKey);
            planetText.setOrigin(0.5, 0.5);
        } else {
            // Update existing text
            planetText.setText(ownerName);
            planetText.setStyle({
                fontSize: '16px',
                fill: nameColor,
                stroke: '#000000',
                strokeThickness: 3,
                fontStyle: 'bold'
            });
            planetText.x = planet.x;
            planetText.y = planet.y - radius - 20;
        }
    });
}

// Apply planetary gravity to player movement
function applyPlanetaryGravity(player, delta) {
    if (!PHYSICS || !PHYSICS.gravitationalConstant) return;
    
    Object.values(planets).forEach(planet => {
        const dx = planet.x - player.x;
        const dy = planet.y - player.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Skip if too far away (optimization)
        // Increased gravity effect radius from 10x to 25x the planet radius
        if (distance > planet.radius * 25) return;
        
        // Calculate gravitational force (F = G * m1 * m2 / r^2)
        // We'll simplify by using radius as mass and a constant for G
        const force = PHYSICS.gravitationalConstant * planet.radius / distanceSquared;
        
        // Apply force in direction of planet
        const angle = Math.atan2(dy, dx);
        player.body.velocity.x += Math.cos(angle) * force * delta;
        player.body.velocity.y += Math.sin(angle) * force * delta;
    });
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
    
    // Apply gravity from planets
    applyPlanetaryGravity(player, 1);
}

// Create planet graphics
function createPlanetGraphics(scene, planet) {
    // Planet will be rendered in the update function
    console.log(`Creating planet graphics for planet ${planet.id} at (${planet.x}, ${planet.y})`);
} 