/**
 * Configuration for Map 1
 */
export const Map1Config = {
    // Scene settings
    BACKGROUND_COLOR: 0x000000,
    STAR_COUNT: 5000,
    STAR_SIZE: 0.1,

    // Map objects
    ISD_SCALE: 0.5,
    ISD_POSITION: { x: 200, y: 0, z: 0 },
    PLAYER_SCALE: 0.5,
    ENEMY_SCALE: 0.5,

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
};