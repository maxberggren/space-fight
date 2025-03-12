// shared-config.js
// This file contains constants shared between client and server

// Physics constants
const PHYSICS = {
    thrustPower: 0.1,  // Acceleration per frame when thrusting
    maxSpeed: 20,        // Maximum velocity
    drag: 0.999,          // Drag coefficient (0.999 = 0.1% slowdown per frame)
};

// World configuration
const WORLD = {
    size: 10000,        // World size
    maxPlayerDistance: 1200 // Maximum distance between players
};

// Game settings
const GAME = {
    bulletSpeed: 20,   // Increased bullet speed for better visibility
    bulletLifetime: 2000, // Bullet lifetime in milliseconds
    respawnInvulnerabilityTime: 3000, // Time in ms that a player is invulnerable after respawning
    hitRadius: 30,       // Increased collision radius for hit detection (was 20)
    shootCooldown: 200   // Reduced cooldown for more responsive shooting
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