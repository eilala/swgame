import * as THREE from 'three';
import ImperialTieFighter from '../ships/imperial-tie-fighter.js';

export default class Player {
    constructor(scene, world) {
        this.ship = new ImperialTieFighter(scene, world);

        // Physics properties
        this.position = new THREE.Vector3();
        this.quaternion = new THREE.Quaternion();
        this.velocity = new THREE.Vector3();

        this.isAlive = true;
    }

    update(controls, deltaTime) {
        // Cap deltaTime to prevent issues when tabbing back in
        const cappedDeltaTime = Math.min(deltaTime, 0.05); // Maximum 50ms per frame
        
        // Update time for energy management
        const currentTime = Date.now() / 1000; // Convert to seconds
        
        // Handle boost
        if (controls.keys.ShiftLeft && this.ship.energy > 0) {
            this.ship.boosting = true;
            this.ship.energy -= 6 * cappedDeltaTime; // Drain energy (6 per second)
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
                this.velocity.add(forward.multiplyScalar(currentAcceleration * cappedDeltaTime));
            }
        }
        if (controls.keys.KeyS) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
            const backwardVelocity = -this.velocity.dot(forward);
            if (backwardVelocity < currentMaxSpeedBackward) {
                this.velocity.sub(forward.multiplyScalar(currentAcceleration * cappedDeltaTime));
            }
        }

        // Energy regeneration logic
        // If energy is not being drained (not boosting) and energy is below max
        if (!this.ship.boosting && this.ship.energy < this.ship.maxEnergy) {
            // Check if we've waited long enough to start regeneration
            if (currentTime - this.ship.lastEnergyActionTime >= this.ship.energyDrainTimeout) {
                // Regenerate energy using the regeneration rate
                this.ship.energy += this.ship.energyRegenerationRate * cappedDeltaTime;

                // Ensure energy doesn't exceed maximum
                if (this.ship.energy > this.ship.maxEnergy) {
                    this.ship.energy = this.ship.maxEnergy;
                }
            }
        }

        // Shield regeneration logic
        // If shield is below max and we've waited long enough after taking damage
        if (this.ship.shield < this.ship.maxShield) {
            // Check if we've waited long enough to start regeneration
            if (currentTime - this.ship.lastShieldDamageTime >= this.ship.shieldDrainTimeout) {
                // Regenerate shield using the regeneration rate
                this.ship.shield += this.ship.shieldRegenerationRate * cappedDeltaTime;

                // Ensure shield doesn't exceed maximum
                if (this.ship.shield > this.ship.maxShield) {
                    this.ship.shield = this.ship.maxShield;
                }
            }
        }

        // Update position
        this.position.add(this.velocity.clone().multiplyScalar(cappedDeltaTime));
        this.velocity.multiplyScalar(Math.pow(this.ship.drag, cappedDeltaTime));
        
        // Handle primary weapon firing if the ship is set to fire and player is alive
        if (this.ship.isFiringPrimary && this.isAlive) {
            this.ship.firePrimaryWeapon(this);
            // Don't reset the firing flag - allow continuous firing
        }
    }
}