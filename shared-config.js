// shared-config.js
// This file contains constants shared between client and server

// Physics constants
const PHYSICS = {
    thrustPower: 0.2,  // Acceleration per frame when thrusting
    maxSpeed: 10,        // Maximum velocity
    drag: 0.995,          // Drag coefficient (0.98 = 2% slowdown per frame)
    
    // Planet physics
    gravitationalConstant: 40.0, // Increased from 0.5 to 1.2 for stronger gravity
    maxLandingSpeed: 3.0,      // Maximum speed for safe landing
    takeoffBoost: 4.0,         // Increased from 5.0 to 8.0 for stronger initial velocity when taking off
};

// World configuration
const WORLD = {
    size: 8000,        // World size (width and height)
    maxPlayerDistance: 1200 // Maximum distance between players
};

// Game settings
const GAME = {
    bulletSpeed: 15,   // Increased bullet speed for better visibility
    bulletLifetime: 2000, // Bullet lifetime in milliseconds
    respawnInvulnerabilityTime: 3000, // Time in ms that a player is invulnerable after respawning
    hitRadius: 20,       // Increased collision radius for hit detection (was 20)
    shootCooldown: 250,   // Reduced cooldown for more responsive shooting
    planetRemovalDelay: 60000 // How long planets remain after player disconnects (ms)
};

// Network settings
const NETWORK = {
    updateRate: 30      // Server updates per second
};

// Export for Node.js (server)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PHYSICS,
        WORLD,
        GAME,
        NETWORK
    };
} 