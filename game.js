// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
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
    backgroundColor: '#000000'
};

// Debug flag - set to true to enable debug features
const DEBUG_MODE = true;

// Initialize the game
const game = new Phaser.Game(config);

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
let resetKey;
let shootSound;
let explosionSound;
let respawnSound;
let debugText;
let player1Crosshair;
let player2Crosshair;
let player1Indicator;
let player2Indicator;

// Camera variables
let mainCamera;
let targetZoom = 1;
let currentZoom = 1;
let zoomSpeed = 0.05;
let minZoom = 0.5;
let maxZoom = 2;
let cameraMargin = 100; // Margin to keep around players

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
    
    // Create triangle graphics for players
    const triangleGraphics = this.add.graphics();
    
    // Player 1 (blue triangle)
    triangleGraphics.clear();
    triangleGraphics.lineStyle(2, 0xffffff);
    triangleGraphics.fillStyle(0x0000ff);
    triangleGraphics.beginPath();
    triangleGraphics.moveTo(0, -20);  // Point at top
    triangleGraphics.lineTo(15, 20);  // Bottom right
    triangleGraphics.lineTo(-15, 20); // Bottom left
    triangleGraphics.closePath();
    triangleGraphics.strokePath();
    triangleGraphics.fillPath();
    triangleGraphics.generateTexture('player1_triangle', 30, 40);
    
    // Player 2 (red triangle)
    triangleGraphics.clear();
    triangleGraphics.lineStyle(2, 0xffffff);
    triangleGraphics.fillStyle(0xff0000);
    triangleGraphics.beginPath();
    triangleGraphics.moveTo(0, -20);  // Point at top
    triangleGraphics.lineTo(15, 20);  // Bottom right
    triangleGraphics.lineTo(-15, 20); // Bottom left
    triangleGraphics.closePath();
    triangleGraphics.strokePath();
    triangleGraphics.fillPath();
    triangleGraphics.generateTexture('player2_triangle', 30, 40);
    
    // Create bullet graphics
    triangleGraphics.clear();
    triangleGraphics.lineStyle(1, 0xffff00);
    triangleGraphics.fillStyle(0xffff00);
    triangleGraphics.beginPath();
    triangleGraphics.arc(0, 0, 3, 0, Math.PI * 2);
    triangleGraphics.closePath();
    triangleGraphics.strokePath();
    triangleGraphics.fillPath();
    triangleGraphics.generateTexture('bullet_yellow', 6, 6);
    
    // Create shield graphics
    triangleGraphics.clear();
    triangleGraphics.lineStyle(2, 0x00ffff, 0.5);
    triangleGraphics.beginPath();
    triangleGraphics.arc(0, 0, 20, 0, Math.PI * 2);
    triangleGraphics.closePath();
    triangleGraphics.strokePath();
    triangleGraphics.generateTexture('shield', 40, 40);
    
    // Create crosshair graphics
    triangleGraphics.clear();
    triangleGraphics.lineStyle(1, 0xffff00);
    // Circle
    triangleGraphics.beginPath();
    triangleGraphics.arc(0, 0, 4, 0, Math.PI * 2);
    triangleGraphics.closePath();
    triangleGraphics.strokePath();
    // Lines
    triangleGraphics.beginPath();
    triangleGraphics.moveTo(-6, 0);
    triangleGraphics.lineTo(6, 0);
    triangleGraphics.moveTo(0, -6);
    triangleGraphics.lineTo(0, 6);
    triangleGraphics.strokePath();
    triangleGraphics.generateTexture('crosshair', 12, 12);
    
    // Destroy the graphics object as we no longer need it
    triangleGraphics.destroy();

    // Create player 1 (blue)
    player1 = this.physics.add.sprite(200, 300, 'player1_triangle');
    // Remove world bounds constraint
    player1.setCollideWorldBounds(false);
    player1.angle = 0;
    player1.speed = 0;
    player1.setData('isShooting', false);
    player1.setData('lastShot', 0);
    player1.setData('isInvulnerable', false);
    player1.body.setSize(24, 32);
    player1.body.setOffset(3, 4);

    // Create player 2 (red)
    player2 = this.physics.add.sprite(600, 300, 'player2_triangle');
    // Remove world bounds constraint
    player2.setCollideWorldBounds(false);
    player2.angle = 180;
    player2.speed = 0;
    player2.setData('isShooting', false);
    player2.setData('lastShot', 0);
    player2.setData('isInvulnerable', false);
    player2.body.setSize(24, 32);
    player2.body.setOffset(3, 4);

    // Create crosshairs
    player1Crosshair = this.add.image(player1.x, player1.y, 'crosshair');
    player2Crosshair = this.add.image(player2.x, player2.y, 'crosshair');
    player1Crosshair.setAlpha(0.8);
    player2Crosshair.setAlpha(0.8);

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

    // Create player indicators for off-screen players
    createPlayerIndicators(this);
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

