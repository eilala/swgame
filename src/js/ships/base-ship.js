import * as THREE from 'three';

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

        // Constants
        this.acceleration = 0.01;
        this.maxSpeedForward = 1;
        this.maxSpeedBackward = 0.25;
        this.drag = 0.99;
        this.boostMultiplier = 2;
        this.boosting = false;
    }

    update(player, deltaTime) {
        // Position the ship at the player's location
        this.mesh.position.copy(player.position);

        // Update rotation to follow player's camera
        const targetQuaternion = player.quaternion;
        const step = this.turnSpeed * deltaTime;
        this.mesh.quaternion.rotateTowards(targetQuaternion, step);
    }
}
