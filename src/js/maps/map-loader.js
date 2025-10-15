import map1 from './map1.js';

const maps = [map1];

export function loadRandomMap(scene, world = null, staticObjects = null) {
    const randomIndex = Math.floor(Math.random() * maps.length);
    const loadMap = maps[randomIndex];
    return loadMap(scene, world, staticObjects);
}
