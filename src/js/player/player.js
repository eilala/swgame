import * as THREE from 'three';
import BaseShip from '../ships/base-ship.js';

export default class Player {
    constructor() {
        this.ship = new BaseShip();

        // Physics properties
        this.position = new THREE.Vector3();
        this.quaternion = new THREE.Quaternion();
        this.velocity = new THREE.Vector3();
    }

    update(controls, deltaTime) {
        // Update time for energy management
        const currentTime = Date.now() / 1000; // Convert to seconds
        
        // Handle boost
        if (controls.keys.ShiftLeft && this.ship.energy > 0) {
            this.ship.boosting = true;
            this.ship.energy -= 0.1; // Drain energy
            // Update last energy action time when using boost
            this.ship.lastEnergyActionTime = currentTime;
        } else {
            this.ship.boosting = false;
        }

        // Calculate current max speeds and acceleration based on boost status
        const currentMaxSpeedForward = this.ship.boosting ?
            this.ship.maxSpeedForward * this.ship.boostMultiplier :
            this.ship.maxSpeedForward;
        const currentMaxSpeedBackward = this.ship.boosting ?
            this.ship.maxSpeedBackward * this.ship.boostMultiplier :
            this.ship.maxSpeedBackward;
            
        // Calculate current acceleration based on boost status
        const currentAcceleration = this.ship.boosting ?
            this.ship.acceleration * this.ship.boostMultiplier :
            this.ship.acceleration;

        // Handle acceleration
        if (controls.keys.KeyW) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
            const forwardVelocity = this.velocity.dot(forward);
            if (forwardVelocity < currentMaxSpeedForward) {
                this.velocity.add(forward.multiplyScalar(currentAcceleration));
            }
        }
        if (controls.keys.KeyS) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
            const backwardVelocity = -this.velocity.dot(forward);
            if (backwardVelocity < currentMaxSpeedBackward) {
                this.velocity.sub(forward.multiplyScalar(currentAcceleration));
            }
        }

        // Energy regeneration logic
        // If energy is not being drained (not boosting) and energy is below max
        if (!this.ship.boosting && this.ship.energy < this.ship.maxEnergy) {
            // Check if we've waited long enough to start regeneration
            if (currentTime - this.ship.lastEnergyActionTime >= this.ship.energyDrainTimeout) {
                // Regenerate energy
                this.ship.energy += this.ship.energyRegenerationRate * deltaTime;
                
                // Ensure energy doesn't exceed maximum
                if (this.ship.energy > this.ship.maxEnergy) {
                    this.ship.energy = this.ship.maxEnergy;
                }
            }
        }

        // Update position
        this.position.add(this.velocity);
        this.velocity.multiplyScalar(this.ship.drag);
    }
}