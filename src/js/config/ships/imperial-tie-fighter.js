/**
 * Configuration for Imperial Tie Fighter ship (upgraded version)
 */
export const ImperialTieFighterConfig = {
    // Physics
    ACCELERATION: 10, // Slightly better acceleration
    MAX_SPEED_FORWARD: 250, // Slightly faster
    MAX_SPEED_BACKWARD: 60,
    DRAG: Math.pow(0.99, 60), // Per second at 60 FPS
    BOOST_MULTIPLIER: 2, // Better boost

    // Health and shields
    MAX_SHIELD: 0, // Slightly better shields
    MAX_HULL: 100, // Slightly better hull
    SHIELD_REGENERATION_RATE: 0, // Slightly better regen
    SHIELD_DRAIN_TIMEOUT: 3, // Seconds before regeneration starts

    // Energy
    MAX_ENERGY: 110, // Slightly more energy
    ENERGY_REGENERATION_RATE: 20, // Slightly better regen
    ENERGY_DRAIN_TIMEOUT: 2, // Seconds before regeneration starts

    // Components
    COMPONENT_HEALTH: {
        main_body: 100,
        left_wing: 50,
        right_wing: 50
    },

    // Movement
    TURN_SPEED: 2, // Slightly more maneuverable
};