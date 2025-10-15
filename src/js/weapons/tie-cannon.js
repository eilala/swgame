import * as THREE from 'three';
import LaserImperial from './laser-imperial.js';
import { TieCannonConfig } from '../config/weapons/tie-cannon.js';

/**
 * Tie Cannon weapon system for imperial Tie Fighters, handling firing mechanics and projectile management.
 * Fires two laser bolts side by side, similar to the actual Tie Fighter cannons.
 */
export default class TieCannon {
    /**
     * Creates a new Tie Cannon.
     * @param {Object} ship - The ship that owns this weapon
     */
    constructor(ship) {
        this.ship = ship;
        this.energyCost = TieCannonConfig.PRIMARY.ENERGY_COST_PER_BOLT;
        this.damage = TieCannonConfig.PRIMARY.DAMAGE;
        this.fireRate = TieCannonConfig.PRIMARY.FIRE_RATE;
        this.fireInterval = 1 / this.fireRate;
        this.convergenceRange = TieCannonConfig.PRIMARY.CONVERGENCE_RANGE;
        this.spreadDistance = TieCannonConfig.PRIMARY.SPREAD_DISTANCE;
        this.lastShotTime = 0;
        this.bolts = [];
        this.isFiring = false;
        this.fireTimer = 0;

        // Audio setup
        this.audioLoaded = false;
        this.audioBuffer = null;
        this.loadAudio();
    }

    /**
     * Loads the firing sound effect (Tie Laser sound).
     */
    loadAudio() {
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(
            '/assets/sfx/TIE_Laser.ogg',
            (buffer) => {
                this.audioBuffer = buffer;
                this.audioLoaded = true;
                console.log('Tie Laser sound loaded successfully');
            },
            (progress) => {
                console.log('Loading Tie Laser sound...', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.warn('Failed to load Tie Laser sound:', error);
                this.audioLoaded = false;
            }
        );
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
        if (!this.canFire(currentTime) || this.ship.energy < this.energyCost * 2) { // Double energy cost for two bolts
            return false;
        }

        // Drain energy
        this.ship.energy -= this.energyCost * 2; // Double cost for two bolts
        this.ship.lastEnergyActionTime = currentTime;
        this.lastShotTime = currentTime;

        // Calculate firing parameters
        const firingPosition = this._calculateFiringPosition(player);
        const direction = this._calculateFiringDirection(player, currentTime);

        // Calculate spread offset perpendicular to firing direction (side by side)
        // Use ship up vector to ensure spread is always horizontal relative to ship
        const shipUp = new THREE.Vector3(0, 1, 0);
        if (player.ship && player.ship.mesh) {
            shipUp.applyQuaternion(player.ship.mesh.quaternion);
        }

        const rightVector = new THREE.Vector3()
            .crossVectors(direction, shipUp)
            .normalize()
            .multiplyScalar(this.spreadDistance);

        // Fire left bolt
        const leftBoltPosition = firingPosition.clone().sub(rightVector);
        const leftBolt = new LaserImperial(leftBoltPosition, direction, player.velocity, this.damage, this.ship.world);
        leftBolt.setOwnerId(window.myPlayerId || 0);
        this.bolts.push(leftBolt);

        // Fire right bolt
        const rightBoltPosition = firingPosition.clone().add(rightVector);
        const rightBolt = new LaserImperial(rightBoltPosition, direction, player.velocity, this.damage, this.ship.world);
        rightBolt.setOwnerId(window.myPlayerId || 0);
        this.bolts.push(rightBolt);

        // Send networked fire event
        this._sendNetworkFireEvent(leftBoltPosition, rightBoltPosition, direction);

        // Play firing sound
        this._playFiringSound(firingPosition);

        return true;
    }

    /**
     * Plays the firing sound effect at the given position.
     * @private
     * @param {THREE.Vector3} position - Position where the sound should originate
     */
    _playFiringSound(position) {
        if (!this.audioLoaded || !this.audioBuffer) {
            return;
        }

        try {
            // Get the audio listener from the global camera
            const audioListener = window.camera?.audioListener;
            if (!audioListener) {
                console.warn('AudioListener not found on camera');
                return;
            }

            // Create positional audio source
            const sound = new THREE.PositionalAudio(audioListener);
            sound.setBuffer(this.audioBuffer);
            sound.setRefDistance(20); // Distance at which volume starts to attenuate
            sound.setVolume(0.025); // Louder for Tie cannon dual fire

            // Position the sound at the firing location
            sound.position.copy(position);
            scene.add(sound);

            // Play the sound
            sound.play();

            // Clean up after sound finishes (with some buffer time)
            setTimeout(() => {
                if (sound.parent) {
                    sound.parent.remove(sound);
                }
            }, 1000); // 1 second should be enough for most laser sounds

        } catch (error) {
            console.warn('Failed to play firing sound:', error);
        }
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

        // Handle continuous firing - only fire if not tabbed out and energy available
        if (this.isFiring && !document.hidden && this.ship.energy >= this.energyCost * 2) {
            this.fireTimer += cappedDeltaTime;
            const currentTime = Date.now() / 1000;

            // Fire at appropriate intervals
            // Limit the number of shots fired at once to prevent issues when tabbing back in after being away
            let shotsFired = 0;
            const maxShotsPerUpdate = 1; // Reduced to just 1 shot per update when tabbing back in
            while (this.fireTimer >= this.fireInterval && this.canFire(currentTime) && shotsFired < maxShotsPerUpdate) {
                this.fire(player);
                this.fireTimer -= this.fireInterval;
                shotsFired++;
            }
        } else if (!this.isFiring) {
            // Reset timer when not firing to prevent accumulation
            this.fireTimer = 0;
        }

        // Update bolts and remove expired ones
        this.bolts = this.bolts.filter(bolt => !bolt.update(cappedDeltaTime));

        // Limit the number of active bolts to prevent performance issues
        if (this.bolts.length > 100) { // Higher limit since we're firing two bolts per shot
            // Remove oldest bolts if we have too many
            while (this.bolts.length > 100) {
                const bolt = this.bolts.shift(); // Remove oldest bolt from the beginning
                if (bolt.mesh && bolt.mesh.parent) {
                    bolt.mesh.parent.remove(bolt.mesh);
                }
            }
        }
    }

    /**
     * Gets all active bolts.
     * @returns {LaserImperial[]} Array of active bolts
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
        if (!player.ship || !player.ship.mesh) {
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
        if (!player.ship || !player.ship.mesh) {
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
     * @param {THREE.Vector3} leftPosition - Position of left bolt
     * @param {THREE.Vector3} rightPosition - Position of right bolt
     * @param {THREE.Vector3} direction - Firing direction
     */
    _sendNetworkFireEvent(leftPosition, rightPosition, direction) {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
            window.ws.send(JSON.stringify({
                type: 'fire',
                direction: { x: direction.x, y: direction.y, z: direction.z },
                position: { x: leftPosition.x, y: leftPosition.y, z: leftPosition.z }, // Use left position as primary
            }));
        }
    }
}