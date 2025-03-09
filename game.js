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

// Game variables
let player1;
let player2;
let player1Score = 0;
let player2Score = 0;
let player1ScoreText;
let player2ScoreText;
let player1Bullets;
let player2Bullets;
let player1Shield;
let player2Shield;
let cursors;
let wasdKeys;
let shootKey1;
let shootKey2;
let shootSound;
let explosionSound;
let respawnSound;
let debugText;
let player1Thruster;
let player2Thruster;

// Physics variables
const thrustPower = 5.8;  // Acceleration per frame when thrusting
const maxSpeed = 500;        // Maximum velocity
const drag = 0.99;         // Drag coefficient (0.99 = 1% slowdown per frame)

// Camera variables
let mainCamera;
let targetZoom = 1;
let currentZoom = 1;
let zoomSpeed = 0.05;
let minZoom = 0.5;
let maxZoom = 2;
let cameraMargin = 150; // Increased margin to keep around players
let maxPlayerDistance = 1200; // Reduced maximum distance players can get from each other

// Infinite world size (much larger than visible area)
const WORLD_SIZE = 10000;

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
    this.physics.world.setBounds(-WORLD_SIZE/2, -WORLD_SIZE/2, WORLD_SIZE, WORLD_SIZE);
    
    // Set up the main camera
    mainCamera = this.cameras.main;
    mainCamera.setBackgroundColor('#000000');
    
    // Create a grid background to visualize the infinite world
    createGridBackground(this);
    
    // Create bullet graphics
    const bulletGraphics = this.add.graphics();
    bulletGraphics.lineStyle(1, 0xffff00);
    bulletGraphics.fillStyle(0xffff00);
    bulletGraphics.beginPath();
    bulletGraphics.arc(0, 0, 3, 0, Math.PI * 2);
    bulletGraphics.closePath();
    bulletGraphics.strokePath();
    bulletGraphics.fillPath();
    bulletGraphics.generateTexture('bullet_yellow', 6, 6);
    
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

    // Set up initial player positions with randomness
    // Random distance between 350 and 450 units between players
    const startingDistance = 350 + Math.random() * 100;
    
    // Random angle for the axis between players
    const axisAngle = Math.random() * Math.PI * 2;
    
    // Calculate positions based on the random angle and distance
    const player1X = -Math.cos(axisAngle) * (startingDistance / 2);
    const player1Y = -Math.sin(axisAngle) * (startingDistance / 2);
    const player1Angle = Phaser.Math.RadToDeg(axisAngle); // Face toward player 2
    
    const player2X = Math.cos(axisAngle) * (startingDistance / 2);
    const player2Y = Math.sin(axisAngle) * (startingDistance / 2);
    const player2Angle = Phaser.Math.RadToDeg(axisAngle) + 180; // Face toward player 1

    // Create player ships using the new function
    player1 = createPlayerTriangle(this, player1X, player1Y, 0x0000ff, player1Angle);
    player2 = createPlayerTriangle(this, player2X, player2Y, 0xff0000, player2Angle);
    
    // Create bullet groups
    player1Bullets = this.physics.add.group({
        defaultKey: 'bullet_yellow',
        maxSize: 10
    });

    player2Bullets = this.physics.add.group({
        defaultKey: 'bullet_yellow',
        maxSize: 10
    });

    // Initialize shields
    player1Shield = this.add.image(player1.x, player1.y, 'shield');
    player1Shield.setScale(1.5);
    player1Shield.setAlpha(0.5);
    player1Shield.visible = false;

    player2Shield = this.add.image(player2.x, player2.y, 'shield');
    player2Shield.setScale(1.5);
    player2Shield.setAlpha(0.5);
    player2Shield.visible = false;

    // Store scene reference for later use
    this.gameScene = this;

    // Set up collision detection
    this.physics.add.overlap(player1Bullets, player2, bulletHitPlayer2, null, this);
    this.physics.add.overlap(player2Bullets, player1, bulletHitPlayer1, null, this);

    // Set up input controls
    cursors = this.input.keyboard.createCursorKeys();
    
    // WASD keys for player 2
    wasdKeys = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    
    // Shoot keys
    shootKey1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    shootKey2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    
    // Create UI elements
    createUI(this);
    
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
function update(time) {
    // Safety check - ensure players are visible
    if (!player1.visible) {
        player1.visible = true;
        player1.alpha = 1;
        if (DEBUG_MODE && debugText) {
            debugText.setText('Debug: Fixed player1 visibility');
        }
    }
    
    if (!player2.visible) {
        player2.visible = true;
        player2.alpha = 1;
        if (DEBUG_MODE && debugText) {
            debugText.setText('Debug: Fixed player2 visibility');
        }
    }

    // Player 1 controls (arrow keys)
    // Reset thruster state
    player1.isThrusting = false;
    
    if (cursors.up.isDown) {
        // Apply thrust in the direction the player is facing
        applyThrust(player1);
        player1.isThrusting = true;
    }

    if (cursors.left.isDown) {
        // Turn left
        player1.body.angularVelocity = -150;
    } else if (cursors.right.isDown) {
        // Turn right
        player1.body.angularVelocity = 150;
    } else {
        // Stop rotation
        player1.body.angularVelocity = 0;
    }

    // Player 2 controls (WASD)
    // Reset thruster state
    player2.isThrusting = false;
    
    if (wasdKeys.up.isDown) {
        // Apply thrust in the direction the player is facing
        applyThrust(player2);
        player2.isThrusting = true;
    }

    if (wasdKeys.left.isDown) {
        // Turn left
        player2.body.angularVelocity = -150;
    } else if (wasdKeys.right.isDown) {
        // Turn right
        player2.body.angularVelocity = 150;
    } else {
        // Stop rotation
        player2.body.angularVelocity = 0;
    }

    // Enforce maximum distance between players
    enforceMaxDistance();

    // Update shield positions if they exist
    if (player1Shield && player1Shield.visible) {
        player1Shield.x = player1.x;
        player1Shield.y = player1.y;
        player1Shield.rotation += 0.02;
    }

    if (player2Shield && player2Shield.visible) {
        player2Shield.x = player2.x;
        player2Shield.y = player2.y;
        player2Shield.rotation += 0.02;
    }

    // Handle shooting
    if (Phaser.Input.Keyboard.JustDown(shootKey1) && time > player1.getData('lastShot') + 500) {
        shootBullet(player1, player1Bullets, time);
    }

    if (Phaser.Input.Keyboard.JustDown(shootKey2) && time > player2.getData('lastShot') + 500) {
        shootBullet(player2, player2Bullets, time);
    }

    // Update bullet positions and remove bullets that are too far from both players
    const maxBulletDistance = 2000; // Maximum distance a bullet can travel before being removed
    
    player1Bullets.getChildren().forEach(bullet => {
        if (bullet.active) {
            // Calculate distance from both players
            const distToPlayer1 = Phaser.Math.Distance.Between(bullet.x, bullet.y, player1.x, player1.y);
            const distToPlayer2 = Phaser.Math.Distance.Between(bullet.x, bullet.y, player2.x, player2.y);
            
            // If bullet is too far from both players, remove it
            if (distToPlayer1 > maxBulletDistance && distToPlayer2 > maxBulletDistance) {
                bullet.setActive(false);
                bullet.setVisible(false);
            }
        }
    });

    player2Bullets.getChildren().forEach(bullet => {
        if (bullet.active) {
            // Calculate distance from both players
            const distToPlayer1 = Phaser.Math.Distance.Between(bullet.x, bullet.y, player1.x, player1.y);
            const distToPlayer2 = Phaser.Math.Distance.Between(bullet.x, bullet.y, player2.x, player2.y);
            
            // If bullet is too far from both players, remove it
            if (distToPlayer1 > maxBulletDistance && distToPlayer2 > maxBulletDistance) {
                bullet.setActive(false);
                bullet.setVisible(false);
            }
        }
    });

    // Update camera position and zoom
    updateCamera();
}

