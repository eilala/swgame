/**
 * Configuration for player Tie Fighter ship
 */
export const PlayerTieFighterConfig = {
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
};