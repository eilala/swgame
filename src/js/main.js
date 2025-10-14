import * as THREE from 'three';
import Player from './player/player.js';
import { loadRandomMap } from './maps/map-loader.js';
import Controls from './controls.js';
import PlayerCamera from './camera/player-camera.js';
import UI from './ui/ui.js';

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Load Map
loadRandomMap(scene);

// Player
const player = new Player();
scene.add(player.ship.mesh);

// Player Camera
const playerCamera = new PlayerCamera(camera, player);

// Controls
const controls = new Controls(renderer.domElement, player);

// UI
const ui = new UI(player);

const clock = new THREE.Clock();

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    controls.update(deltaTime);
    player.update(controls, deltaTime);
    player.ship.update(player, deltaTime);
    playerCamera.update();
    ui.update();

    renderer.render(scene, camera);
}

animate();