// Create indicators to show direction of off-screen players
function createPlayerIndicators(scene) {
    // Create triangle for player 1 indicator (blue)
    const indicatorGraphics = scene.add.graphics();
    
    // Player 1 indicator (blue triangle)
    indicatorGraphics.clear();
    indicatorGraphics.lineStyle(2, 0xffffff);
    indicatorGraphics.fillStyle(0x0000ff);
    indicatorGraphics.beginPath();
    indicatorGraphics.moveTo(0, -10);  // Point at top
    indicatorGraphics.lineTo(7, 10);   // Bottom right
    indicatorGraphics.lineTo(-7, 10);  // Bottom left
    indicatorGraphics.closePath();
    indicatorGraphics.strokePath();
    indicatorGraphics.fillPath();
    indicatorGraphics.generateTexture('player1_indicator', 15, 20);
    
    // Player 2 indicator (red triangle)
    indicatorGraphics.clear();
    indicatorGraphics.lineStyle(2, 0xffffff);
    indicatorGraphics.fillStyle(0xff0000);
    indicatorGraphics.beginPath();
    indicatorGraphics.moveTo(0, -10);  // Point at top
    indicatorGraphics.lineTo(7, 10);   // Bottom right
    indicatorGraphics.lineTo(-7, 10);  // Bottom left
    indicatorGraphics.closePath();
    indicatorGraphics.strokePath();
    indicatorGraphics.fillPath();
    indicatorGraphics.generateTexture('player2_indicator', 15, 20);
    
    // Destroy the graphics object as we no longer need it
    indicatorGraphics.destroy();
    
    // Create the indicators
    player1Indicator = scene.add.image(0, 0, 'player1_indicator');
    player2Indicator = scene.add.image(0, 0, 'player2_indicator');
    
    // Set them to be fixed to the camera
    player1Indicator.setScrollFactor(0);
    player2Indicator.setScrollFactor(0);
    
    // Initially hide them
    player1Indicator.setVisible(false);
    player2Indicator.setVisible(false);
}

// Update indicators for off-screen players
function updatePlayerIndicators() {
    if (!player1 || !player2 || !mainCamera || !player1Indicator || !player2Indicator) return;
    
    const padding = 40; // Padding from the edge of the screen
    const halfWidth = config.width / 2;
    const halfHeight = config.height / 2;
    
    // Get camera view coordinates
    const camX = mainCamera.scrollX;
    const camY = mainCamera.scrollY;
    const camWidth = config.width / currentZoom;
    const camHeight = config.height / currentZoom;
    
    // Check if player 2 is off-screen for player 1's view
    const p2OffScreen = (
        player2.x < camX - camWidth/2 || 
        player2.x > camX + camWidth/2 || 
        player2.y < camY - camHeight/2 || 
        player2.y > camY + camHeight/2
    );
    
    if (p2OffScreen) {
        // Calculate angle from player 1 to player 2
        const angle = Phaser.Math.Angle.Between(player1.x, player1.y, player2.x, player2.y);
        
        // Calculate position on the edge of the screen
        let indicatorX = Math.cos(angle) * (halfWidth - padding);
        let indicatorY = Math.sin(angle) * (halfHeight - padding);
        
        // Clamp to screen edges
        const absX = Math.abs(indicatorX);
        const absY = Math.abs(indicatorY);
        
        if (absX > absY) {
            // Indicator will be on left or right edge
            indicatorY = (indicatorY / absX) * (halfWidth - padding);
            indicatorX = (indicatorX > 0) ? (halfWidth - padding) : -(halfWidth - padding);
        } else {
            // Indicator will be on top or bottom edge
            indicatorX = (indicatorX / absY) * (halfHeight - padding);
            indicatorY = (indicatorY > 0) ? (halfHeight - padding) : -(halfHeight - padding);
        }
        
        // Position and rotate the indicator
        player2Indicator.setPosition(indicatorX + halfWidth, indicatorY + halfHeight);
        player2Indicator.setRotation(angle);
        player2Indicator.setVisible(true);
    } else {
        player2Indicator.setVisible(false);
    }
    
    // Check if player 1 is off-screen for player 2's view
    const p1OffScreen = (
        player1.x < camX - camWidth/2 || 
        player1.x > camX + camWidth/2 || 
        player1.y < camY - camHeight/2 || 
        player1.y > camY + camHeight/2
    );
    
    if (p1OffScreen) {
        // Calculate angle from player 2 to player 1
        const angle = Phaser.Math.Angle.Between(player2.x, player2.y, player1.x, player1.y);
        
        // Calculate position on the edge of the screen
        let indicatorX = Math.cos(angle) * (halfWidth - padding);
        let indicatorY = Math.sin(angle) * (halfHeight - padding);
        
        // Clamp to screen edges
        const absX = Math.abs(indicatorX);
        const absY = Math.abs(indicatorY);
        
        if (absX > absY) {
            // Indicator will be on left or right edge
            indicatorY = (indicatorY / absX) * (halfWidth - padding);
            indicatorX = (indicatorX > 0) ? (halfWidth - padding) : -(halfWidth - padding);
        } else {
            // Indicator will be on top or bottom edge
            indicatorX = (indicatorX / absY) * (halfHeight - padding);
            indicatorY = (indicatorY > 0) ? (halfHeight - padding) : -(halfHeight - padding);
        }
        
        // Position and rotate the indicator
        player1Indicator.setPosition(indicatorX + halfWidth, indicatorY + halfHeight);
        player1Indicator.setRotation(angle);
        player1Indicator.setVisible(true);
    } else {
        player1Indicator.setVisible(false);
    }
}

