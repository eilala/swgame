import map1 from './map1.js';

const maps = [map1];

export function loadRandomMap(scene) {
    const randomIndex = Math.floor(Math.random() * maps.length);
    const loadMap = maps[randomIndex];
    loadMap(scene);
}
