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
                    }
                });

                // Add to scene after loading
                this.scene.add(this.mesh);
                this.modelLoaded = true; // Mark as loaded
                console.log('Player ship model added to scene');

                // Mark all child meshes as player ship parts too
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.userData = child.userData || {};
                        child.userData.isPlayer = true; // Use same flag as other players for consistency
                        child.userData.playerId = window.myPlayerId || 0; // Set player ID for the local player
                    }
                });

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
                
                // Mark all child meshes as player ship parts too
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.userData = child.userData || {};
                        child.userData.isPlayer = true; // Use same flag as other players for consistency
                        child.userData.playerId = window.myPlayerId || 0; // Set player ID for the local player
                    }
                });
            }
        );

        this.turnSpeed = 2;

        // Stats
        this.shield = 100;
        this.maxShield = 100;
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
    takeDamage(damage) {
        // Update the last shield damage time
        const currentTime = Date.now() / 1000; // Convert to seconds
        this.lastShieldDamageTime = currentTime;
        
        // Apply damage to shield first, then hull
        if (this.shield > 0) {
            const shieldDamage = Math.min(damage, this.shield);
            this.shield -= shieldDamage;
            damage -= shieldDamage;
            console.log(`Shield damage: ${shieldDamage}, remaining shield: ${this.shield}`);
        }
        
        if (damage > 0) {
            this.hull -= damage;
            console.log(`Hull damage: ${damage}, remaining hull: ${this.hull}`);
        }
        
        // If hull is below 0, clamp it to 0
        if (this.hull < 0) {
            this.hull = 0;
        }
        
        return this.hull <= 0; // Return true if ship is destroyed
    }
}
