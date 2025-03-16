// shared-config.js
// This file contains constants shared between client and server

// Physics constants
const PHYSICS = {
    thrustPower: 0.2,  // Acceleration per frame when thrusting
    maxSpeed: 10,        // Maximum velocity
    drag: 1.0,          // Drag coefficient (0.98 = 2% slowdown per frame)
    
    // Planet physics
    gravitationalConstant: 50.0, // Increased from 0.5 to 1.2 for stronger gravity
    maxLandingSpeed: 4.0,      // Maximum speed for safe landing
    takeoffBoost: 4.1,         // Reduced from 4.0 to 2.0 for more gradual takeoff
};

// World configuration
const WORLD = {
    size: 6000,        // World size (width and height)
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
    updateRate: 40      // Server updates per second
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