// Update game state
function update(time) {
    // Check for reset key
    if (Phaser.Input.Keyboard.JustDown(resetKey)) {
        resetGame();
    }
    
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
    if (cursors.up.isDown) {
        // Increase speed
        player1.speed = Phaser.Math.Clamp(player1.speed + 1, 0, 200);
    } else if (cursors.down.isDown) {
        // Decrease speed
        player1.speed = Phaser.Math.Clamp(player1.speed - 1, -100, 200);
    } else {
        // Gradually slow down
        if (player1.speed > 0) player1.speed -= 0.5;
        else if (player1.speed < 0) player1.speed += 0.5;
    }

    if (cursors.left.isDown) {
        // Turn left
        player1.angle -= 3;
    } else if (cursors.right.isDown) {
        // Turn right
        player1.angle += 3;
    }

    // Player 2 controls (WASD)
    if (wasdKeys.up.isDown) {
        // Increase speed
        player2.speed = Phaser.Math.Clamp(player2.speed + 1, 0, 200);
    } else if (wasdKeys.down.isDown) {
        // Decrease speed
        player2.speed = Phaser.Math.Clamp(player2.speed - 1, -100, 200);
    } else {
        // Gradually slow down
        if (player2.speed > 0) player2.speed -= 0.5;
        else if (player2.speed < 0) player2.speed += 0.5;
    }

    if (wasdKeys.left.isDown) {
        // Turn left
        player2.angle -= 3;
    } else if (wasdKeys.right.isDown) {
        // Turn right
        player2.angle += 3;
    }

    // Move players based on their angle and speed
    movePlayer(player1);
    movePlayer(player2);

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
    
    // Update crosshair positions
    updateCrosshairs();
    
    // Update player indicators
    updatePlayerIndicators();
    
    // Update camera position and zoom
    updateCamera();
}

