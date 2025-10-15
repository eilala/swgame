import * as THREE from 'three';

/**
 * Represents a blaster bolt projectile with physics and visual representation.
 * Handles movement, lifetime, and collision detection properties.
 */
export default class BlasterBolt {
    /**
     * Creates a new blaster bolt.
     * @param {THREE.Vector3} position - Initial position of the bolt
     * @param {THREE.Vector3} direction - Direction vector for travel
     * @param {THREE.Vector3} shipVelocity - Velocity of the firing ship
     * @param {number} damage - Damage dealt on impact (default: 10)
     */
    constructor(position, direction, shipVelocity, damage = 10) {
        // Validate input parameters
        if (!position || !direction || !shipVelocity) {
            throw new Error('BlasterBolt constructor requires position, direction, and shipVelocity');
        }

        this.damage = damage;
        this.ownerId = null; // Will be set by primary weapon
        this.lifetime = 2.0; // Extended lifetime (travels 120 units at speed 60)
        this.age = 0;
        this.isDestroyed = false;

        // Create visual representation with proper geometry
        this._createVisual();

        // Set up physics
        this._setupPhysics(position, direction, shipVelocity);

        // Mark for collision detection
        this.mesh.userData = {
            isBlasterBolt: true,
            ownerId: this.ownerId,
            damage: this.damage,
            age: this.age
        };
    }

    /**
     * Creates the visual mesh for the blaster bolt.
     * @private
     */
    _createVisual() {
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00aaff,
            emissive: 0x0066ff
        });

        this.mesh = new THREE.Mesh(geometry, material);
    }

    /**
     * Sets up physics properties and initial position/orientation.
     * @private
     */
    _setupPhysics(position, direction, shipVelocity) {
        // Normalize direction for consistent behavior
        this.direction = direction.clone().normalize();

        // Calculate final velocity (bolt speed + ship velocity)
        const boltSpeed = 60; // Base bolt speed
        const baseVelocity = this.direction.clone().multiplyScalar(boltSpeed);
        this.velocity = shipVelocity.clone().add(baseVelocity);

        // Position and orient the bolt
        this.mesh.position.copy(position);
        this.previousPosition = position.clone(); // Store initial position as previous
        this.mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), // Cylinder default orientation
            this.direction
        );
    }

    /**
     * Updates the bolt's position and checks lifetime.
     * @param {number} deltaTime - Time elapsed since last update
     * @returns {boolean} True if bolt should be destroyed
     */
    update(deltaTime) {
        if (this.isDestroyed) {
            return true;
        }

        // Cap deltaTime to prevent large jumps when tabbing back in
        const cappedDeltaTime = Math.min(deltaTime, 0.05); // Maximum 50ms per frame

        // Update age
        this.age += cappedDeltaTime;

        // Check lifetime
        if (this.age >= this.lifetime) {
            this.destroy();
            return true;
        }

        // Update previous position before moving
        this.previousPosition.copy(this.mesh.position);

        // Move bolt
        this.mesh.position.add(this.velocity.clone().multiplyScalar(cappedDeltaTime));

        // Update mesh userData for collision detection
        this.mesh.userData.age = this.age;

        return false;
    }

    /**
     * Destroys the bolt and marks it for removal.
     */
    destroy() {
        this.isDestroyed = true;
    }

    /**
     * Gets the bounding box for collision detection.
     * @returns {THREE.Box3} Bounding box of the bolt
     */
    getBoundingBox() {
        return new THREE.Box3().setFromObject(this.mesh);
    }

    /**
     * Sets the owner ID for networked identification.
     * @param {string|number} ownerId - ID of the owning player/ship
     */
    setOwnerId(ownerId) {
        this.ownerId = ownerId;
        this.mesh.userData.ownerId = ownerId;
    }
}