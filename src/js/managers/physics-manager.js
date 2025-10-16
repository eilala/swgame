import * as THREE from 'three';

/**
 * Manages physics simulation and rigid body updates
 */
export default class PhysicsManager {
    constructor(world, gameState) {
        this.world = world;
        this.gameState = gameState;
        this.physicsBodies = new Map();
        this.isdBodies = [];
        this.debrisBodies = new Map(); // Track debris physics bodies separately
    }

    /**
     * Initialize physics world
     */
    init() {
        if (!this.world) {
            console.error('Physics world not provided to PhysicsManager');
            return;
        }

        console.log('PhysicsManager initialized with world:', this.world);
    }

    /**
     * Update physics simulation
     */
    update(deltaTime) {
        if (!this.world) return;

        // Cap deltaTime to prevent large jumps
        const cappedDeltaTime = Math.min(deltaTime, 0.05);

        // Step the physics simulation
        this.world.step();

        // Handle Rapier collisions
        this.handleRapierCollisions();

        // Update kinematic bodies to match their mesh positions
        this.syncKinematicBodies();
    }

    /**
     * Handle collisions using Rapier event system
     */
    handleRapierCollisions() {
        if (!this.world) return;

        try {
            // Check for intersections manually using contact pairs
            this.world.forEachCollider((collider) => {
                const body = collider.parent();
                const userData = body.userData || {};

                // Only check player colliders
                if (userData.isPlayer) {
                    // Check intersection with ISD colliders
                    this.world.forEachCollider((isdCollider) => {
                        const isdBody = isdCollider.parent();
                        const isdUserData = isdBody.userData || {};

                        if (isdUserData.isISD && collider !== isdCollider) {
                            // Check if these colliders are intersecting using narrow phase
                            const contact = this.world.narrowPhase.contactPair(collider, isdCollider);

                            if (contact && contact.hasAnyActiveContact) {
                                this.handleISDCollision(userData, isdBody);
                            }
                        }
                    });
                }
            });
        } catch (error) {
            console.warn('Rapier collision handling error:', error);
            // Fallback could be implemented here
        }
    }

    /**
     * Handle player collision with ISD
     */
    handleISDCollision(playerUserData, isdBody) {
        console.log('Player collided with ISD!');

        const playerMesh = playerUserData.mesh;
        if (!playerMesh) return;

        // Calculate direction from ISD to player
        const isdPos = isdBody.translation();
        const playerPos = playerMesh.position;

        const direction = {
            x: playerPos.x - isdPos.x,
            y: playerPos.y - isdPos.y,
            z: playerPos.z - isdPos.z
        };

        // Normalize direction
        const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
        if (length > 0) {
            direction.x /= length;
            direction.y /= length;
            direction.z /= length;
        }

        // Push player away
        const pushDistance = 2.0;
        playerMesh.position.x += direction.x * pushDistance;
        playerMesh.position.y += direction.y * pushDistance;
        playerMesh.position.z += direction.z * pushDistance;

        // Update physics body position
        const playerRigidBody = playerUserData.rigidBody || this.findRigidBodyForMesh(playerMesh);
        if (playerRigidBody) {
            playerRigidBody.setTranslation({
                x: playerMesh.position.x,
                y: playerMesh.position.y,
                z: playerMesh.position.z
            }, true);
        }

        // Update player's logical position
        if (this.gameState.player && playerMesh === this.gameState.player.ship.mesh) {
            this.gameState.player.position.copy(playerMesh.position);
        }

        console.log('Pushed player away from ISD');
    }

    /**
     * Create physics rigid body for player ships
     */
    createPlayerRigidBody(mesh, isLocalPlayer = false) {
        if (!this.world) {
            console.error('Physics world not available');
            return null;
        }

        // Create kinematic rigid body for ships (controlled by game logic)
        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.kinematicPositionBased();
        const rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create collider based on mesh bounding box
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        colliderDesc.setCollisionGroups(isLocalPlayer ? 0b0001 : 0b0010); // Different groups for local vs other players
        const collider = this.world.createCollider(colliderDesc, rigidBody);

        // Store reference to mesh and other data
        rigidBody.userData = {
            mesh: mesh,
            isPlayer: true,
            isLocalPlayer: isLocalPlayer,
            playerId: isLocalPlayer ? this.gameState.getPlayerId() : mesh.userData?.playerId,
            rigidBody: rigidBody // Reference for collision handling
        };

        this.physicsBodies.set(mesh, rigidBody);
        return rigidBody;
    }

