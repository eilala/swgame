import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import PrimaryWeapon from '../weapons/primary-weapon.js';

export default class BaseShip {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null; // Initialize as null until loaded
        this.modelLoaded = false; // Track loading state
        
        const loader = new GLTFLoader();
        loader.load(
            'src/assets/models/tiefighter/TIEFighter.glb',
            (gltf) => {
                this.mesh = gltf.scene;
                // Optional: Adjust scale, rotation, etc.
                this.mesh.scale.set(0.5, 0.5, 0.5);

                // Traverse the model and set material properties for visibility
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        // Ensure materials have proper settings for lighting
                        if (child.material) {
                            // If material is an array, iterate through materials
                            if (Array.isArray(child.material)) {
                                child.material.forEach((mat) => {
                                    if (mat) {
                                        mat.needsUpdate = true;
                                    }
                                });
                            } else {
                                child.material.needsUpdate = true;
                            }
                        }
                    }
                });

                // Add to scene after loading
                this.scene.add(this.mesh);
                this.modelLoaded = true; // Mark as loaded
                console.log('Player ship model added to scene');
                
                // Mark all child meshes as player ship parts too
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.userData = child.userData || {};
                        child.userData.isPlayer = true; // Use same flag as other players for consistency
                        child.userData.playerId = window.myPlayerId || 0; // Set player ID for the local player
                    }
                });
            },
            undefined,
            (error) => {
                console.error('An error happened loading the GLTF model:', error);
                // Fallback to cube if loading fails
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                this.mesh = new THREE.Mesh(geometry, material);
                this.scene.add(this.mesh);
                this.modelLoaded = true; // Mark as loaded (with fallback)
                
                // Mark all child meshes as player ship parts too
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.userData = child.userData || {};
                        child.userData.isPlayer = true; // Use same flag as other players for consistency
                        child.userData.playerId = window.myPlayerId || 0; // Set player ID for the local player
                    }
                });
            }
        );

        this.turnSpeed = 2;

        // Stats
        this.shield = 100;
        this.maxShield = 100;
        this.hull = 100;
        this.maxHull = 100;
        this.energy = 100;
        this.maxEnergy = 100;
        this.energyRegenerationRate = 10; // Energy per second
        this.energyDrainTimeout = 2; // Seconds to wait before regeneration starts
        this.lastEnergyActionTime = 0; // Time of last energy action
        this.energyRegenerationStartTime = 0; // Time when regeneration should start

        // Constants (scaled for per-second physics at 60 FPS, further increased for responsiveness)
        this.acceleration = 10; // Further increased from 1.8 for even faster acceleration
        this.maxSpeedForward = 250; // Further increased from 120 for higher top speed
        this.maxSpeedBackward = 50; // Further increased from 30 for better maneuverability
        this.drag = Math.pow(0.99, 60); // ~0.548 per second
        this.boostMultiplier = 2;
        this.boosting = false;
        
        // Initialize the primary weapon
        this.primaryWeapon = new PrimaryWeapon(this);

        // Firing state flags
        this.isFiringPrimary = false;
    }

    update(player, deltaTime) {
        // Cap deltaTime to prevent issues when tabbing back in
        const cappedDeltaTime = Math.min(deltaTime, 0.05); // Maximum 50ms per frame
        
        // Only update if the model has been loaded
        if (!this.modelLoaded) {
            return; // Skip update if model hasn't loaded yet
        }
        
        // Update the weapon system with player for continuous firing
        this.primaryWeapon.update(cappedDeltaTime, player);

        // Position the ship at the player's location
        this.mesh.position.copy(player.position);

        // Update rotation to follow player's camera
        const targetQuaternion = player.quaternion;
        const step = this.turnSpeed * cappedDeltaTime;
        this.mesh.quaternion.rotateTowards(targetQuaternion, step);
    }
    
    // Method to fire the primary weapon
    firePrimaryWeapon(player) {
        return this.primaryWeapon.fire(player);
    }
}
