import * as THREE from 'three';
import BlasterBolt from './blaster-bolt.js';

/**
 * Primary weapon system for ships, handling firing mechanics and projectile management.
 * Supports energy-based firing with convergence aiming and networked synchronization.
 */
export default class PrimaryWeapon {
    /**
     * Creates a new primary weapon.
     * @param {Object} ship - The ship that owns this weapon
     * @param {number} energyCost - Energy cost per shot (default: 5)
     * @param {number} damage - Damage per bolt (default: 10)
     * @param {number} fireRate - Shots per second (default: 5)
     * @param {number} convergenceRange - Distance for full convergence (default: 50)
     */
    constructor(ship, energyCost = 5, damage = 10, fireRate = 5, convergenceRange = 50) {
        this.ship = ship;
        this.energyCost = energyCost;
        this.damage = damage;
        this.fireRate = fireRate; // Shots per second
        this.fireInterval = 1 / fireRate; // Time between shots
        this.convergenceRange = convergenceRange;
        this.lastShotTime = 0;
        this.bolts = [];
        this.isFiring = false;
        this.fireTimer = 0; // For continuous firing
    }

    /**
     * Checks if the weapon can fire at the given time.
     * @param {number} currentTime - Current game time in seconds
     * @returns {boolean} True if weapon can fire
     */
    canFire(currentTime) {
        return (currentTime - this.lastShotTime) >= this.fireInterval;
    }

    /**
     * Attempts to fire the weapon.
     * @param {Player} player - The player firing the weapon
     * @returns {boolean} True if firing was successful
     */
    fire(player) {
        const currentTime = Date.now() / 1000;

        // Check firing conditions
        if (!this.canFire(currentTime) || this.ship.energy < this.energyCost) {
            return false;
        }

        // Drain energy
        this.ship.energy -= this.energyCost;
        this.ship.lastEnergyActionTime = currentTime;
        this.lastShotTime = currentTime;

        // Calculate firing parameters
        const firingPosition = this._calculateFiringPosition(player);
        const direction = this._calculateFiringDirection(player, currentTime);

        // Create and configure bolt
        const bolt = new BlasterBolt(firingPosition, direction, player.velocity, this.damage);
        bolt.setOwnerId(window.myPlayerId || 0);
        this.bolts.push(bolt);

        // Send networked fire event
        this._sendNetworkFireEvent(firingPosition, direction);

        return true;
    }

    /**
     * Starts continuous firing.
     */
    startFiring() {
        this.isFiring = true;
        this.fireTimer = 0;
    }

    /**
     * Stops continuous firing.
     */
    stopFiring() {
        this.isFiring = false;
    }

    /**
     * Updates the weapon state.
     * @param {number} deltaTime - Time elapsed since last update
     * @param {Player} player - The player using the weapon
     */
    update(deltaTime, player) {
        // Cap deltaTime to prevent issues when tabbing back in
        const cappedDeltaTime = Math.min(deltaTime, 0.05); // Maximum 50ms per frame
        
        // Handle continuous firing
        if (this.isFiring) {
            this.fireTimer += cappedDeltaTime;
            const currentTime = Date.now() / 1000;

            // Fire at appropriate intervals
            // Limit the number of shots fired at once to prevent issues when tabbing back in after being away
            let shotsFired = 0;
            const maxShotsPerUpdate = 5; // Limit to prevent excessive bolt creation
            while (this.fireTimer >= this.fireInterval && this.canFire(currentTime) && shotsFired < maxShotsPerUpdate) {
                this.fire(player);
                this.fireTimer -= this.fireInterval;
                shotsFired++;
            }
        }

        // Update bolts and remove expired ones
        this.bolts = this.bolts.filter(bolt => !bolt.update(cappedDeltaTime));
        
        // Limit the number of active bolts to prevent performance issues
        if (this.bolts.length > 50) { // Reasonable limit to prevent too many bolts
            // Remove oldest bolts if we have too many
            while (this.bolts.length > 50) {
                const bolt = this.bolts.shift(); // Remove oldest bolt from the beginning
                if (bolt.mesh && bolt.mesh.parent) {
                    bolt.mesh.parent.remove(bolt.mesh);
                }
            }
        }
    }

    /**
     * Gets all active bolts.
     * @returns {BlasterBolt[]} Array of active bolts
     */
    getBolts() {
        return this.bolts;
    }

    /**
     * Calculates the firing position in front of the ship.
     * @private
     * @param {Player} player - The firing player
     * @returns {THREE.Vector3} Firing position
     */
    _calculateFiringPosition(player) {
       // Check if ship mesh is loaded before accessing it
       if (!player.ship.mesh) {
           // Return a default position if mesh is not loaded yet
           return player.position.clone();
       }
       const offset = new THREE.Vector3(0, 0, -1)
           .applyQuaternion(player.ship.mesh.quaternion)
           .multiplyScalar(2);
       return player.position.clone().add(offset);
   }

    /**
     * Calculates the firing direction with convergence aiming.
     * @private
     * @param {Player} player - The firing player
     * @param {number} currentTime - Current time
     * @returns {THREE.Vector3} Normalized firing direction
     */
    _calculateFiringDirection(player, currentTime) {
       // Check if ship mesh is loaded before accessing it
       if (!player.ship.mesh) {
           // Return a default forward direction if mesh is not loaded yet
           return new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
       }
       const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.ship.mesh.quaternion);

       // Camera-based aiming for convergence
       const cameraOffset = new THREE.Vector3(0, 2, 5).applyQuaternion(player.quaternion);
       const cameraPosition = player.position.clone().add(cameraOffset);
       const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
       const targetPoint = cameraPosition.clone().add(
           cameraForward.clone().multiplyScalar(this.convergenceRange)
       );
       const firingPosition = this._calculateFiringPosition(player);
       const cameraDirection = targetPoint.clone().sub(firingPosition).normalize();

       // Convergence based on sustained firing time
       const timeSinceLastShot = currentTime - this.lastShotTime;
       const convergenceFactor = Math.min(timeSinceLastShot * 2, 1);

       return shipForward.clone().lerp(cameraDirection, convergenceFactor).normalize();
   }

    /**
     * Sends fire event to server for network synchronization.
     * @private
     * @param {THREE.Vector3} position - Firing position
     * @param {THREE.Vector3} direction - Firing direction
     */
    _sendNetworkFireEvent(position, direction) {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({
                type: 'fire',
                direction: { x: direction.x, y: direction.y, z: direction.z },
                position: { x: position.x, y: position.y, z: position.z }
            }));
        }
    }
}