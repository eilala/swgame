import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as RAPIER from '@dimforge/rapier3d';
import PrimaryWeapon from '../weapons/primary-weapon.js';

export default class BaseShip {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world; // Store world reference
        this.mesh = null; // Initialize as null until loaded
        this.modelLoaded = false; // Track loading state
        
        const loader = new GLTFLoader();
        loader.load(
            'src/assets/models/tiefighter/TIEFighter.glb',
            (gltf) => {
                this.mesh = gltf.scene;
                // Optional: Adjust scale, rotation, etc.
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
                        child.userData.isPlayer = true;
                        child.userData.playerId = window.myPlayerId || 0;

                        console.log(`Assigned mesh "${child.name}" to component "${componentId}"`);
                    }
                });

                // Add to scene after loading
                this.scene.add(this.mesh);
                this.modelLoaded = true; // Mark as loaded
                console.log('Player ship model added to scene');

                // Create physics body for the player ship
                this.createPhysicsBody();
            },
            undefined,
            (error) => {
                console.error('An error happened loading the GLTF model:', error);
                // Fallback to cube if loading fails
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                this.mesh = new THREE.Mesh(geometry, material);
                this.scene.add(this.mesh);
                this.modelLoaded = true; // Mark as loaded (with fallback)
                
                // Traverse the model and assign component health, also mark as player parts
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        // Assign component-specific health based on mesh name
                        let componentId = null;

                        // Check for the specific component names: RightWing, LeftWing, MainHull
                        // Handle actual mesh names like RightWing_3
                        if (child.name.includes('RightWing') || child.name === 'RightWing' ||
                            child.name.includes('RightWing_') ||
                            (child.name.includes('001Wing') && child.position && child.position.x > 0)) {
                            componentId = 'right_wing';
                        } else if (child.name.includes('LeftWing') || child.name === 'LeftWing' ||
                                   child.name.includes('LeftWing_') ||
                                   (child.name.includes('001Wing') && child.position && child.position.x < 0)) {
                            componentId = 'left_wing';
                        } else if (child.name.includes('MainHull') || child.name === 'MainHull' ||
                                   child.name.includes('MainHull_')) {
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
                        child.userData.isPlayer = true; // Use same flag as other players for consistency
                        child.userData.playerId = window.myPlayerId || 0; // Set player ID for the local player

                        console.log(`Player ship: Assigned mesh "${child.name}" to component "${componentId}"`);
                    }
                });
            }
        );

        this.turnSpeed = 2;

        // Stats
        this.shield = 10; // Reduced for testing component destruction
        this.maxShield = 10;
        this.hull = 100;
        this.maxHull = 100;
        this.energy = 100;
        this.maxEnergy = 100;
        this.energyRegenerationRate = 10; // Energy per second
        this.energyDrainTimeout = 2; // Seconds to wait before regeneration starts
        this.lastEnergyActionTime = 0; // Time of last energy action
        this.energyRegenerationStartTime = 0; // Time when regeneration should start
        
        // Shield regeneration properties
        this.shieldRegenerationRate = 5; // Shield points per second
        this.shieldDrainTimeout = 3; // Seconds to wait after taking damage before regeneration starts
        this.lastShieldDamageTime = 0; // Time of last shield damage
        this.shieldRegenerationStartTime = 0; // Time when shield regeneration should start

        // Component health tracking for localized damage
        this.componentHealth = {};
        this.componentMeshes = {};

        // Total hull health (separate from component health)
        this.totalHullHealth = 100;
        this.maxTotalHullHealth = 100;

        // Constants (scaled for per-second physics at 60 FPS, further increased for responsiveness)
        this.acceleration = 10; // Further increased from 1.8 for even faster acceleration
        this.maxSpeedForward = 250; // Further increased from 120 for higher top speed
        this.maxSpeedBackward = 50; // Further increased from 30 for better maneuverability
        this.drag = Math.pow(0.99, 60); // ~0.548 per second
        this.boostMultiplier = 2;
        this.boosting = false;
        
        // Initialize the primary weapon
        this.primaryWeapon = new PrimaryWeapon(this);

        // Firing state flags
        this.isFiringPrimary = false;
    }

    createPhysicsBody() {
        if (!this.world) {
            console.error('World not available for physics body creation');
            return;
        }

        // Create a kinematic rigid body for the ship (controlled by game logic)
        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.kinematicPositionBased();
        this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create a collider based on the mesh's bounding box
        const box = new THREE.Box3().setFromObject(this.mesh);
        const size = box.getSize(new THREE.Vector3());
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        colliderDesc.setCollisionGroups(0b0001); // Local player collision group
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);

        // Store reference to the mesh and other data
        this.rigidBody.userData = {
            mesh: this.mesh,
            isPlayer: true,
            isLocalPlayer: true,
            playerId: window.myPlayerId || 0
        };

        // Position the rigid body at the mesh's position
        this.rigidBody.setTranslation(this.mesh.position, true);
        this.rigidBody.setRotation(this.mesh.quaternion, true);

        console.log('Physics body created for player ship');
    }

    update(player, deltaTime) {
        // Cap deltaTime to prevent issues when tabbing back in
        const cappedDeltaTime = Math.min(deltaTime, 0.05); // Maximum 50ms per frame
        
        // Only update if the model has been loaded
        if (!this.modelLoaded) {
            return; // Skip update if model hasn't loaded yet
        }
        
        // Update the weapon system with player for continuous firing
        this.primaryWeapon.update(cappedDeltaTime, player);

        // Position the ship at the player's location
        this.mesh.position.copy(player.position);

        // Update rotation to follow player's camera
        const targetQuaternion = player.quaternion;
        const step = this.turnSpeed * cappedDeltaTime;
        this.mesh.quaternion.rotateTowards(targetQuaternion, step);

        // Update physics body position and rotation
        if (this.rigidBody) {
            this.rigidBody.setTranslation(this.mesh.position, true);
            this.rigidBody.setRotation(this.mesh.quaternion, true);
        }
    }
    
    // Method to fire the primary weapon
    firePrimaryWeapon(player) {
        return this.primaryWeapon.fire(player);
    }
    
    // Method to handle taking damage
    takeDamage(damage, componentId = null) {
        // Update the last shield damage time
        const currentTime = Date.now() / 1000; // Convert to seconds
        this.lastShieldDamageTime = currentTime;

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
                    console.log(`Player ship component ${componentId} health reached 0, destroying component!`);
                    this.destroyComponent(componentId);

                    // Send component destruction to server for multiplayer sync
                    if (window.ws && window.ws.readyState === WebSocket.OPEN && window.myPlayerId) {
                        console.log(`Sending component destruction message for ${componentId}`);
                        window.ws.send(JSON.stringify({
                            type: 'playerComponentDestroyed',
                            playerId: window.myPlayerId,
                            componentId: componentId
                        }));
                    }
                }

                console.log(`Player ship component ${componentId} damaged for ${componentDamage}, remaining component health: ${this.componentHealth[componentId]}`);
            }

            // Apply any remaining damage to legacy hull (for backward compatibility)
            if (remainingDamage > 0) {
                this.hull -= remainingDamage;
                this.hull = Math.max(0, this.hull);
                console.log(`Legacy hull damage: ${remainingDamage}, remaining hull: ${this.hull}`);
            }

            console.log(`Player ship total hull health: ${this.totalHullHealth}/100`);
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
            console.log('Player ship destroyed!');
        }

        return isDestroyed;
    }

    destroyComponent(componentId) {
        if (this.componentMeshes[componentId]) {
            const meshes = this.componentMeshes[componentId];

            // Remove all meshes belonging to this component
            meshes.forEach(mesh => {
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                    console.log(`Player ship component ${componentId} mesh "${mesh.name}" destroyed and removed`);
                }
            });

            // Remove from tracking
            delete this.componentHealth[componentId];
            delete this.componentMeshes[componentId];

            console.log(`Player ship component ${componentId} fully destroyed`);
        }
    }
}
