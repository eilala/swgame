import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as RAPIER from '@dimforge/rapier3d';

export default class BaseEnemy {
    constructor(scene, world, position = new THREE.Vector3(0, 0, 0), health = 50, shield = 25, id = null) {
        this.world = world; // Store world reference
        // Stats
        this.health = health;
        this.maxHealth = health;
        this.shield = shield;
        this.maxShield = shield;

        // Unique ID for networked synchronization
        this.id = id || Math.random().toString(36).substr(2, 9);

        // Component health tracking for localized damage
        this.componentHealth = {};
        this.componentMeshes = {};

        // Total hull health (separate from component health)
        this.totalHullHealth = 100;
        this.maxTotalHullHealth = 100;

        // Load the TIE Fighter model
        const loader = new GLTFLoader();
        const cacheVersion = Date.now(); // Cache busting
        loader.load(
            `src/assets/models/tiefighter/TIEFighter.glb?v=${cacheVersion}`,
            (gltf) => {
                this.mesh = gltf.scene;
                // Position the enemy
                this.mesh.position.copy(position);
                // Optional: Adjust scale if needed (currently 1,1,1)
                this.mesh.scale.set(0.5, 0.5, 0.5);

                // Traverse the model and set material properties for visibility
                // Also assign health to logical components (main body, left wing, right wing)
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        // Ensure materials have proper settings for lighting
                        if (child.material) {
                            // If material is an array, iterate through materials
                            if (Array.isArray(child.material)) {
                                child.material.forEach((mat) => {
                                    if (mat) {
                                        mat.needsUpdate = true;
                                    }
                                });
                            } else {
                                child.material.needsUpdate = true;
                            }
                        }

                        // Assign component-specific health based on mesh name
                        let componentId = null;

                        // Check for the specific component names: RightWing, LeftWing, MainHull
                        // Also handle the actual mesh names that are being detected
                        if (child.name.includes('RightWing') || child.name === 'RightWing' ||
                            (child.name.includes('001Wing') && child.position && child.position.x > 0)) {
                            componentId = 'right_wing';
                        } else if (child.name.includes('LeftWing') || child.name === 'LeftWing' ||
                                   (child.name.includes('001Wing') && child.position && child.position.x < 0)) {
                            componentId = 'left_wing';
                        } else if (child.name.includes('MainHull') || child.name === 'MainHull') {
                            componentId = 'main_body';
                        } else {
                            // Fallback for any other meshes - assume they belong to main body
                            componentId = 'main_body';
                        }

                        // Initialize component health if not already done
                        if (!this.componentHealth[componentId]) {
                            // Assign different health values for different components
                            switch (componentId) {
                                case 'main_body':
                                    this.componentHealth[componentId] = 100; // Main hull component health
                                    break;
                                case 'left_wing':
                                case 'right_wing':
                                    this.componentHealth[componentId] = 50; // Wing component health
                                    break;
                                default:
                                    this.componentHealth[componentId] = 50;
                            }
                            this.componentMeshes[componentId] = [];
                        }

                        // Track all meshes belonging to this component
                        this.componentMeshes[componentId].push(child);
                        child.userData.componentId = componentId;
                        child.userData.isEnemy = true;
                        child.userData.enemyId = this.id;

                        console.log(`Assigned mesh "${child.name}" to component "${componentId}"`);
                    }
                });

                // Log bounding box for size reference
                const box = new THREE.Box3().setFromObject(this.mesh);
                console.log(`Enemy model bounding box:`, box.min, box.max);
                const size = box.getSize(new THREE.Vector3());
                console.log(`Enemy model size: ${size.x} x ${size.y} x ${size.z}`);
                console.log(`Enemy has ${Object.keys(this.componentHealth).length} components`);

                // Add to scene after loading
                scene.add(this.mesh);
                console.log('Enemy model added to scene:', this.id);

                // Mark the mesh as an enemy for easy identification
                this.mesh.userData = this.mesh.userData || {};
                this.mesh.userData.isEnemy = true;
                this.mesh.userData.enemyId = this.id;