// Apply thrust to a player in the direction they're facing
function applyThrust(player) {
    // Get the angle the player is facing in radians
    const angleRad = Phaser.Math.DegToRad(player.angle);
    
    // Calculate the thrust vector components
    const thrustX = Math.cos(angleRad) * thrustPower;
    const thrustY = Math.sin(angleRad) * thrustPower;
    
    // Apply the thrust to the player's velocity
    player.body.velocity.x += thrustX;
    player.body.velocity.y += thrustY;
    
    // Ensure the player doesn't exceed maximum speed
    const currentSpeed = Math.sqrt(player.body.velocity.x * player.body.velocity.x + 
                                  player.body.velocity.y * player.body.velocity.y);
    
    if (currentSpeed > maxSpeed) {
        // Scale down the velocity to the maximum speed
        const scale = maxSpeed / currentSpeed;
        player.body.velocity.x *= scale;
        player.body.velocity.y *= scale;
    }
}

// Enforce maximum distance between players
function enforceMaxDistance() {
    // Calculate the distance between the two players
    const dx = player2.x - player1.x;
    const dy = player2.y - player1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > maxPlayerDistance) {
        // Calculate the unit vector from player1 to player2
        const unitX = dx / distance;
        const unitY = dy / distance;
        
        // Calculate how much we need to move each player
        const moveDistance = (distance - maxPlayerDistance) / 2;
        
        // Move player1 toward player2
        player1.x += unitX * moveDistance;
        player1.y += unitY * moveDistance;
        
        // Move player2 toward player1
        player2.x -= unitX * moveDistance;
        player2.y -= unitY * moveDistance;
        
        // Apply a velocity reduction to simulate elastic collision
        const reductionFactor = 0.8;
        
        // Calculate the dot product of velocity and direction vector for each player
        const dot1 = player1.body.velocity.x * unitX + player1.body.velocity.y * unitY;
        const dot2 = player2.body.velocity.x * -unitX + player2.body.velocity.y * -unitY;
        
        // If players are moving away from each other, reduce that component of velocity
        if (dot1 > 0) {
            player1.body.velocity.x -= unitX * dot1 * reductionFactor;
            player1.body.velocity.y -= unitY * dot1 * reductionFactor;
        }
        
        if (dot2 > 0) {
            player2.body.velocity.x += unitX * dot2 * reductionFactor;
            player2.body.velocity.y += unitY * dot2 * reductionFactor;
        }
    }
}

