import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as RAPIER from '@dimforge/rapier3d';
import TieCannon from '../weapons/tie-cannon.js';
import { ImperialTieFighterConfig } from '../config/ships/imperial-tie-fighter.js';

export default class ImperialTieFighter {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.mesh = null;
        this.modelLoaded = false;

        const loader = new GLTFLoader();
        loader.load(
            '/assets/models/tiefighter/TIEFighter.glb',
            (gltf) => {
                this.mesh = gltf.scene;
                this.mesh.scale.set(0.5, 0.5, 0.5);

                // Traverse the model and set material properties for visibility
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        if (child.material) {
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

                        if (child.name.includes('RightWing') || child.name === 'RightWing' ||
                            (child.name.includes('001Wing') && child.position && child.position.x > 0)) {
                            componentId = 'right_wing';
                        } else if (child.name.includes('LeftWing') || child.name === 'LeftWing' ||
                                   (child.name.includes('001Wing') && child.position && child.position.x < 0)) {
                            componentId = 'left_wing';
                        } else if (child.name.includes('MainHull') || child.name === 'MainHull') {
                            componentId = 'main_body';
                        } else {
                            componentId = 'main_body';
                        }

                        if (this.componentHealth[componentId] === undefined) {
                            switch (componentId) {
                                case 'main_body':
                                    this.componentHealth[componentId] = ImperialTieFighterConfig.COMPONENT_HEALTH.main_body;
                                    break;
                                case 'left_wing':
                                case 'right_wing':
                                    this.componentHealth[componentId] = ImperialTieFighterConfig.COMPONENT_HEALTH.left_wing;
                                    break;
                                default:
                                    this.componentHealth[componentId] = ImperialTieFighterConfig.COMPONENT_HEALTH.left_wing;
                            }
                            if (!this.componentMeshes[componentId]) {
                                this.componentMeshes[componentId] = [];
                            }
                        }

                        if (this.componentMeshes[componentId]) {
                            this.componentMeshes[componentId].push(child);
                        }
                        child.userData.componentId = componentId;
                        child.userData.isPlayer = true;
                        child.userData.playerId = window.myPlayerId || 0;

                        console.log(`Assigned mesh "${child.name}" to component "${componentId}"`);
                    }
                });

                this.scene.add(this.mesh);
                this.modelLoaded = true;
                console.log('Imperial Tie Fighter model added to scene');

