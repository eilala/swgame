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

        // Load the TIE Fighter model
        const loader = new GLTFLoader();
        loader.load(
            'src/assets/models/tiefighter/TIEFighter.glb',
            (gltf) => {
                this.mesh = gltf.scene;
                // Position the enemy
                this.mesh.position.copy(position);
                // Optional: Adjust scale if needed (currently 1,1,1)
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

                // Log bounding box for size reference
                const box = new THREE.Box3().setFromObject(this.mesh);
                console.log(`Enemy model bounding box:`, box.min, box.max);
                const size = box.getSize(new THREE.Vector3());
                console.log(`Enemy model size: ${size.x} x ${size.y} x ${size.z}`);

                // Add to scene after loading
                scene.add(this.mesh);
                console.log('Enemy model added to scene:', this.id);

                // Mark the mesh as an enemy for easy identification
                this.mesh.userData = this.mesh.userData || {};
                this.mesh.userData.isEnemy = true;
                this.mesh.userData.enemyId = this.id;
                
                // Mark all child meshes as enemies too
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.userData = child.userData || {};
                        child.userData.isEnemy = true;
                        child.userData.enemyId = this.id;
                    }
                });

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

    takeDamage(damage) {
        // Validate damage input
        if (typeof damage !== 'number' || damage < 0) {
            console.warn('Invalid damage value:', damage);
            return false;
        }

        // First, damage the shield
        if (this.shield > 0) {
            const shieldDamage = Math.min(damage, this.shield);
            this.shield -= shieldDamage;
            damage -= shieldDamage;

            // Ensure shield doesn't go below 0
            this.shield = Math.max(0, this.shield);
        }

        // Then damage health if shield is depleted
        if (damage > 0) {
            this.health -= damage;
            // Ensure health doesn't go below 0
            this.health = Math.max(0, this.health);
        }

        // Return true if enemy is destroyed
        return this.health <= 0;
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
}