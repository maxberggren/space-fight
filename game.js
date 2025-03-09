// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
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

// Preload game assets
function preload() {
    // Load images for players and bullets from public URLs
    this.load.image('player1', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/blue_ball.png');
    this.load.image('player2', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/red_ball.png');
    this.load.image('bullet', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/bullets/bullet7.png');
    this.load.image('shield', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/orb-blue.png');
    this.load.spritesheet('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/explosion.png', { frameWidth: 64, frameHeight: 64, endFrame: 23 });
    
    // Load sound effects
    this.load.audio('shoot', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/blaster.mp3');
    this.load.audio('explosion', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/explosion.mp3');
    this.load.audio('respawn', 'https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/alien_death1.wav');
}

// Create game objects
function create() {
    // Create player 1 (blue)
    player1 = this.physics.add.sprite(200, 300, 'player1');
    player1.setScale(0.5);
    player1.setCollideWorldBounds(true);
    player1.angle = 0;
    player1.speed = 0;
    player1.body.setCircle(45);
    player1.setData('isShooting', false);
    player1.setData('lastShot', 0);
    player1.setData('isInvulnerable', false);

    // Create player 2 (red)
    player2 = this.physics.add.sprite(600, 300, 'player2');
    player2.setScale(0.5);
    player2.setCollideWorldBounds(true);
    player2.angle = 180;
    player2.speed = 0;
    player2.body.setCircle(45);
    player2.setData('isShooting', false);
    player2.setData('lastShot', 0);
    player2.setData('isInvulnerable', false);

    // Create bullet groups
    player1Bullets = this.physics.add.group({
        defaultKey: 'bullet',
        maxSize: 10
    });

    player2Bullets = this.physics.add.group({
        defaultKey: 'bullet',
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
    
    // Reset key (R)
    resetKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Add score text
    player1ScoreText = this.add.text(50, 16, 'Player 1: 0', { fontSize: '24px', fill: '#0000FF' });
    player2ScoreText = this.add.text(550, 16, 'Player 2: 0', { fontSize: '24px', fill: '#FF0000' });

    // Create explosion animation
    this.anims.create({
        key: 'explode',
        frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 23, first: 0 }),
        frameRate: 20,
        hideOnComplete: true
    });

    // Add sound effects
    shootSound = this.sound.add('shoot');
    explosionSound = this.sound.add('explosion');
    respawnSound = this.sound.add('respawn');

    // Add debug text if in debug mode
    if (DEBUG_MODE) {
        debugText = this.add.text(10, 550, 'Debug: Ready', { 
            fontSize: '16px', 
            fill: '#FFFFFF',
            backgroundColor: '#000000'
        });
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

    // Update bullet positions and remove bullets that are out of bounds
    player1Bullets.getChildren().forEach(bullet => {
        if (bullet.active && (bullet.x < 0 || bullet.x > 800 || bullet.y < 0 || bullet.y > 600)) {
            bullet.setActive(false);
            bullet.setVisible(false);
        }
    });

    player2Bullets.getChildren().forEach(bullet => {
        if (bullet.active && (bullet.x < 0 || bullet.x > 800 || bullet.y < 0 || bullet.y > 600)) {
            bullet.setActive(false);
            bullet.setVisible(false);
        }
    });

    // Update debug text if in debug mode
    if (DEBUG_MODE && debugText) {
        debugText.setText(
            `Debug: P1 Invuln: ${player1.getData('isInvulnerable')} | ` +
            `P2 Invuln: ${player2.getData('isInvulnerable')} | ` +
            `P1 Shield: ${player1Shield ? player1Shield.visible : 'N/A'} | ` +
            `P2 Shield: ${player2Shield ? player2Shield.visible : 'N/A'}`
        );
    }
}

// Helper function to move a player based on angle and speed
function movePlayer(player) {
    const angleRad = Phaser.Math.DegToRad(player.angle);
    player.x += Math.cos(angleRad) * player.speed * 0.01;
    player.y += Math.sin(angleRad) * player.speed * 0.01;
}

// Helper function to shoot a bullet
function shootBullet(player, bulletGroup, time) {
    const bullet = bulletGroup.get();
    
    if (bullet) {
        // Play shoot sound
        shootSound.play({ volume: 0.5 });
        
        const angleRad = Phaser.Math.DegToRad(player.angle);
        const offsetX = Math.cos(angleRad) * 30;
        const offsetY = Math.sin(angleRad) * 30;
        
        bullet.setPosition(player.x + offsetX, player.y + offsetY);
        bullet.setScale(0.5);
        bullet.setActive(true);
        bullet.setVisible(true);
        
        // Set bullet velocity based on player angle
        bullet.setVelocity(
            Math.cos(angleRad) * 500,
            Math.sin(angleRad) * 500
        );
        
        bullet.angle = player.angle;
        
        // Set cooldown for shooting
        player.setData('lastShot', time);
    }
}

// Collision handler for player 2 getting hit
function bulletHitPlayer2(bullet, player) {
    // Check if player is invulnerable
    if (player.getData('isInvulnerable')) {
        return;
    }
    
    bullet.setActive(false);
    bullet.setVisible(false);
    
    // Play explosion sound
    explosionSound.play({ volume: 0.7 });
    
    // Create explosion effect
    const explosion = player.scene.add.sprite(player.x, player.y, 'explosion');
    explosion.play('explode');
    
    // Increment score
    player1Score++;
    player1ScoreText.setText('Player 1: ' + player1Score);
    
    // Ensure player is visible before respawning
    player.visible = true;
    
    // Respawn player 2
    respawnPlayer(player2, 600, 300, 180);
}

// Collision handler for player 1 getting hit
function bulletHitPlayer1(bullet, player) {
    // Check if player is invulnerable
    if (player.getData('isInvulnerable')) {
        return;
    }
    
    bullet.setActive(false);
    bullet.setVisible(false);
    
    // Play explosion sound
    explosionSound.play({ volume: 0.7 });
    
    // Create explosion effect
    const explosion = player.scene.add.sprite(player.x, player.y, 'explosion');
    explosion.play('explode');
    
    // Increment score
    player2Score++;
    player2ScoreText.setText('Player 2: ' + player2Score);
    
    // Ensure player is visible before respawning
    player.visible = true;
    
    // Respawn player 1
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

// Function to reset the game state
function resetGame() {
    // Reset player positions
    player1.x = 200;
    player1.y = 300;
    player1.angle = 0;
    player1.speed = 0;
    player1.visible = true;
    player1.alpha = 1;
    player1.setData('isInvulnerable', false);
    
    player2.x = 600;
    player2.y = 300;
    player2.angle = 180;
    player2.speed = 0;
    player2.visible = true;
    player2.alpha = 1;
    player2.setData('isInvulnerable', false);
    
    // Hide shields
    if (player1Shield) {
        player1Shield.visible = false;
    }
    
    if (player2Shield) {
        player2Shield.visible = false;
    }
    
    // Clear bullets
    player1Bullets.clear(true, true);
    player2Bullets.clear(true, true);
    
    // Kill all tweens
    player1.scene.tweens.killAll();
    
    if (DEBUG_MODE && debugText) {
        debugText.setText('Debug: Game reset');
    }
} 