// Helper function to shoot a bullet
function shootBullet(player, bulletGroup, time) {
    // Don't allow shooting if player is invulnerable
    if (player.getData('isInvulnerable')) {
        return;
    }

    const bullet = bulletGroup.get();
    
    if (bullet) {
        // Play shoot sound
        shootSound.play({ volume: 0.5 });
        
        // Get the angle the player is facing in radians
        const angleRad = Phaser.Math.DegToRad(player.angle);
        
        // Calculate the position at the tip of the triangle
        // The tip offset is rotated based on the ship's current angle
        const tipX = Math.cos(angleRad) * player.tipOffset.x - Math.sin(angleRad) * player.tipOffset.y;
        const tipY = Math.sin(angleRad) * player.tipOffset.x + Math.cos(angleRad) * player.tipOffset.y;
        
        // Set bullet position at the tip of the triangle
        bullet.setPosition(player.x + tipX, player.y + tipY);
        bullet.setActive(true);
        bullet.setVisible(true);
        
        // Set bullet velocity (faster than the player's max speed)
        bullet.setVelocity(
            Math.cos(angleRad) * 300 + player.body.velocity.x * 0.5,
            Math.sin(angleRad) * 300 + player.body.velocity.y * 0.5
        );
        
        // Set cooldown for shooting
        player.setData('lastShot', time);
    }
}

// Collision handler for player 2 getting hit
function bulletHitPlayer2(bullet, player) {
    // Ignore if player is invulnerable
    if (player.getData('isInvulnerable')) {
        // Destroy the bullet to prevent multiple hits
        bullet.setActive(false);
        bullet.setVisible(false);
        return;
    }
    
    // Play explosion sound
    explosionSound.play({ volume: 0.5 });
    
    // Increment score for player 1
    player1Score++;
    player1ScoreText.setText('Blue: ' + player1Score);
    
    // Destroy the bullet
    bullet.setActive(false);
    bullet.setVisible(false);
    
    // Respawn player 2 - use player2 reference, not the parameter
    // Pass null values for position and angle to ensure they're calculated randomly
    respawnPlayer(player2, null, null, null);
}

// Collision handler for player 1 getting hit
function bulletHitPlayer1(bullet, player) {
    // Ignore if player is invulnerable
    if (player.getData('isInvulnerable')) {
        // Destroy the bullet to prevent multiple hits
        bullet.setActive(false);
        bullet.setVisible(false);
        return;
    }
    
    // Play explosion sound
    explosionSound.play({ volume: 0.5 });
    
    // Increment score for player 2
    player2Score++;
    player2ScoreText.setText('Red: ' + player2Score);
    
    // Destroy the bullet
    bullet.setActive(false);
    bullet.setVisible(false);
    
    // Respawn player 1 - use player1 reference, not the parameter
    // Pass null values for position and angle to ensure they're calculated randomly
    respawnPlayer(player1, null, null, null);
}

