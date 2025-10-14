import * as THREE from 'three';
import Player from './player/player.js';
import { loadRandomMap } from './maps/map-loader.js';
import Controls from './controls.js';
import PlayerCamera from './camera/player-camera.js';
import UI from './ui.js';

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
    
    // Get active blaster bolts from the ship's weapon
    const shipBolts = player.ship.primaryWeapon.getBolts();
    
    // Add any new bolts to the scene if they're not already added
    shipBolts.forEach(bolt => {
        if (!scene.children.includes(bolt.mesh)) {
            // Mark the mesh as a blaster bolt for easy identification later
            bolt.mesh.userData = bolt.mesh.userData || {};
            bolt.mesh.userData.isBlasterBolt = true;
            scene.add(bolt.mesh);
        }
    });
    
    // Remove any bolts from the scene that are no longer active
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const child = scene.children[i];
        // If it's a blaster bolt mesh that's no longer in the weapon's bolt array, remove it
        if (child.userData && child.userData.isBlasterBolt) {
            const stillActive = shipBolts.some(bolt => bolt.mesh === child);
            if (!stillActive) {
                scene.remove(child);
            }
        }
    }

    renderer.render(scene, camera);
}

animate();