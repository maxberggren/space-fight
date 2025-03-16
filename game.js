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
let localPlayer;
let otherPlayers = {};
let bullets = [];
let planets = {};
let cursors;
let wasdKeys; // Added for WASD controls
let shiftKey; // Added for shift key shooting
let mobileControls; // Added for mobile controls
let inputSequenceNumber = 0;
let pendingInputs = [];
let playerNameInput;
let colorOptions;
let selectedColor = 0x0000ff; // Default blue
let playerName = "Player";
let gameStarted = false;
let camera;
let cameraTarget = { x: 0, y: 0 };
let cameraZoom = 1;
let targetZoom = 1;
let worldBounds;
let playerNameTexts = {};
let planetGraphics = {};
let planetTexture;
let starfieldLayers = [];
let planetTypes = []; // Define planetTypes array

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
        if (color.value === selectedColor) {
            colorOption.classList.add('selected');
        }
        
        // Add click handler
        colorOption.addEventListener('click', () => {
            // Update selected color
            selectedColor = color.value;
            
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

    // Add mobile controls if on a touch device
    if (isTouchDevice()) {
        createMobileControls();
    }
}

// Preload game assets
function preload() {
    // Load only the explosion spritesheet and sounds
    this.load.spritesheet('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/explosion.png', { frameWidth: 64, frameHeight: 64, endFrame: 23 });
    
    // Load sound effects
    this.load.audio('shoot', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/blaster.mp3');
    this.load.audio('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/explosion.mp3');
    
    // Load fallback planet texture - in case planet sprite loading fails or before they load
    this.load.image('planet-fallback', 'assets/planets/planet-fallback.png');
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
    
    // Create starfield background with parallax effect
    createStarfieldBackground(this);
    
    // Initialize planetGraphics as an array, not as a graphics object
    planetGraphics = [];
    
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
    
    // Destroy the graphics object as we no longer need it
    bulletGraphics.destroy();

    // Initialize socket connection
    socket = io();
    
    // Set up socket event handlers
    setupSocketHandlers(this);

    // Set up input controls
    cursors = this.input.keyboard.createCursorKeys();
    
    // Add WASD keys as alternative controls
    wasdKeys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });
    
    // Add shift key for shooting
    shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    
    // Create bullet group
    bullets = this.physics.add.group({
        defaultKey: 'bullet_yellow',
        maxSize: 30
    });
    
    // Load sound effects
    shootSound = this.sound.add('shoot');
    explosionSound = this.sound.add('explosion');

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
        planetTypes = state.planetTypes || [];
        console.log("Available planet types:", planetTypes);

        Object.keys(state.players).forEach(playerId => {
            const playerData = state.players[playerId];
            if (playerId === socket.id) {
                // Create our player
                localPlayer = createPlayerTriangle(scene, playerData.x, playerData.y, 
                    playerData.color || selectedColor, playerData.angle);
                localPlayer.id = playerId;
                
                // Update our name and color if server has them
                if (playerData.name) {
                    playerName = playerData.name;
                    document.getElementById('player-name').value = playerName;
                }
                if (playerData.color) {
                    selectedColor = playerData.color;
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
                
                // Create name text for other player
                createPlayerNameText(scene, playerId, playerData.name || "Player");
            }
        });
        
        // Initialize planets
        if (state.planets) {
            Object.keys(state.planets).forEach(planetId => {
                const planetData = state.planets[planetId];
                planets[planetId] = planetData; // Store the entire planet data, including planetType
                console.log(`Initialized planet ${planetId} of type ${planetData.planetType} at (${planets[planetId].x}, ${planets[planetId].y})`); // Log planet type
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
                
                // Remove old player sprite
                otherPlayer.destroy();
                
                // Create new player sprite with updated color
                const updatedPlayer = createPlayerTriangle(scene, x, y, playerData.color, angle);
                updatedPlayer.id = playerData.id;
                otherPlayers[playerData.id] = updatedPlayer;
            }
        }
    });

    socket.on('gameStateUpdate', (state) => {
        // Update all players
        Object.keys(state.players).forEach(playerId => {
            const playerData = state.players[playerId];
            
            if (playerId === socket.id && localPlayer) {
                // Server reconciliation
                if (playerData.lastProcessedInput) {
                    // Remove older inputs that have been processed
                    pendingInputs = pendingInputs.filter(input => 
                        input.sequenceNumber > playerData.lastProcessedInput
                    );
                    
                    // Reset position to server position
                    localPlayer.x = playerData.x;
                    localPlayer.y = playerData.y;
                    localPlayer.body.velocity.x = 0;
                    localPlayer.body.velocity.y = 0;
                    
                    // Re-apply all pending inputs
                    pendingInputs.forEach(input => {
                        applyInput(localPlayer, input);
                    });
                } else {
                    // Smooth position correction if needed (for older server versions)
                    const distance = Phaser.Math.Distance.Between(localPlayer.x, localPlayer.y, playerData.x, playerData.y);
                    if (distance > 100) {
                        localPlayer.x = playerData.x;
                        localPlayer.y = playerData.y;
                    }
                }
                
                // Update player name position
                if (playerNameTexts[playerId]) {
                    playerNameTexts[playerId].x = localPlayer.x;
                    playerNameTexts[playerId].y = localPlayer.y + 30;
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
    
    socket.on('planetCreated', (planetData) => {
        console.log(`Planet created: ${planetData.id} of type ${planetData.planetType} at (${planetData.x}, ${planetData.y})`); // Log planet type
        planets[planetData.id] = planetData; // Store the entire planet data, including planetType
    });
    
    socket.on('planetHit', (data) => {
        console.log(`Planet hit: ${data.planetId} at angle ${data.impactAngle.toFixed(2)}`);
        
        // Create explosion effect ONLY at the actual impact point
        const explosion = scene.add.sprite(data.x, data.y, 'explosion');
        explosion.setScale(0.5);
        // Set depth to be under planets (-15 is less than planet's -10)
        explosion.setDepth(-15);
        explosion.play('explode');
        explosion.once('animationcomplete', () => {
            explosion.destroy();
        });
        
        // Play explosion sound
        explosionSound.play({ volume: 0.3 });
    });
    
    socket.on('planetRemoved', (planetId) => {
        console.log(`Planet removed: ${planetId}`);
        delete planets[planetId];
    });
    
    socket.on('playerCrashed', (data) => {
        console.log(`Player crashed: ${data.playerId} on planet ${data.planetId}`);
        
        // Create large explosion effect
        const explosion = scene.add.sprite(data.x, data.y, 'explosion');
        explosion.setScale(2);
        // Set depth to be under planets (-15 is less than planet's -10)
        explosion.setDepth(-15);
        explosion.play('explode');
        explosion.once('animationcomplete', () => {
            explosion.destroy();
        });

        explosionSound.play({ volume: 0.6 });
    });
    
    socket.on('playerLanded', (data) => {
        console.log(`Player landed: ${data.playerId} on planet ${data.planetId}`);

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
        }
    });
    
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
                    // Set depth to be under planets (-15 is less than planet's -10)
                    explosion.setDepth(-15);
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
    
    socket.on('planetClaimed', (data) => {
        console.log(`Planet ${data.planetId} claimed by player ${data.newOwnerId}`);
        
        // Update planet data
        if (planets[data.planetId]) {
            planets[data.planetId].ownerId = data.newOwnerId;
            planets[data.planetId].color = data.playerColor;
            
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
    const player = playerId === socket.id ? localPlayer : otherPlayers[playerId];
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
        color: selectedColor
    });
    
    // Update local player if it exists
    if (localPlayer && scene) {
        // Update name text
        if (playerNameTexts[socket.id]) {
            playerNameTexts[socket.id].setText(playerName);
        }
        
        // Update player color - recreate the triangle with new color
        const x = localPlayer.x;
        const y = localPlayer.y;
        const angle = localPlayer.angle;
        
        // Remove old player sprite
        localPlayer.destroy();
        
        // Create new player sprite with updated color
        localPlayer = createPlayerTriangle(scene, x, y, selectedColor, angle);
        localPlayer.id = socket.id;
    }
}

function updatePlayerInvulnerability(player, isInvulnerable) {
    // Remove this function entirely or keep it empty for future use
    // This function previously handled the opacity changes for invulnerable players
}

// Replace the grid background function with a starfield function
function createStarfieldBackground(scene) {
    // Create multiple layers of stars for parallax effect
    const layers = 3;
    const starsPerLayer = 200;
    const starfieldLayers = [];
    
    // Create star layers with different depths and speeds
    for (let layer = 0; layer < layers; layer++) {
        // Create a container for this layer of stars
        const starContainer = scene.add.container(0, 0);
        
        // Set depth to ensure stars are behind everything else
        starContainer.setDepth(-100 + layer);
        
        // Store the parallax factor - deeper layers move slower
        const parallaxFactor = 0.02 + (layer * 0.025);
        
        // Generate random stars for this layer
        for (let i = 0; i < starsPerLayer; i++) {
            // Calculate random position covering an area larger than the world bounds
            // to ensure stars are visible when camera moves
            const worldSize = WORLD ? WORLD.size : 10000;
            const padding = worldSize * 0.3;
            const x = Phaser.Math.Between(-worldSize/2 - padding, worldSize/2 + padding);
            const y = Phaser.Math.Between(-worldSize/2 - padding, worldSize/2 + padding);
            
            // Vary star size and brightness based on layer
            const size = 1 + layer * 0.5;
            const alpha = 0.3 + (layer * 0.3);
            
            // Create star as a small circle
            const star = scene.add.circle(x, y, size, 0xffffff, alpha);
            
            // Add star to the container
            starContainer.add(star);
        }
        
        // Store the layer with its parallax factor
        starfieldLayers.push({
            container: starContainer,
            parallaxFactor: parallaxFactor
        });
    }
    
    // Store the starfield layers in the scene for access in update
    scene.starfieldLayers = starfieldLayers;
}

// Update game state
function update(time, delta) {
    if (!localPlayer || !socket || !PHYSICS) return;

    // Handle player input
    const input = {
        isThrusting: false,
        angle: localPlayer.angle,
        isShooting: false,
        sequenceNumber: inputSequenceNumber++ // Add sequence number to track inputs
    };
    
    // Check keyboard input (arrows and WASD)
    if (cursors.up.isDown || wasdKeys.up.isDown) {
        input.isThrusting = true;
        localPlayer.isThrusting = true;
    } else {
        localPlayer.isThrusting = false;
    }

    if (cursors.left.isDown || wasdKeys.left.isDown) {
        input.angle = localPlayer.angle -= 4;
    } else if (cursors.right.isDown || wasdKeys.right.isDown) {
        input.angle = localPlayer.angle += 4;
    }

    if (cursors.space.isDown || shiftKey.isDown) {
        input.isShooting = true;
    }
    
    // Check mobile controls if they exist
    if (mobileControls) {
        // Handle thrust
        if (mobileControls.thrust.isDown) {
            input.isThrusting = true;
            localPlayer.isThrusting = true;
        }
        
        // Handle rotation
        if (mobileControls.left.isDown) {
            input.angle = localPlayer.angle -= 4;
        } else if (mobileControls.right.isDown) {
            input.angle = localPlayer.angle += 4;
        }
        
        // Handle shooting
        if (mobileControls.shoot.isDown) {
            input.isShooting = true;
        }
    }
    
    // Visual feedback for shooting attempt
    if (input.isShooting && !localPlayer.getData('isInvulnerable')) {
        const now = time;
        const lastShot = localPlayer.getData('lastShot') || 0;
        const cooldown = GAME?.shootCooldown || 500;
        
        if (now - lastShot > cooldown) {
            localPlayer.setData('lastShot', now);
            // Flash the player briefly to indicate shooting attempt
            localPlayer.setTint(0xffff00);
            setTimeout(() => localPlayer.clearTint(), 50);
        }
    }

    // Apply input locally for immediate feedback
    applyInput(localPlayer, input);
    
    // Save this input for later reconciliation
    pendingInputs.push(input);
    
    // Send input to server
    socket.emit('playerInput', input);

    // Update camera
    updateMultiplayerCamera();
    
    // Update player name positions
    if (playerNameTexts[socket.id]) {
        playerNameTexts[socket.id].x = localPlayer.x;
        playerNameTexts[socket.id].y = localPlayer.y + 30;
    }
    
    Object.values(otherPlayers).forEach(player => {
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

    // Update starfield parallax effect
    if (scene.starfieldLayers && mainCamera) {
        scene.starfieldLayers.forEach(layer => {
            // Move stars based on camera position and parallax factor
            layer.container.x = -mainCamera.scrollX * layer.parallaxFactor;
            layer.container.y = -mainCamera.scrollY * layer.parallaxFactor;
        });
    }
}

function updateMultiplayerCamera() {
    if (!localPlayer || !mainCamera) return;

    // Default to focusing on the player with a zoomed-out view
    let targetX = localPlayer.x;
    let targetY = localPlayer.y;
    let newTargetZoom = minZoom; // Start with the most zoomed out view
    
    // Find nearby players (within a certain distance)
    const nearbyPlayers = [];
    const detectionRadius = 600; // How far to detect other players for zoom-in
    
    Object.values(otherPlayers).forEach(player => {
        const distance = Phaser.Math.Distance.Between(localPlayer.x, localPlayer.y, player.x, player.y);
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
        let minX = localPlayer.x;
        let minY = localPlayer.y;
        let maxX = localPlayer.x;
        let maxY = localPlayer.y;

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
        targetX = localPlayer.x * 0.7 + centerX * 0.3;
        targetY = localPlayer.y * 0.7 + centerY * 0.3;
        
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

// Improved planet rendering function using sprites
function createPlanetGraphics(scene, planet) {
    // Create a container for the planet
    const container = scene.add.container(0, 0);
    container.setDepth(-10); // Ensure planets are behind ships

    // Dynamically determine the planet type for sprite loading
    const planetType = planet.planetType || 'planet-fallback'; // Use planetType from planet data, fallback if missing

    // Load planet sprite
    const planetSpriteKey = `planet-${planetType}`;

    // Check if planet sprite is already loaded, if not, load it
    if (!scene.textures.exists(planetSpriteKey)) {
        scene.load.image(planetSpriteKey, `assets/planets/planet-${planetType}.png`);
        scene.load.start(); // Need to start the loader if we add new files
        scene.load.once('complete', () => {
            // After loading, create sprites
            createPlanetSprites(scene, container, planet, planetSpriteKey);
        });
        // Use fallback texture temporarily
        const planetSprite = scene.add.sprite(0, 0, 'planet-fallback');
        container.add(planetSprite);
        return container; // Return container immediately, sprites will be added later
    } else {
        // If already loaded, create sprites directly
        createPlanetSprites(scene, container, planet, planetSpriteKey);
        return container;
    }
}

function createPlanetSprites(scene, container, planet, planetSpriteKey) {
    // Create planet sprite - add to container first so glow is on top
    const planetSprite = scene.add.sprite(0, 0, planetSpriteKey);
    planetSprite.setScale(planet.radius / (planetSprite.width / 2)); // Scale planet based on planet radius
    container.add(planetSprite);

    // Create dynamic glow based on ownership instead of using a sprite
    const glowGraphics = scene.add.graphics();
    
    // Determine glow color based on ownership
    let glowColor = 0xFFFFFF; // Default white glow for unclaimed planets
    let glowAlpha = 0.0;      // Default alpha for unclaimed planets
    
    if (planet.ownerId) {
        // Use the owner's color for the glow
        glowColor = planet.color || 0xFFFFFF;
        glowAlpha = 0.3; // Stronger glow for claimed planets
    }
    
    // Draw the glow as a gradient circle
    const glowRadius = planet.radius * 1.5; // Larger than the planet
    
    // Create a radial gradient for the glow
    glowGraphics.clear();
    
    // Draw outer glow (more transparent)
    glowGraphics.fillStyle(glowColor, glowAlpha * 0.3);
    glowGraphics.fillCircle(0, 0, glowRadius);
    
    // Draw inner glow (more opaque)
    glowGraphics.fillStyle(glowColor, glowAlpha * 0.7);
    glowGraphics.fillCircle(0, 0, glowRadius * 0.7);
    
    // Set blend mode for glow effect
    glowGraphics.setBlendMode(Phaser.BlendModes.ADD);
    glowGraphics.setDepth(1); // Set depth to render on top
    container.add(glowGraphics);

    // Add owner name text - on top of planet
    if (planet.ownerId) {
        // Find the player who owns this planet
        let ownerName = "Unknown";
        
        // Check if it's the local player's planet
        if (localPlayer && planet.ownerId === socket.id) {
            ownerName = playerName || "You";
        } 
        // Check if it's another player's planet
        else if (otherPlayers[planet.ownerId]) {
            ownerName = otherPlayers[planet.ownerId].name || otherPlayers[planet.ownerId].name.substring(0, 4);
        }
        
        // Create text for the owner name
        const nameText = scene.add.text(0, planet.radius + 15, ownerName, {
            fontSize: '16px',
            fontFamily: 'Arial',
            color: '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 2,
            align: 'center'
        });
        nameText.setOrigin(0.5, 0);
        
        // Add the name text to the container
        container.add(nameText);
    }
}

// Improve the renderPlanets function with better error handling
function renderPlanets() {
    // Clear existing planet graphics with proper error handling
    if (planetGraphics) {
        if (Array.isArray(planetGraphics)) {
            planetGraphics.forEach(g => {
                if (g) {
                    g.destroy();
                }
            });
        } else {
            console.warn('planetGraphics is not an array, resetting it');
        }
    }
    
    // Always reinitialize as an array
    planetGraphics = [];
    
    // Create new planet graphics with error handling
    Object.values(planets).forEach(planet => {
        try {
            if (!planet) {
                return;
            }
            
            const container = createPlanetGraphics(scene, planet);
            container.x = planet.x;
            container.y = planet.y;
            planetGraphics.push(container);
        } catch (error) {
            console.error(`Error rendering planet ${planet?.id}:`, error);
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

// Helper function to detect touch devices
function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

// Create mobile controls
function createMobileControls() {
    // Create a container for mobile controls
    const mobileControlsContainer = document.createElement('div');
    mobileControlsContainer.id = 'mobile-controls';
    document.body.appendChild(mobileControlsContainer);
    
    // Create left control pad (for steering)
    const leftPad = document.createElement('div');
    leftPad.id = 'left-control-pad';
    mobileControlsContainer.appendChild(leftPad);
    
    // Create left button
    const leftButton = document.createElement('button');
    leftButton.id = 'left-button';
    leftButton.innerHTML = '◀';
    leftPad.appendChild(leftButton);
    
    // Create right button
    const rightButton = document.createElement('button');
    rightButton.id = 'right-button';
    rightButton.innerHTML = '▶';
    leftPad.appendChild(rightButton);
    
    // Create right control pad (for thrust and shoot)
    const rightPad = document.createElement('div');
    rightPad.id = 'right-control-pad';
    mobileControlsContainer.appendChild(rightPad);
    
    // Create thrust button
    const thrustButton = document.createElement('button');
    thrustButton.id = 'thrust-button';
    thrustButton.innerHTML = '▲';
    rightPad.appendChild(thrustButton);
    
    // Create shoot button
    const shootButton = document.createElement('button');
    shootButton.id = 'shoot-button';
    shootButton.innerHTML = '🔥';
    rightPad.appendChild(shootButton);
    
    // Initialize mobile controls object
    mobileControls = {
        left: { isDown: false },
        right: { isDown: false },
        thrust: { isDown: false },
        shoot: { isDown: false }
    };
    
    // Add event listeners for touch controls
    
    // Left button
    leftButton.addEventListener('touchstart', function(e) {
        e.preventDefault();
        mobileControls.left.isDown = true;
    });
    
    leftButton.addEventListener('touchend', function(e) {
        e.preventDefault();
        mobileControls.left.isDown = false;
    });
    
    // Right button
    rightButton.addEventListener('touchstart', function(e) {
        e.preventDefault();
        mobileControls.right.isDown = true;
    });
    
    rightButton.addEventListener('touchend', function(e) {
        e.preventDefault();
        mobileControls.right.isDown = false;
    });
    
    // Thrust button
    thrustButton.addEventListener('touchstart', function(e) {
        e.preventDefault();
        mobileControls.thrust.isDown = true;
    });
    
    thrustButton.addEventListener('touchend', function(e) {
        e.preventDefault();
        mobileControls.thrust.isDown = false;
    });
    
    // Shoot button
    shootButton.addEventListener('touchstart', function(e) {
        e.preventDefault();
        mobileControls.shoot.isDown = true;
    });
    
    shootButton.addEventListener('touchend', function(e) {
        e.preventDefault();
        mobileControls.shoot.isDown = false;
    });
    
    // Handle multi-touch by tracking all active touches
    const activeTouches = {};
    
    document.addEventListener('touchstart', function(e) {
        // Store each touch and check what element it's over
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            
            if (element && element.id) {
                activeTouches[touch.identifier] = element.id;
                
                // Set the appropriate control based on the element
                if (element.id === 'left-button') mobileControls.left.isDown = true;
                if (element.id === 'right-button') mobileControls.right.isDown = true;
                if (element.id === 'thrust-button') mobileControls.thrust.isDown = true;
                if (element.id === 'shoot-button') mobileControls.shoot.isDown = true;
            }
        }
    });
    
    document.addEventListener('touchmove', function(e) {
        // Update each touch as it moves
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            
            // If this touch was previously over a control button
            if (activeTouches[touch.identifier]) {
                // If it moved off its original element, turn that control off
                if (!element || element.id !== activeTouches[touch.identifier]) {
                    const oldElementId = activeTouches[touch.identifier];
                    if (oldElementId === 'left-button') mobileControls.left.isDown = false;
                    if (oldElementId === 'right-button') mobileControls.right.isDown = false;
                    if (oldElementId === 'thrust-button') mobileControls.thrust.isDown = false;
                    if (oldElementId === 'shoot-button') mobileControls.shoot.isDown = false;
                    
                    // Update or remove the touch tracking
                    if (element && element.id) {
                        activeTouches[touch.identifier] = element.id;
                        // Set the new control
                        if (element.id === 'left-button') mobileControls.left.isDown = true;
                        if (element.id === 'right-button') mobileControls.right.isDown = true;
                        if (element.id === 'thrust-button') mobileControls.thrust.isDown = true;
                        if (element.id === 'shoot-button') mobileControls.shoot.isDown = true;
                    } else {
                        delete activeTouches[touch.identifier];
                    }
                }
            } 
            // If the touch moved onto a control button
            else if (element && element.id) {
                activeTouches[touch.identifier] = element.id;
                // Set the appropriate control
                if (element.id === 'left-button') mobileControls.left.isDown = true;
                if (element.id === 'right-button') mobileControls.right.isDown = true;
                if (element.id === 'thrust-button') mobileControls.thrust.isDown = true;
                if (element.id === 'shoot-button') mobileControls.shoot.isDown = true;
            }
        }
    });
    
    document.addEventListener('touchend', function(e) {
        // Handle touch end events
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            
            // If this touch was over a control button
            if (activeTouches[touch.identifier]) {
                const elementId = activeTouches[touch.identifier];
                
                // Turn off the corresponding control
                if (elementId === 'left-button') mobileControls.left.isDown = false;
                if (elementId === 'right-button') mobileControls.right.isDown = false;
                if (elementId === 'thrust-button') mobileControls.thrust.isDown = false;
                if (elementId === 'shoot-button') mobileControls.shoot.isDown = false;
                
                // Remove this touch from tracking
                delete activeTouches[touch.identifier];
            }
        }
    });
    
    // Also handle touchcancel events
    document.addEventListener('touchcancel', function(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            
            // If this touch was over a control button
            if (activeTouches[touch.identifier]) {
                const elementId = activeTouches[touch.identifier];
                
                // Turn off the corresponding control
                if (elementId === 'left-button') mobileControls.left.isDown = false;
                if (elementId === 'right-button') mobileControls.right.isDown = false;
                if (elementId === 'thrust-button') mobileControls.thrust.isDown = false;
                if (elementId === 'shoot-button') mobileControls.shoot.isDown = false;
                
                // Remove this touch from tracking
                delete activeTouches[touch.identifier];
            }
        }
    });
    
    console.log('Mobile controls initialized with multi-touch support');
} 