// Helper function to respawn a player
function respawnPlayer(player, x, y, angle) {
    // Set player as invulnerable temporarily
    player.setData('isInvulnerable', true);
    
    // Play respawn sound
    respawnSound.play({ volume: 0.5 });
    
    // Get the other player
    const otherPlayer = (player === player1) ? player2 : player1;
    
    // Calculate respawn position with randomness
    // Random distance between 300 and 600 units from the other player
    const minDistance = 300;
    const maxDistance = 600;
    const respawnDistance = minDistance + Math.random() * (maxDistance - minDistance);
    
    // Random angle for respawn position (ensure it's truly random each time)
    const respawnAngle = Math.random() * Math.PI * 2;
    
    // Calculate new position based on other player's position
    x = otherPlayer.x + Math.cos(respawnAngle) * respawnDistance;
    y = otherPlayer.y + Math.sin(respawnAngle) * respawnDistance;
    
    // Random starting angle (facing roughly toward the other player, but with some variation)
    // Calculate angle toward other player
    const angleToOther = Math.atan2(otherPlayer.y - y, otherPlayer.x - x);
    
    // Add some random variation (-45 to +45 degrees)
    const angleVariation = (Math.random() * 90 - 45) * (Math.PI / 180);
    angle = Phaser.Math.RadToDeg(angleToOther + angleVariation);
    
    // Log respawn details for debugging
    if (DEBUG_MODE && debugText) {
        console.log(`Respawning ${player === player1 ? 'P1' : 'P2'} at distance: ${respawnDistance.toFixed(0)}, angle: ${respawnAngle.toFixed(2)}, pos: ${x.toFixed(0)},${y.toFixed(0)}`);
    }
    
    // Reset position and properties
    player.x = x;
    player.y = y;
    player.angle = angle;
    player.body.velocity.x = 0;
    player.body.velocity.y = 0;
    player.body.angularVelocity = 0;
    player.isThrusting = false;
    
    // Ensure player is visible
    player.visible = true;
    player.alpha = 1;
    
    // Get the appropriate shield
    let shield = (player === player1) ? player1Shield : player2Shield;
    
    // Make sure shield is visible and positioned correctly
    shield.visible = true;
    shield.x = player.x;
    shield.y = player.y;
    shield.alpha = 0.7;
    shield.setScale(1.5);
    
    // Stop any existing tweens on the shield and player
    player.scene.tweens.killTweensOf(shield);
    player.scene.tweens.killTweensOf(player);
    
    // Create shield pulsing effect
    player.scene.tweens.add({
        targets: shield,
        alpha: { from: 0.7, to: 0.3 },
        scale: { from: 1.3, to: 1.7 },
        duration: 500,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: 5
    });
    
    // Create simple blink effect for player instead of alpha tween
    let blinkCount = 0;
    const maxBlinks = 6;
    
    // Create a timer event for blinking
    const blinkEvent = player.scene.time.addEvent({
        delay: 200,
        callback: function() {
            // Toggle alpha between 0.5 and 1 for blink effect
            player.alpha = player.alpha === 1 ? 0.5 : 1;
            blinkCount++;
            
            // When blinking is done
            if (blinkCount >= maxBlinks) {
                // Clear the timer
                blinkEvent.remove();
                
                // Ensure player is fully visible
                player.alpha = 1;
                
                // Create a fade out effect for the shield
                player.scene.tweens.add({
                    targets: shield,
                    alpha: 0,
                    scale: 2,
                    duration: 500,
                    ease: 'Power2',
                    onComplete: function() {
                        // Hide shield and remove invulnerability when fade completes
                        shield.visible = false;
                        player.setData('isInvulnerable', false);
                        
                        if (DEBUG_MODE && debugText) {
                            debugText.setText(`Debug: Shield fade complete for ${player === player1 ? 'P1' : 'P2'}`);
                        }
                    }
                });
            }
        },
        callbackScope: this,
        loop: true
    });
}

