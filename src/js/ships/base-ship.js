import * as THREE from 'three';
import PrimaryWeapon from '../weapons/primary-weapon.js';

export default class BaseShip {
    constructor() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.mesh = new THREE.Mesh(geometry, material);

        this.turnSpeed = 1;

        // Stats
        this.shield = 100;
        this.maxShield = 100;
        this.hull = 100;
        this.maxHull = 100;
        this.energy = 100;
        this.maxEnergy = 100;
        this.energyRegenerationRate = 5; // Energy per second
        this.energyDrainTimeout = 2; // Seconds to wait before regeneration starts
        this.lastEnergyActionTime = 0; // Time of last energy action
        this.energyRegenerationStartTime = 0; // Time when regeneration should start

        // Constants (scaled for per-second physics at 60 FPS, further increased for responsiveness)
        this.acceleration = 3.6; // Further increased from 1.8 for even faster acceleration
        this.maxSpeedForward = 180; // Further increased from 120 for higher top speed
        this.maxSpeedBackward = 45; // Further increased from 30 for better maneuverability
        this.drag = Math.pow(0.99, 60); // ~0.548 per second
        this.boostMultiplier = 2;
        this.boosting = false;
        
        // Initialize the primary weapon
        this.primaryWeapon = new PrimaryWeapon(this);
    }

    update(player, deltaTime) {
        // Update the weapon system
        this.primaryWeapon.update(deltaTime);
        
        // Position the ship at the player's location
        this.mesh.position.copy(player.position);

        // Update rotation to follow player's camera
        const targetQuaternion = player.quaternion;
        const step = this.turnSpeed * deltaTime;
        this.mesh.quaternion.rotateTowards(targetQuaternion, step);
    }
    
    // Method to fire the primary weapon
    firePrimaryWeapon(player) {
        return this.primaryWeapon.fire(player);
    }
}
