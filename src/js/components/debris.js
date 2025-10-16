import * as THREE from 'three';

/**
 * Represents a piece of debris from a destroyed component
 * Handles physics, fading, and eventual cleanup
 */
export default class Debris {
    constructor(mesh, options = {}) {
        this.mesh = mesh;
        this.scene = options.scene;
        this.world = options.world;

        // Physics properties
        this.velocity = options.velocity || new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );

        this.angularVelocity = options.angularVelocity || new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
        );

        // Visual properties
        this.lifetime = options.lifetime || 3.0; // seconds
        this.fadeStart = this.lifetime * 0.3; // Start fading at 30% of lifetime
        this.currentTime = 0;

        // Store original materials for fading
        this.originalMaterials = [];
        this.storeOriginalMaterials();

        // Add to scene
        if (this.scene && this.mesh) {
            this.scene.add(this.mesh);
        }

        // Create physics body
        this.createPhysicsBody();
    }

    /**
     * Store original materials for fading effect
     */
    storeOriginalMaterials() {
        this.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                this.originalMaterials.push(...materials.map(mat => ({
                    material: mat,
                    originalOpacity: mat.opacity !== undefined ? mat.opacity : 1.0,
                    originalTransparent: mat.transparent || false
                })));
            }
        });
    }

    /**
     * Create physics body for debris
     */
    createPhysicsBody() {
        if (!this.world || !this.mesh) return;

        // Create dynamic rigid body for debris
        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.dynamic();
        this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create collider based on mesh bounding box
        const box = new THREE.Box3().setFromObject(this.mesh);
        const size = box.getSize(new THREE.Vector3());
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        colliderDesc.setCollisionGroups(0b10000); // Debris collision group
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);

        // Set initial position and rotation
        this.rigidBody.setTranslation(this.mesh.position, true);
        this.rigidBody.setRotation(this.mesh.quaternion, true);

        // Apply initial velocity
        this.rigidBody.setLinvel(this.velocity, true);
        this.rigidBody.setAngvel(this.angularVelocity, true);

        // Store reference
        this.rigidBody.userData = {
            mesh: this.mesh,
            isDebris: true,
            debris: this
        };

        // Register with physics manager if available
        if (this.world && this.world.physicsManager) {
            this.world.physicsManager.registerDebrisBody(this.mesh, this.rigidBody);
        }
    }

    /**
     * Update debris physics and visual effects
     */
    update(deltaTime) {
        if (!this.mesh) return false;

        this.currentTime += deltaTime;

        // Update physics
        if (this.rigidBody) {
            // Sync mesh position/rotation with physics body
            const position = this.rigidBody.translation();
            const rotation = this.rigidBody.rotation();

            this.mesh.position.copy(position);
            this.mesh.quaternion.copy(rotation);
        } else {
            // Fallback manual movement if no physics
            this.mesh.position.add(this.velocity.clone().multiplyScalar(deltaTime));
            this.mesh.rotateX(this.angularVelocity.x * deltaTime);
            this.mesh.rotateY(this.angularVelocity.y * deltaTime);
            this.mesh.rotateZ(this.angularVelocity.z * deltaTime);
        }

        // Handle fading
        const fadeProgress = Math.max(0, (this.currentTime - this.fadeStart) / (this.lifetime - this.fadeStart));
        if (fadeProgress > 0) {
            const opacity = Math.max(0, 1.0 - fadeProgress);
            this.setOpacity(opacity);
        }

        // Check if lifetime exceeded
        return this.currentTime >= this.lifetime;
    }

    /**
     * Set opacity for fading effect
     */
    setOpacity(opacity) {
        this.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    if (mat.opacity !== undefined) {
                        mat.opacity = opacity;
                        mat.transparent = opacity < 1.0;
                        mat.needsUpdate = true;
                    }
                });
            }
        });
    }

    /**
     * Clean up debris
     */
    destroy() {
        // Remove from scene
        if (this.scene && this.mesh && this.mesh.parent) {
            this.scene.remove(this.mesh);
        }

        // Remove physics body
        if (this.world && this.rigidBody) {
            this.world.removeRigidBody(this.rigidBody);
        } else if (this.world && this.world.physicsManager) {
            // Use physics manager cleanup
            this.world.physicsManager.removeDebrisBody(this.mesh);
        }

        // Clear references
        this.mesh = null;
        this.rigidBody = null;
    }
}