// Calculate the optimal zoom level based on player positions
function calculateOptimalZoom() {
    // Calculate the distance between the two players
    const dx = player2.x - player1.x;
    const dy = player2.y - player1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Get the current viewport dimensions from the game
    const viewportWidth = game.scale.gameSize.width;
    const viewportHeight = game.scale.gameSize.height;
    
    // Calculate the aspect ratio
    const aspectRatio = viewportWidth / viewportHeight;
    
    // Calculate the diagonal of the viewport
    const viewportDiagonal = Math.sqrt(viewportWidth * viewportWidth + viewportHeight * viewportHeight);
    
    // Calculate the player spread in both dimensions
    const playerSpreadX = Math.abs(dx);
    const playerSpreadY = Math.abs(dy);
    
    // Calculate the player diagonal spread
    const playerDiagonal = Math.sqrt(playerSpreadX * playerSpreadX + playerSpreadY * playerSpreadY);
    
    // Calculate zoom based on the diagonal with margin
    let newZoom = viewportDiagonal / (playerDiagonal + cameraMargin * 2);
    
    // Add a safety factor to ensure players are always visible
    newZoom *= 0.9;
    
    // Clamp the zoom level to min and max values
    newZoom = Phaser.Math.Clamp(newZoom, minZoom, maxZoom);
    
    return newZoom;
}

// Update camera position and zoom
function updateCamera() {
    if (!player1 || !player2 || !mainCamera) return;
    
    // Calculate the midpoint between the two players
    const midX = (player1.x + player2.x) / 2;
    const midY = (player1.y + player2.y) / 2;
    
    // Calculate the optimal zoom level
    targetZoom = calculateOptimalZoom();
    
    // Increase zoom speed when zooming out (to prevent players from going off-screen)
    // but keep it slower when zooming in (for smoother visuals)
    const adaptiveZoomSpeed = targetZoom < currentZoom ? zoomSpeed * 2 : zoomSpeed;
    
    // Smoothly interpolate current zoom towards target zoom
    currentZoom = Phaser.Math.Linear(currentZoom, targetZoom, adaptiveZoomSpeed);
    
    // Update camera position and zoom
    // Use a shorter duration for panning when players are far apart
    const panDuration = 100;
    mainCamera.pan(midX, midY, panDuration, 'Linear', true);
    mainCamera.zoomTo(currentZoom, 100);
    
    if (DEBUG_MODE && debugText) {
        const distance = Math.sqrt(Math.pow(player2.x - player1.x, 2) + Math.pow(player2.y - player1.y, 2));
        debugText.setText(`Debug: Zoom: ${currentZoom.toFixed(2)}, Distance: ${distance.toFixed(0)}`);
        // Make sure debug text follows the camera
        debugText.setScrollFactor(0);
        player1ScoreText.setScrollFactor(0);
        player2ScoreText.setScrollFactor(0);
    }
}

// Create UI elements
function createUI(scene) {
    // Get the current game size
    const width = game.scale.gameSize.width;
    const height = game.scale.gameSize.height;
    
    // Create score text - position based on viewport size
    player1ScoreText = scene.add.text(20, 20, 'Blue: 0', { 
        fontSize: '24px', 
        fill: '#0000FF',
        stroke: '#000000',
        strokeThickness: 2
    });
    
    // Position player 2 score at the right side of the screen
    player2ScoreText = scene.add.text(width - 120, 20, 'Red: 0', { 
        fontSize: '24px', 
        fill: '#FF0000',
        stroke: '#000000',
        strokeThickness: 2
    });
    
    // Fix UI elements to the camera (won't move when camera pans)
    player1ScoreText.setScrollFactor(0);
    player2ScoreText.setScrollFactor(0);
    
    // Create debug text if in debug mode - position at bottom of screen
    if (DEBUG_MODE) {
        debugText = scene.add.text(20, height - 50, 'Debug: Game started', { 
            fontSize: '16px', 
            fill: '#00FF00',
            stroke: '#000000',
            strokeThickness: 1
        });
        debugText.setScrollFactor(0);
    }
    
    // Handle game resize events
    scene.scale.on('resize', function(gameSize) {
        // Get the new width and height
        const width = gameSize.width;
        const height = gameSize.height;
        
        // Reposition player 2 score
        player2ScoreText.setPosition(width - 120, 20);
        
        // Reposition debug text if it exists
        if (debugText) {
            debugText.setPosition(20, height - 50);
        }
        
        // Update camera bounds if needed
        if (mainCamera) {
            // Recalculate zoom to ensure players are visible with new dimensions
            targetZoom = calculateOptimalZoom();
            currentZoom = targetZoom;
            mainCamera.zoomTo(currentZoom, 0);
        }
    });
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
    ship.body.setDrag(drag);
    ship.body.setMaxVelocity(maxSpeed, maxSpeed);
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