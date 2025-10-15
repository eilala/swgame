import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d';

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
    constructor(position, direction, shipVelocity, damage = 10, world = null) {
        // Validate input parameters
        if (!position || !direction || !shipVelocity) {
            throw new Error('BlasterBolt constructor requires position, direction, and shipVelocity');
        }

        this.world = world; // Store world reference

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

        // Track targets already hit to prevent duplicate damage
        this.hitTargets = new Set();

        // Create physics body
        this.createPhysicsBody();
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
     * Creates physics body for collision detection.
     */
    createPhysicsBody() {
        if (!this.world) {
            console.error('World not available for blaster bolt physics body creation');
            return;
        }

        // Create a kinematic rigid body for the bolt (controlled by game logic)
        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.kinematicPositionBased();
        this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create a small collider for the bolt
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(0.05, 0.25, 0.05); // Small collision box
        colliderDesc.setCollisionGroups(0b1000); // Projectile collision group
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);

        // Store reference to the mesh and other data
        this.rigidBody.userData = {
            mesh: this.mesh,
            isBlasterBolt: true,
            ownerId: this.ownerId,
            damage: this.damage
        };

        // Position the rigid body at the mesh's position
        this.rigidBody.setTranslation(this.mesh.position, true);
        this.rigidBody.setRotation(this.mesh.quaternion, true);

        // console.log('Physics body created for blaster bolt');
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

        // Update physics body position and rotation
        if (this.rigidBody) {
            this.rigidBody.setTranslation(this.mesh.position, true);
            this.rigidBody.setRotation(this.mesh.quaternion, true);
        }

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