                this.createPhysicsBody();
            },
            undefined,
            (error) => {
                console.error('An error happened loading the Imperial Tie Fighter GLTF model:', error);
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                const material = new THREE.MeshBasicMaterial({ color: 0x444444 }); // Dark gray for imperial
                this.mesh = new THREE.Mesh(geometry, material);
                this.scene.add(this.mesh);
                this.modelLoaded = true;

                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        let componentId = null;

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
                            componentId = 'main_body';
                        }

                        if (this.componentHealth[componentId] === undefined) {
                            switch (componentId) {
                                case 'main_body':
                                    this.componentHealth[componentId] = ImperialTieFighterConfig.COMPONENT_HEALTH.main_body;
                                    break;
                                case 'left_wing':
                                case 'right_wing':
                                    this.componentHealth[componentId] = ImperialTieFighterConfig.COMPONENT_HEALTH.left_wing;
                                    break;
                                default:
                                    this.componentHealth[componentId] = ImperialTieFighterConfig.COMPONENT_HEALTH.left_wing;
                            }
                            if (!this.componentMeshes[componentId]) {
                                this.componentMeshes[componentId] = [];
                            }
                        }

                        if (this.componentMeshes[componentId]) {
                            this.componentMeshes[componentId].push(child);
                        }
                        child.userData.componentId = componentId;
                        child.userData.isPlayer = true;
                        child.userData.playerId = window.myPlayerId || 0;

                        console.log(`Imperial Tie Fighter: Assigned mesh "${child.name}" to component "${componentId}"`);
                    }
                });
            }
        );

        this.turnSpeed = ImperialTieFighterConfig.TURN_SPEED;

        // Stats
        this.shield = ImperialTieFighterConfig.MAX_SHIELD;
        this.maxShield = ImperialTieFighterConfig.MAX_SHIELD;
        this.hull = ImperialTieFighterConfig.MAX_HULL;
        this.maxHull = ImperialTieFighterConfig.MAX_HULL;
        this.energy = ImperialTieFighterConfig.MAX_ENERGY;
        this.maxEnergy = ImperialTieFighterConfig.MAX_ENERGY;
        this.energyRegenerationRate = ImperialTieFighterConfig.ENERGY_REGENERATION_RATE;
        this.energyDrainTimeout = ImperialTieFighterConfig.ENERGY_DRAIN_TIMEOUT;
        this.lastEnergyActionTime = 0;
        this.energyRegenerationStartTime = 0;

        this.shieldRegenerationRate = ImperialTieFighterConfig.SHIELD_REGENERATION_RATE;
        this.shieldDrainTimeout = ImperialTieFighterConfig.SHIELD_DRAIN_TIMEOUT;
        this.lastShieldDamageTime = 0;
        this.shieldRegenerationStartTime = 0;

        this.componentHealth = {};
        this.componentMeshes = {};

        this.totalHullHealth = ImperialTieFighterConfig.MAX_HULL;
        this.maxTotalHullHealth = ImperialTieFighterConfig.MAX_HULL;

        this.acceleration = ImperialTieFighterConfig.ACCELERATION;
        this.maxSpeedForward = ImperialTieFighterConfig.MAX_SPEED_FORWARD;
        this.maxSpeedBackward = ImperialTieFighterConfig.MAX_SPEED_BACKWARD;
        this.drag = ImperialTieFighterConfig.DRAG;
        this.boostMultiplier = ImperialTieFighterConfig.BOOST_MULTIPLIER;
        this.boosting = false;

        // Initialize the Tie Cannon weapon
        this.primaryWeapon = new TieCannon(this);

        this.isFiringPrimary = false;
    }

    createPhysicsBody() {
        if (!this.world) {
            console.error('World not available for physics body creation');
            return;
        }

        const rigidBodyDesc = window.RAPIER.RigidBodyDesc.kinematicPositionBased();
        this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

        const box = new THREE.Box3().setFromObject(this.mesh);
        const size = box.getSize(new THREE.Vector3());
        const colliderDesc = window.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        colliderDesc.setCollisionGroups(0b0001);
        this.collider = this.world.createCollider(colliderDesc, this.rigidBody);

        this.rigidBody.userData = {
            mesh: this.mesh,
            isPlayer: true,
            isLocalPlayer: true,
            playerId: window.myPlayerId || 0
        };

        this.rigidBody.setTranslation(this.mesh.position, true);
        this.rigidBody.setRotation(this.mesh.quaternion, true);

        console.log('Physics body created for Imperial Tie Fighter');
    }

    update(player, deltaTime) {
        const cappedDeltaTime = Math.min(deltaTime, 0.05);

        if (!this.modelLoaded) {
            return;
        }

        this.primaryWeapon.update(cappedDeltaTime, player);

        this.mesh.position.copy(player.position);

        const targetQuaternion = player.quaternion;
        const step = this.turnSpeed * cappedDeltaTime;
        this.mesh.quaternion.rotateTowards(targetQuaternion, step);

        if (this.rigidBody) {
            this.rigidBody.setTranslation(this.mesh.position, true);
            this.rigidBody.setRotation(this.mesh.quaternion, true);
        }
    }

    firePrimaryWeapon(player) {
        return this.primaryWeapon.fire(player);
    }

    takeDamage(damage, componentId = null) {
        this.lastShieldDamageTime = Date.now() / 1000;
        let remainingDamage = damage;

        if (this.shield > 0) {
            const shieldDamage = Math.min(remainingDamage, this.shield);
            this.shield -= shieldDamage;
            remainingDamage -= shieldDamage;
            this.shield = Math.max(0, this.shield);
            console.log(`Shield absorbed ${shieldDamage} damage, remaining shield: ${this.shield}`);
        }

        if (remainingDamage > 0) {
            const totalHullDamage = Math.min(remainingDamage, this.totalHullHealth);
            this.totalHullHealth -= totalHullDamage;
            remainingDamage -= totalHullDamage;
            this.totalHullHealth = Math.max(0, this.totalHullHealth);

            if (componentId && this.componentHealth[componentId] !== undefined) {
                const componentDamage = Math.min(totalHullDamage, this.componentHealth[componentId]);
                this.componentHealth[componentId] -= componentDamage;
                this.componentHealth[componentId] = Math.max(0, this.componentHealth[componentId]);

                if (this.componentHealth[componentId] <= 0) {
                    console.log(`Imperial Tie Fighter component ${componentId} health reached 0, destroying component!`);
                    this.destroyComponent(componentId);

                    if (window.ws && window.ws.readyState === WebSocket.OPEN && window.myPlayerId) {
                        console.log(`Sending component destruction message for ${componentId}`);
                        window.ws.send(JSON.stringify({
                            type: 'playerComponentDestroyed',
                            playerId: window.myPlayerId,
                            componentId: componentId
                        }));
                    }
                }

                console.log(`Imperial Tie Fighter component ${componentId} damaged for ${componentDamage}, remaining component health: ${this.componentHealth[componentId]}`);
            }

            if (remainingDamage > 0) {
                this.hull -= remainingDamage;
                this.hull = Math.max(0, this.hull);
                console.log(`Legacy hull damage: ${remainingDamage}, remaining hull: ${this.hull}`);
            }

            console.log(`Imperial Tie Fighter total hull health: ${this.totalHullHealth}/110`);
        }

        const mainHullDestroyed = !this.componentHealth.main_body || this.componentHealth.main_body <= 0;
        const leftWingDestroyed = !this.componentHealth.left_wing || this.componentHealth.left_wing <= 0;
        const rightWingDestroyed = !this.componentHealth.right_wing || this.componentHealth.right_wing <= 0;
        const bothWingsDestroyed = leftWingDestroyed && rightWingDestroyed;

        const isDestroyed = this.totalHullHealth <= 0 || mainHullDestroyed || bothWingsDestroyed;

        if (isDestroyed) {
            console.log('Imperial Tie Fighter destroyed!');
        }

        return isDestroyed;
    }

    destroyComponent(componentId) {
        if (this.componentMeshes[componentId]) {
            const meshes = this.componentMeshes[componentId];

            meshes.forEach(mesh => {
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                    console.log(`Imperial Tie Fighter component ${componentId} mesh "${mesh.name}" destroyed and removed`);
                }
            });

            delete this.componentHealth[componentId];
            delete this.componentMeshes[componentId];

            console.log(`Imperial Tie Fighter component ${componentId} fully destroyed`);
        }
    }
}