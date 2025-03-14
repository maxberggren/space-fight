// This file provides a version timestamp for cache busting
const VERSION = Date.now();

// Export for Node.js (server)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VERSION
    };
} 