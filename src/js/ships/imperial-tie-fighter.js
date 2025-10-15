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

        // Engine audio setup
        this.engineAudioLoaded = false;
        this.engineSound = null;
        this.loadEngineAudio();

        // Boost audio setup
        this.boostAudioLoaded = false;
        this.boostSound = null;
        this.boostAudioBuffer = null;
        this.boostFadeInterval = null; // Track the fade interval
        this.loadBoostAudio();


        // Track acceleration for audio volume
        this.currentAcceleration = 0;
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

        // Update engine audio volume based on acceleration
        this.updateEngineAudio(player);

        // Update boost audio based on boosting state
        this.updateBoostAudio();
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

    /**
     * Load engine audio
     */
    loadEngineAudio() {
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(
            ImperialTieFighterConfig.ENGINE_AUDIO,
            (buffer) => {
                this.engineAudioBuffer = buffer;
                this.engineAudioLoaded = true;

                // Create and start the engine sound
                this.createEngineSound();

                console.log('Imperial Tie Fighter engine audio loaded successfully');
            },
            (progress) => {
                console.log('Loading Imperial Tie Fighter engine audio...', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.warn('Failed to load Imperial Tie Fighter engine audio:', error);
                this.engineAudioLoaded = false;
            }
        );
    }

    /**
     * Create and start the engine sound
     */
    createEngineSound() {
        if (!this.engineAudioLoaded || !this.engineAudioBuffer) {
            return;
        }

        try {
            // Get the audio listener from the global camera
            const audioListener = window.camera?.audioListener;
            if (!audioListener) {
                console.warn('AudioListener not found on camera for engine sound');
                return;
            }

            // Create positional audio source
            this.engineSound = new THREE.PositionalAudio(audioListener);
            this.engineSound.setBuffer(this.engineAudioBuffer);
            this.engineSound.setRefDistance(50); // Distance at which volume starts to attenuate
            this.engineSound.setVolume(0); // Start at 0 volume
            this.engineSound.setLoop(true); // Engine sound loops continuously

            // Position the sound at the ship
            this.engineSound.position.copy(this.mesh.position);
            scene.add(this.engineSound);

            // Don't play immediately - wait for first volume update to avoid loud burst

            console.log('Imperial Tie Fighter engine sound started');

        } catch (error) {
            console.warn('Failed to create engine sound:', error);
            this.engineSound = null;
        }
    }

    /**
     * Load boost audio
     */
    loadBoostAudio() {
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(
            ImperialTieFighterConfig.BOOST_AUDIO,
            (buffer) => {
                this.boostAudioBuffer = buffer;
                this.boostAudioLoaded = true;

                console.log('Imperial Tie Fighter boost audio loaded successfully');
            },
            (progress) => {
                console.log('Loading Imperial Tie Fighter boost audio...', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.warn('Failed to load Imperial Tie Fighter boost audio:', error);
                this.boostAudioLoaded = false;
            }
        );
    }

    /**
     * Update boost audio based on boosting state
     */
    updateBoostAudio() {
        if (!this.boostAudioLoaded || !this.boostAudioBuffer) {
            return;
        }

        // Check for boost state change
        if (this.boosting && !this.boostSound) {
            // Boost just started - play the sound
            this.playBoostSound();
        } else if (this.boosting && this.boostSound && this.boostFadeInterval) {
            // Boost started again while fading out - stop fade and play new sound
            clearInterval(this.boostFadeInterval);
            this.boostFadeInterval = null;
            this.stopBoostSound();
            this.playBoostSound();
        } else if (!this.boosting && this.boostSound) {
            // Boost just stopped - fade out the sound
            this.fadeOutBoostSound();
        }
    }

    /**
     * Play boost sound
     */
    playBoostSound() {
        try {
            // Get the audio listener from the global camera
            const audioListener = window.camera?.audioListener;
            if (!audioListener) {
                console.warn('AudioListener not found on camera for boost sound');
                return;
            }

            // Create positional audio source
            this.boostSound = new THREE.PositionalAudio(audioListener);
            this.boostSound.setBuffer(this.boostAudioBuffer);
            this.boostSound.setRefDistance(50);
            this.boostSound.setVolume(0.05); // Low volume as requested
            this.boostSound.setLoop(false); // Don't loop the boost sound

            // Position the sound at the ship
            this.boostSound.position.copy(this.mesh.position);
            this.scene.add(this.boostSound);

            // Play the sound
            this.boostSound.play();

            console.log('Imperial Tie Fighter boost sound played');

        } catch (error) {
            console.warn('Failed to play boost sound:', error);
            this.boostSound = null;
        }
    }

    /**
     * Fade out the currently playing boost sound over 2 seconds
     */
    fadeOutBoostSound() {
        if (this.boostSound && !this.boostFadeInterval) {
            try {
                // Fade out the sound over 2 seconds
                const fadeDuration = 2.0; // 2 seconds
                const steps = 40; // More steps for smoother fade
                const stepDuration = fadeDuration / steps;
                const initialVolume = this.boostSound.getVolume();
                const volumeStep = initialVolume / steps;

                let currentStep = 0;
                this.boostFadeInterval = setInterval(() => {
                    currentStep++;
                    const newVolume = Math.max(0, initialVolume - (volumeStep * currentStep));

                    if (this.boostSound) {
                        this.boostSound.setVolume(newVolume);
                    }

                    if (currentStep >= steps) {
                        clearInterval(this.boostFadeInterval);
                        this.boostFadeInterval = null;
                        this.stopBoostSound();
                    }
                }, stepDuration * 100);

                console.log('Imperial Tie Fighter boost sound fading out');

            } catch (error) {
                console.warn('Failed to fade out boost sound:', error);
                clearInterval(this.boostFadeInterval);
                this.boostFadeInterval = null;
                this.stopBoostSound();
            }
        }
    }

    /**
     * Stop boost sound
     */
    stopBoostSound() {
        if (this.boostSound) {
            try {
                this.boostSound.stop();
                this.scene.remove(this.boostSound);
                this.boostSound = null;
                console.log('Imperial Tie Fighter boost sound stopped');
            } catch (error) {
                console.warn('Failed to stop boost sound:', error);
            }
        }
    }

    /**
     * Update engine audio volume based on acceleration
     */
    updateEngineAudio(player) {
        if (!this.engineSound || !this.engineAudioLoaded) {
            return;
        }

        // Calculate current acceleration magnitude
        const accelerationMagnitude = player.velocity.length();

        // Always play engine sound, but at minimum volume when stopped
        if (accelerationMagnitude < 0.1) {
            // Set to minimum volume when not moving
            this.engineSound.setVolume(0.01);
            // Update sound position to follow the ship
            this.engineSound.position.copy(this.mesh.position);
            return;
        }

        // Start playing if not already playing
        if (!this.engineSound.isPlaying) {
            this.engineSound.play();
        }

        // Map speed to volume (0.0 to 0.1 range)
        // At rest: 0.0, at max speed: 0.1 (very quiet)
        const speedMagnitude = player.velocity.length();
        const minVolume = 0.0025;
        const maxVolume = 0.0025;
        const maxSpeed = this.maxSpeedForward; // Use max speed as reference

        const targetVolume = minVolume + (maxVolume - minVolume) * Math.min(speedMagnitude / maxSpeed, 1.0);

        // Smooth the volume changes
        const currentVolume = this.engineSound.getVolume();
        const smoothedVolume = currentVolume + (targetVolume - currentVolume) * 0.1; // Smooth transition

        this.engineSound.setVolume(smoothedVolume);

        // Update sound position to follow the ship
        this.engineSound.position.copy(this.mesh.position);
    }

}