    /**
     * Create physics rigid body for enemies
     */
    createEnemyRigidBody(mesh, enemyId) {
        if (!this.world) {
            console.error('Physics world not available');
            return null;
        }

        // Create kinematic rigid body for enemies
        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.kinematicPositionBased();
        const rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create collider based on mesh bounding box
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        colliderDesc.setCollisionGroups(0b0100); // Enemy collision group
        const collider = this.world.createCollider(colliderDesc, rigidBody);

        // Store reference to mesh and other data
        rigidBody.userData = {
            mesh: mesh,
            isEnemy: true,
            enemyId: enemyId,
            rigidBody: rigidBody
        };

        this.physicsBodies.set(mesh, rigidBody);
        return rigidBody;
    }

    /**
     * Create physics rigid body for blaster bolts
     */
    createBoltRigidBody(mesh, ownerId, damage) {
        if (!this.world) {
            console.error('Physics world not available');
            return null;
        }

        // Create kinematic rigid body for bolts
        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.kinematicPositionBased();
        const rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create small collider for bolt
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(0.05, 0.25, 0.05);
        colliderDesc.setCollisionGroups(0b1000); // Projectile collision group
        const collider = this.world.createCollider(colliderDesc, rigidBody);

        // Store reference to mesh and other data
        rigidBody.userData = {
            mesh: mesh,
            isBlasterBolt: true,
            ownerId: ownerId,
            damage: damage,
            rigidBody: rigidBody
        };

        this.physicsBodies.set(mesh, rigidBody);
        return rigidBody;
    }

    /**
     * Register ISD physics bodies for collision detection
     */
    registerISDBodies(isdBodies) {
        this.isdBodies = isdBodies;
    }

    /**
     * Sync kinematic rigid bodies to match their mesh positions
     */
    syncKinematicBodies() {
        this.physicsBodies.forEach((rigidBody, mesh) => {
            if (rigidBody && mesh && mesh.parent) {
                // Update position and rotation
                rigidBody.setTranslation(mesh.position, true);
                if (mesh.quaternion) {
                    rigidBody.setRotation(mesh.quaternion, true);
                }
            }
        });
    }

    /**
     * Update position of a specific rigid body
     */
    updateRigidBodyPosition(mesh, position, rotation = null) {
        const rigidBody = this.physicsBodies.get(mesh);
        if (rigidBody) {
            rigidBody.setTranslation(position, true);
            if (rotation) {
                rigidBody.setRotation(rotation, true);
            }
        }
    }

    /**
     * Update velocity of a specific rigid body
     */
    updateRigidBodyVelocity(mesh, velocity) {
        const rigidBody = this.physicsBodies.get(mesh);
        if (rigidBody) {
            rigidBody.setLinvel(velocity, true);
        }
    }

    /**
     * Remove a rigid body from the physics world
     */
    removeRigidBody(mesh) {
        const rigidBody = this.physicsBodies.get(mesh);
        if (rigidBody) {
            this.world.removeRigidBody(rigidBody);
            this.physicsBodies.delete(mesh);
        }
    }

    /**
     * Find rigid body associated with a mesh
     */
    findRigidBodyForMesh(mesh) {
        return this.physicsBodies.get(mesh) || null;
    }

    /**
     * Get all physics bodies
     */
    getPhysicsBodies() {
        return Array.from(this.physicsBodies.values());
    }

    /**
     * Clean up physics bodies that are no longer needed
     */
    cleanup() {
        // Remove bodies for meshes that are no longer in scene
        for (const [mesh, rigidBody] of this.physicsBodies) {
            if (!mesh.parent) {
                this.world.removeRigidBody(rigidBody);
                this.physicsBodies.delete(mesh);
            }
        }

        // Clean up debris bodies
        for (const [mesh, rigidBody] of this.debrisBodies) {
            if (!mesh.parent) {
                this.world.removeRigidBody(rigidBody);
                this.debrisBodies.delete(mesh);
            }
        }
    }

    /**
     * Register a debris physics body
     * @param {THREE.Mesh} mesh - The debris mesh
     * @param {Rapier.RigidBody} rigidBody - The physics body
     */
    registerDebrisBody(mesh, rigidBody) {
        this.debrisBodies.set(mesh, rigidBody);
    }

    /**
     * Remove a debris physics body
     * @param {THREE.Mesh} mesh - The debris mesh
     */
    removeDebrisBody(mesh) {
        const rigidBody = this.debrisBodies.get(mesh);
        if (rigidBody) {
            this.world.removeRigidBody(rigidBody);
            this.debrisBodies.delete(mesh);
        }
    }
}