// Helper function to move a player based on angle and speed
function movePlayer(player) {
    const angleRad = Phaser.Math.DegToRad(player.angle);
    player.x += Math.cos(angleRad) * player.speed * 0.01;
    player.y += Math.sin(angleRad) * player.speed * 0.01;
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
        
        const angleRad = Phaser.Math.DegToRad(player.angle);
        
        // Start bullet at player's position
        bullet.setPosition(player.x, player.y);
        bullet.setActive(true);
        bullet.setVisible(true);
        
        // Set bullet velocity (slower than before)
        bullet.setVelocity(
            Math.cos(angleRad) * 300,
            Math.sin(angleRad) * 300
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
    player1ScoreText.setText('Player 1: ' + player1Score);
    
    // Destroy the bullet
    bullet.setActive(false);
    bullet.setVisible(false);
    
    // Respawn player 2 - use player2 reference, not the parameter
    respawnPlayer(player2, 600, 300, 180);
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
    player2ScoreText.setText('Player 2: ' + player2Score);
    
    // Destroy the bullet
    bullet.setActive(false);
    bullet.setVisible(false);
    
    // Respawn player 1 - use player1 reference, not the parameter
    respawnPlayer(player1, 200, 300, 0);
}

// Helper function to respawn a player
function respawnPlayer(player, x, y, angle) {
    // Set player as invulnerable temporarily
    player.setData('isInvulnerable', true);
    
    // Play respawn sound
    respawnSound.play({ volume: 0.5 });
    
    // Reset position and properties
    player.x = x;
    player.y = y;
    player.angle = angle;
    player.speed = 0;
    
    // Ensure player is visible
    player.visible = true;
    player.alpha = 1;
    
    // Get the appropriate shield and crosshair
    let shield = (player === player1) ? player1Shield : player2Shield;
    let crosshair = (player === player1) ? player1Crosshair : player2Crosshair;
    
    // Make sure shield is visible and positioned correctly
    shield.visible = true;
    shield.x = player.x;
    shield.y = player.y;
    shield.alpha = 0.7;
    shield.setScale(1.5);
    
    // Update crosshair position
    const angleRad = Phaser.Math.DegToRad(angle);
    crosshair.x = x + Math.cos(angleRad) * 40;
    crosshair.y = y + Math.sin(angleRad) * 40;
    crosshair.visible = true;
    
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

// Reset the game
function resetGame() {
    // Reset player positions to the center of the visible area
    player1.x = -200;
    player1.y = 0;
    player1.angle = 0;
    player1.speed = 0;
    player1.setData('isInvulnerable', false);
    player1.setVisible(true);
    player1.setActive(true);
    player1.clearTint();
    
    player2.x = 200;
    player2.y = 0;
    player2.angle = 180;
    player2.speed = 0;
    player2.setData('isInvulnerable', false);
    player2.setVisible(true);
    player2.setActive(true);
    player2.clearTint();
    
    // Reset shields
    if (player1Shield) {
        player1Shield.visible = false;
    }
    
    if (player2Shield) {
        player2Shield.visible = false;
    }
    
    // Clear all bullets
    player1Bullets.clear(true, true);
    player2Bullets.clear(true, true);
    
    // Reset camera zoom
    if (mainCamera) {
        currentZoom = 1;
        targetZoom = 1;
        mainCamera.zoomTo(1, 0);
        mainCamera.pan((player1.x + player2.x) / 2, (player1.y + player2.y) / 2, 0);
    }
    
    // Update debug text
    if (DEBUG_MODE && debugText) {
        debugText.setText('Debug: Game reset');
    }
}

// Calculate the optimal zoom level based on player positions
function calculateOptimalZoom() {
    // Calculate the distance between the two players
    const dx = player2.x - player1.x;
    const dy = player2.y - player1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate the diagonal of the screen
    const screenDiagonal = Math.sqrt(config.width * config.width + config.height * config.height);
    
    // Calculate the zoom level needed to fit both players with margin
    // The formula ensures that as players get further apart, we zoom out
    const distanceWithMargin = distance + (cameraMargin * 2);
    let newZoom = screenDiagonal / distanceWithMargin;
    
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
    
    // Smoothly interpolate current zoom towards target zoom
    currentZoom = Phaser.Math.Linear(currentZoom, targetZoom, zoomSpeed);
    
    // Update camera position and zoom
    mainCamera.pan(midX, midY, 0, 'Linear', true);
    mainCamera.zoomTo(currentZoom, 100);
    
    if (DEBUG_MODE && debugText) {
        debugText.setText(`Debug: Zoom: ${currentZoom.toFixed(2)}, Distance: ${
            Math.sqrt(Math.pow(player2.x - player1.x, 2) + Math.pow(player2.y - player1.y, 2)).toFixed(0)
        }`);
        // Make sure debug text follows the camera
        debugText.setScrollFactor(0);
        player1ScoreText.setScrollFactor(0);
        player2ScoreText.setScrollFactor(0);
    }
}

// Update crosshair positions
function updateCrosshairs() {
    if (player1Crosshair) {
        const angleRad1 = Phaser.Math.DegToRad(player1.angle);
        player1Crosshair.x = player1.x + Math.cos(angleRad1) * 40;
        player1Crosshair.y = player1.y + Math.sin(angleRad1) * 40;
    }

    if (player2Crosshair) {
        const angleRad2 = Phaser.Math.DegToRad(player2.angle);
        player2Crosshair.x = player2.x + Math.cos(angleRad2) * 40;
        player2Crosshair.y = player2.y + Math.sin(angleRad2) * 40;
    }
}

// Create UI elements
function createUI(scene) {
    // Create score text
    player1ScoreText = scene.add.text(16, 16, 'Blue: 0', { fontSize: '24px', fill: '#0000FF' });
    player2ScoreText = scene.add.text(650, 16, 'Red: 0', { fontSize: '24px', fill: '#FF0000' });
    
    // Fix UI elements to the camera (won't move when camera pans)
    player1ScoreText.setScrollFactor(0);
    player2ScoreText.setScrollFactor(0);
    
    // Create debug text if in debug mode
    if (DEBUG_MODE) {
        debugText = scene.add.text(16, 550, 'Debug: Game started', { fontSize: '16px', fill: '#00FF00' });
        debugText.setScrollFactor(0);
    }
    
    // Create reset key
    resetKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
} 