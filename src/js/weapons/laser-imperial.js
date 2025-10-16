import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as RAPIER from '@dimforge/rapier3d';
import { LaserImperialConfig } from '../config/bolts/laser-imperial.js';

/**
 * Represents an imperial laser bolt projectile with physics and visual representation.
 * Uses a 3D model instead of a simple cylinder.
 */
export default class LaserImperial {
    /**
     * Creates a new imperial laser bolt.
     * @param {THREE.Vector3} position - Initial position of the bolt
     * @param {THREE.Vector3} direction - Direction vector for travel
     * @param {THREE.Vector3} shipVelocity - Velocity of the firing ship
     * @param {number} damage - Damage dealt on impact (default: 12)
     */
    constructor(position, direction, shipVelocity, damage = LaserImperialConfig.DAMAGE, world = null) {
        // Validate input parameters
        if (!position || !direction || !shipVelocity) {
            throw new Error('LaserImperial constructor requires position, direction, and shipVelocity');
        }

        this.world = world;
        this.damage = damage;
        this.ownerId = null; // Will be set by primary weapon
        this.lifetime = LaserImperialConfig.LIFETIME;
        this.age = 0;
        this.isDestroyed = false;

        // Load the 3D model directly - physics setup happens in _onModelLoaded
        this._loadModel(position, direction, shipVelocity);
    }

    /**
     * Loads the 3D model for the imperial laser bolt.
     * @private
     */
    _loadModel(position, direction, shipVelocity) {
        const loader = new GLTFLoader();
        loader.load(
            LaserImperialConfig.MODEL_PATH,
            (gltf) => {
                // Use the 3D model directly
                this.mesh = gltf.scene;

                // Disable backface culling for all materials
                this.mesh.traverse((child) => {
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach((mat) => {
                                if (mat) {
                                    mat.side = THREE.DoubleSide;
                                    // Make full bright by disabling lighting
                                    mat.lights = false;
                                    // Force emissive glow effect
                                    if (!mat.emissive) {
                                        mat.emissive = new THREE.Color(0x00ff00);
                                    } else {
                                        mat.emissive.setHex(0x00ff00);
                                    }
                                    mat.emissiveIntensity = 1.5; // Increase intensity for stronger glow
                                }
                            });
                        } else {
                            child.material.side = THREE.DoubleSide;
                            // Make full bright by disabling lighting
                            child.material.lights = false;
                            // Force emissive glow effect
                            if (!child.material.emissive) {
                                child.material.emissive = new THREE.Color(0x00ff00);
                            } else {
                                child.material.emissive.setHex(0x00ff00);
                            }
                            child.material.emissiveIntensity = 1.5; // Increase intensity for stronger glow
                        }
                    }
                });

                this._onModelLoaded(position, direction, shipVelocity);
            },
            undefined,
            (error) => {
                console.error('An error happened loading the imperial laser model:', error);
                // Create fallback visual
                this._createFallbackVisual();
                this._onModelLoaded(position, direction, shipVelocity);
            }
        );
    }

    _onModelLoaded(position, direction, shipVelocity) {
        // Set up the mesh (either 3D model or fallback)
        this.mesh.position.copy(position);
        this.mesh.scale.set(0.1, 0.1, 0.1);

        // Orient the model to face the direction of travel
        // For sprites/textures, we want them to face the camera, not follow direction
        if (this.mesh.material && this.mesh.material.map) {
            // This is a sprite/texture, orient it to face the camera
            const cameraDirection = new THREE.Vector3(0, 0, -1);
            if (window.camera) {
                cameraDirection.copy(window.camera.position).sub(position).normalize();
            }
            this.mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                cameraDirection
            );
        } else {
            // This is a 3D model, orient it to face the direction of travel
            this.mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), // Assuming model faces +Z
                direction
            );
        }

        // Add to scene
        scene.add(this.mesh);

        // Setup physics now that we have a mesh
        this._setupPhysics(position, direction, shipVelocity);

        // Mark for collision detection
        this.mesh.userData = {
            isLaserImperial: true,
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
     * Creates a fallback visual representation if model loading fails.
     * @private
     */
    _createFallbackVisual() {
        const geometry = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00, // Bright green for imperial laser
            emissive: 0x00ff00, // Bright green emissive glow
            emissiveIntensity: 3.0 // Even stronger glow effect for fallback
        });

        this.mesh = new THREE.Mesh(geometry, material);
        // Add to scene immediately for fallback
        scene.add(this.mesh);
    }

    /**
     * Creates physics body for collision detection.
     */
    createPhysicsBody() {
        if (!this.world) {
            console.error('World not available for imperial laser physics body creation');
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
            isLaserImperial: true,
            ownerId: this.ownerId,
            damage: this.damage
        };

        // Position the rigid body at the mesh's position
        this.rigidBody.setTranslation(this.mesh.position, true);
        this.rigidBody.setRotation(this.mesh.quaternion, true);

        // console.log('Physics body created for imperial laser bolt');
    }

    /**
     * Sets up physics properties and initial position/orientation.
     * @private
     */
    _setupPhysics(position, direction, shipVelocity) {
        // Normalize direction for consistent behavior
        this.direction = direction.clone().normalize();

        // Calculate final velocity (bolt speed + only forward component of ship velocity)
        const boltSpeed = LaserImperialConfig.SPEED;
        const baseVelocity = this.direction.clone().multiplyScalar(boltSpeed);

        // Only add the component of ship velocity that's in the direction of the bolt
        // This prevents sideways drift while maintaining forward momentum
        const forwardVelocity = shipVelocity.dot(this.direction);
        const shipVelocityContribution = this.direction.clone().multiplyScalar(Math.max(0, forwardVelocity));

        this.velocity = baseVelocity.add(shipVelocityContribution);

        // Position and orient the bolt
        this.mesh.position.copy(position);
        this.previousPosition = position.clone(); // Store initial position as previous

        // Update mesh userData for collision detection
        this.mesh.userData.age = this.age;
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

        // Update position and previous position
        if (this.mesh) {
            // Update previous position before moving
            if (this.previousPosition) {
                this.previousPosition.copy(this.mesh.position);
            } else {
                this.previousPosition = this.mesh.position.clone();
            }

            // Move bolt
            this.mesh.position.add(this.velocity.clone().multiplyScalar(cappedDeltaTime));
        }

        // Update mesh userData for collision detection
        if (this.mesh && this.mesh.userData) {
            this.mesh.userData.age = this.age;
        }

        // Update physics body position and rotation
        if (this.rigidBody && this.mesh) {
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
        if (this.mesh && this.mesh.userData) {
            this.mesh.userData.ownerId = ownerId;
        }
    }
}