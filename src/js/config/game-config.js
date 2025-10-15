/**
 * Centralized configuration for game constants and settings
 */
export const GameConfig = {
    // Physics settings
    PHYSICS: {
        GRAVITY: { x: 0.0, y: 0.0, z: 0.0 },
        MAX_DELTA_TIME: 0.05, // Maximum time step to prevent large jumps
    },

    // Ship settings
    SHIP: {
        // Physics
        ACCELERATION: 10,
        MAX_SPEED_FORWARD: 250,
        MAX_SPEED_BACKWARD: 50,
        DRAG: Math.pow(0.99, 60), // Per second at 60 FPS
        BOOST_MULTIPLIER: 2,

        // Health and shields
        MAX_SHIELD: 10,
        MAX_HULL: 100,
        SHIELD_REGENERATION_RATE: 5, // Per second
        SHIELD_DRAIN_TIMEOUT: 3, // Seconds before regeneration starts

        // Energy
        MAX_ENERGY: 100,
        ENERGY_REGENERATION_RATE: 10, // Per second
        ENERGY_DRAIN_TIMEOUT: 2, // Seconds before regeneration starts

        // Components
        COMPONENT_HEALTH: {
            main_body: 100,
            left_wing: 50,
            right_wing: 50
        },

        // Movement
        TURN_SPEED: 2,
    },

    // Enemy settings
    ENEMY: {
        DEFAULT_HEALTH: 50,
        DEFAULT_SHIELD: 25,
        COMPONENT_HEALTH: {
            main_body: 100,
            left_wing: 50,
            right_wing: 50
        },
    },

    // Weapon settings
    WEAPON: {
        PRIMARY: {
            DAMAGE: 10,
            ENERGY_COST: 5,
            FIRE_RATE: 5, // Shots per second
            CONVERGENCE_RANGE: 50,
            SPEED: 60,
            LIFETIME: 10.0,
        }
    },

    // Bolt settings
    BOLT: {
        SPEED: 60,
        LIFETIME: 2.0,
        DAMAGE: 10,
        MAX_COUNT: 50, // Per type
    },

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

    // Scene settings
    SCENE: {
        BACKGROUND_COLOR: 0x000000,
        STAR_COUNT: 5000,
        STAR_SIZE: 0.1,
    },

    // Map settings
    MAP: {
        ISD_SCALE: 0.5,
        ISD_POSITION: { x: 200, y: 0, z: 0 },
        PLAYER_SCALE: 0.5,
        ENEMY_SCALE: 0.5,
    },

    // Camera settings
    CAMERA: {
        FOV: 75,
        NEAR: 0.1,
        FAR: 1000,
        DEFAULT_POSITION: { x: 0, y: 0, z: 5 },
        PLAYER_CAMERA_OFFSET: { x: 0, y: 2, z: 5 },
    },

    // Renderer settings
    RENDERER: {
        ANTIALIAS: true,
        SHADOW_MAP_ENABLED: false,
    },

    // Lighting settings
    LIGHTING: {
        AMBIENT: {
            COLOR: 0x404040,
            INTENSITY: 1,
        },
        DIRECTIONAL: {
            COLOR: 0xffffff,
            INTENSITY: 1,
            POSITION: { x: 10, y: 10, z: 5 },
        },
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