                // Create physics body for the enemy
                this.createPhysicsBody();
            },
            undefined,
            (error) => {
                console.error('An error happened loading the enemy GLTF model:', error);
                // Fallback to red cube if loading fails
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                this.mesh = new THREE.Mesh(geometry, material);
                this.mesh.position.copy(position);
                this.mesh.userData = this.mesh.userData || {};
                this.mesh.userData.isEnemy = true;
                this.mesh.userData.enemyId = this.id;
                
                // Mark all child meshes as enemies too (though cube has no children, this ensures consistency)
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.userData = child.userData || {};
                        child.userData.isEnemy = true;
                        child.userData.enemyId = this.id;
                    }
                });

                // Create physics body for the enemy (fallback case)
                this.createPhysicsBody();
            }
        );
    }

    update(deltaTime) {
        // Basic update logic - can be overridden by subclasses
        // For now, enemies just sit there
    }

    takeDamage(damage, componentId = null) {
        // Validate damage input
        if (typeof damage !== 'number' || damage < 0) {
            console.warn('Invalid damage value:', damage);
            return false;
        }

        let remainingDamage = damage;

        // FIRST: Apply damage to shields (shields absorb damage before anything else)
        if (this.shield > 0) {
            const shieldDamage = Math.min(remainingDamage, this.shield);
            this.shield -= shieldDamage;
            remainingDamage -= shieldDamage;
            this.shield = Math.max(0, this.shield);
            console.log(`Shield absorbed ${shieldDamage} damage, remaining shield: ${this.shield}`);
        }

        // SECOND: If shields are depleted and we have remaining damage, apply to components and hull
        if (remainingDamage > 0) {
            // Always apply damage to total hull health
            const totalHullDamage = Math.min(remainingDamage, this.totalHullHealth);
            this.totalHullHealth -= totalHullDamage;
            remainingDamage -= totalHullDamage;
            this.totalHullHealth = Math.max(0, this.totalHullHealth);

            // Apply damage to specific component if provided
            if (componentId && this.componentHealth[componentId] !== undefined) {
                const componentDamage = Math.min(totalHullDamage, this.componentHealth[componentId]);
                this.componentHealth[componentId] -= componentDamage;

                // Ensure component health doesn't go below 0
                this.componentHealth[componentId] = Math.max(0, this.componentHealth[componentId]);

                // If component is destroyed, remove it from scene and notify other players
                if (this.componentHealth[componentId] <= 0) {
                    console.log(`Component ${componentId} destroyed!`);
                    this.destroyComponent(componentId);
    
                    // Send component destruction to server for multiplayer sync
                    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                        window.ws.send(JSON.stringify({
                            type: 'enemyComponentDestroyed',
                            enemyId: this.id,
                            componentId: componentId
                        }));
                    }
                }

                console.log(`Component ${componentId} damaged for ${componentDamage}, remaining component health: ${this.componentHealth[componentId]}`);
            }

            // Apply any remaining damage to legacy health system
            if (remainingDamage > 0) {
                this.health -= remainingDamage;
                this.health = Math.max(0, this.health);
            }

            console.log(`Total hull health: ${this.totalHullHealth}/100`);
        }

        // Check destruction conditions:
        // 1. Total hull health ≤ 0, OR
        // 2. Main hull component destroyed, OR
        // 3. Both wings destroyed
        const mainHullDestroyed = !this.componentHealth.main_body || this.componentHealth.main_body <= 0;
        const leftWingDestroyed = !this.componentHealth.left_wing || this.componentHealth.left_wing <= 0;
        const rightWingDestroyed = !this.componentHealth.right_wing || this.componentHealth.right_wing <= 0;
        const bothWingsDestroyed = leftWingDestroyed && rightWingDestroyed;

        const isDestroyed = this.totalHullHealth <= 0 || mainHullDestroyed || bothWingsDestroyed;

        if (isDestroyed) {
            console.log('Enemy destroyed!');
        }

        return isDestroyed;
    }

    isDestroyed() {
        return this.health <= 0;
    }

    createPhysicsBody() {
        if (!this.world) {
            console.error('World not available for enemy physics body creation');
            return;
        }

        // Create a kinematic rigid body for the enemy (controlled by game logic)
        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.kinematicPositionBased();
        this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create a collider based on the mesh's bounding box
        const box = new THREE.Box3().setFromObject(this.mesh);
        const size = box.getSize(new THREE.Vector3());
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        colliderDesc.setCollisionGroups(0b0100); // Enemy collision group
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);

        // Store reference to the mesh and other data
        this.rigidBody.userData = {
            mesh: this.mesh,
            isEnemy: true,
            enemyId: this.id
        };

        // Position the rigid body at the mesh's position
        this.rigidBody.setTranslation(this.mesh.position, true);
        this.rigidBody.setRotation(this.mesh.quaternion, true);

        console.log('Physics body created for enemy:', this.id);
    }

    update(deltaTime) {
        // Basic update logic - can be overridden by subclasses
        // For now, enemies just sit there

        // Update physics body position and rotation if they exist
        if (this.rigidBody && this.mesh) {
            this.rigidBody.setTranslation(this.mesh.position, true);
            this.rigidBody.setRotation(this.mesh.quaternion, true);
        }
    }

    destroyComponent(componentId) {
        if (this.componentMeshes[componentId]) {
            const meshes = this.componentMeshes[componentId];

            // Remove all meshes belonging to this component
            meshes.forEach(mesh => {
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                    console.log(`Component ${componentId} mesh "${mesh.name}" destroyed and removed from enemy ${this.id}`);
                }
            });

            // Remove from tracking
            delete this.componentHealth[componentId];
            delete this.componentMeshes[componentId];

            console.log(`Component ${componentId} fully destroyed on enemy ${this.id}`);
        }
    }
}