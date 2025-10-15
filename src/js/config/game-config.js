/**
 * Centralized configuration for game constants and settings
 */
export const GameConfig = {
    // Physics settings
    PHYSICS: {
        GRAVITY: { x: 0.0, y: 0.0, z: 0.0 },
        MAX_DELTA_TIME: 0.05, // Maximum time step to prevent large jumps
    },

    // Global settings that are shared across all ships, weapons, etc.

    // Network settings
    NETWORK: {
        POSITION_UPDATE_RATE: 60, // Updates per second
        BOLT_GRACE_PERIOD: 0.3, // Seconds before bolt can damage owner
        NETWORKED_BOLT_GRACE_PERIOD: 0.2,
    },

    // UI settings
    UI: {
        CROSSHAIR_SIZE: 10,
        HUD_UPDATE_RATE: 60,
    },

    // Audio settings
    AUDIO: {
        LASER_VOLUME: 0.03,
        REFERENCE_DISTANCE: 20,
    },

    // Collision settings
    COLLISION: {
        BOLT_PROCESS_LIMIT_LOCAL: 20,
        BOLT_PROCESS_LIMIT_NETWORKED: 20,
        ISD_PUSH_DISTANCE: 2.0,
        PROXIMITY_CHECK_DISTANCE: 4,
        SAFE_DISTANCE: 3.0,
        INTERPOLATION_FACTOR: 0.3,
        VELOCITY_REDUCTION_FACTOR: 0.3,
    },


    // Debug settings
    DEBUG: {
        LOG_COLLISIONS: false,
        LOG_DAMAGE: false,
        LOG_NETWORK: false,
    }
};

/**
 * Get a nested config value using dot notation
 * @param {string} path - Dot-separated path (e.g., "SHIP.MAX_SPEED_FORWARD")
 * @returns {*} Config value
 */
export function getConfig(path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], GameConfig);
}

/**
 * Set a config value (for runtime modifications)
 * @param {string} path - Dot-separated path
 * @param {*} value - New value
 */
export function setConfig(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
        if (!obj[key]) obj[key] = {};
        return obj[key];
    }, GameConfig);
    target[lastKey] = value;
}