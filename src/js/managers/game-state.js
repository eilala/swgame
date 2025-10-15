import * as THREE from 'three';

/**
 * Centralized game state management
 */
export default class GameState {
    constructor() {
        this.isPaused = false;
        this.isConnected = false;
        this.gameStarted = false;

        // Player state
        this.player = null;
        this.playerId = null;
        this.playerName = null;

        // Game entities
        this.enemies = [];
        this.otherPlayers = {};
        this.networkedBolts = [];
        this.localBolts = [];

        // Physics and rendering
        this.world = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Managers
        this.networkManager = null;
        this.collisionManager = null;
        this.physicsManager = null;

        // UI and controls
        this.ui = null;
        this.controls = null;
        this.playerCamera = null;

        // Audio
        this.audioListener = null;

        // Clock for timing
        this.clock = new THREE.Clock();
    }

    /**
     * Initialize the game state
     */
    init(scene, camera, renderer, world) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.world = world;

        // Create audio listener
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);
        window.camera = { audioListener: this.audioListener };
    }

    /**
     * Update game state
     */
    update(deltaTime) {
        const cappedDeltaTime = Math.min(deltaTime, 0.05); // Cap deltaTime

        if (!this.isPaused) {
            // Update controls
            if (this.controls) {
                this.controls.update(cappedDeltaTime);
            }

            // Update player
            if (this.player) {
                this.player.update(this.controls, cappedDeltaTime);
                this.player.ship.update(this.player, cappedDeltaTime);
            }

            // Update player camera
            if (this.playerCamera) {
                this.playerCamera.update();
            }

            // Update UI
            if (this.ui) {
                this.ui.update();
            }

            // Update enemies
            this.enemies.forEach(enemy => enemy.update(cappedDeltaTime));

            // Update bolts
            this.updateBolts(cappedDeltaTime);

            // Handle collisions
            if (this.collisionManager) {
                this.collisionManager.update(cappedDeltaTime);
            }

            // Update physics
            if (this.physicsManager) {
                this.physicsManager.update(cappedDeltaTime);
            }

            // Send network updates
            if (this.networkManager && this.networkManager.ws.readyState === WebSocket.OPEN && this.playerId) {
                this.networkManager.sendPosition(
                    this.player.position.x,
                    this.player.position.y,
                    this.player.position.z,
                    this.player.quaternion.x,
                    this.player.quaternion.y,
                    this.player.quaternion.z,
                    this.player.quaternion.w
                );
            }
        }

        // Render
        if (this.renderer && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Update all bolts (local and networked)
     */
    updateBolts(deltaTime) {
        // Update local bolts
        this.localBolts = this.localBolts.filter(bolt => {
            if (bolt.mesh) {
                bolt.update(deltaTime);
            }
            return !bolt.isDestroyed;
        });

        // Update networked bolts
        this.networkedBolts = this.networkedBolts.filter(bolt => {
            if (bolt.age >= bolt.lifetime) {
                if (bolt.parent) {
                    bolt.parent.remove(bolt);
                }
                return false;
            }

            // Update position
            const direction = new THREE.Vector3(bolt.userData.direction.x, bolt.userData.direction.y, bolt.userData.direction.z).normalize();
            bolt.userData.previousPosition.copy(bolt.position);
            bolt.position.add(direction.clone().multiplyScalar(bolt.userData.speed * deltaTime));
            bolt.userData.age += deltaTime;

            return true;
        });

        // Limit bolt counts
        this.limitBoltCounts();
    }

    /**
     * Limit the number of active bolts to prevent performance issues
     */
    limitBoltCounts() {
        // Limit local bolts
        if (this.localBolts.length > 50) {
            while (this.localBolts.length > 50) {
                const bolt = this.localBolts.shift();
                if (bolt.mesh && bolt.mesh.parent) {
                    bolt.mesh.parent.remove(bolt.mesh);
                }
            }
        }

        // Limit networked bolts
        if (this.networkedBolts.length > 100) {
            while (this.networkedBolts.length > 100) {
                const bolt = this.networkedBolts.shift();
                if (bolt.parent) {
                    bolt.parent.remove(bolt);
                }
            }
        }
    }

    /**
     * Add local bolt
     */
    addLocalBolt(bolt) {
        this.localBolts.push(bolt);
        if (bolt.mesh && !this.scene.children.includes(bolt.mesh)) {
            bolt.mesh.userData.isBlasterBolt = true;
            bolt.mesh.userData.ownerId = bolt.ownerId;
            this.scene.add(bolt.mesh);
        }
    }

    /**
     * Add networked bolt
     */
    addNetworkedBolt(bolt) {
        this.networkedBolts.push(bolt);
        this.scene.add(bolt);
    }

    /**
     * Add enemy
     */
    addEnemy(enemy) {
        this.enemies.push(enemy);
    }

    /**
     * Remove enemy
     */
    removeEnemy(enemyId) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].id === enemyId) {
                this.scene.remove(this.enemies[i].mesh);
                this.enemies.splice(i, 1);
                break;
            }
        }
    }

    /**
     * Add other player
     */
    addOtherPlayer(playerId, playerData) {
        this.otherPlayers[playerId] = playerData;
    }

    /**
     * Update other player
     */
    updateOtherPlayer(data) {
        const playerId = String(data.playerId);
        const playerObj = this.otherPlayers[playerId];
        if (playerObj) {
            playerObj.mesh.position.set(data.x, data.y, data.z);
            playerObj.mesh.quaternion.set(data.rotationX, data.rotationY, data.rotationZ, data.rotationW || 1);

            // Update name sprite position
            if (playerObj.nameSprite) {
                const box = new THREE.Box3().setFromObject(playerObj.mesh);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                playerObj.nameSprite.position.set(center.x, center.y + size.y / 2 + 1, center.z);
            }

            // Update name if changed
            if (data.playerName && playerObj.nameSprite.userData.name !== data.playerName) {
                // Update sprite text (implementation would need canvas recreation)
                playerObj.nameSprite.userData.name = data.playerName;
            }
        }
    }

    /**
     * Remove other player
     */
    removeOtherPlayer(playerId) {
        const playerObj = this.otherPlayers[String(playerId)];
        if (playerObj) {
            this.scene.remove(playerObj.mesh);
            if (playerObj.nameSprite) {
                this.scene.remove(playerObj.nameSprite);
            }
            delete this.otherPlayers[String(playerId)];
        }
    }

    /**
     * Get all collision targets
     */
    getCollisionTargets() {
        const targets = [];

        // Add enemy meshes
        this.enemies.forEach(enemy => {
            if (enemy.mesh && enemy.mesh.parent) {
                targets.push(enemy.mesh);
            }
        });

        // Add player meshes
        if (this.player && this.player.ship.mesh && this.player.ship.mesh.parent) {
            targets.push(this.player.ship.mesh);
        }

        // Add other player meshes
        Object.values(this.otherPlayers).forEach(playerObj => {
            if (playerObj.mesh && playerObj.isAlive && playerObj.mesh.parent) {
                targets.push(playerObj.mesh);
            }
        });

        return targets;
    }

    /**
     * Pause the game
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume the game
     */
    resume() {
        this.isPaused = false;
        this.clock.getDelta(); // Reset clock to avoid large deltaTime
    }

    /**
     * Check if game is paused
     */
    getIsPaused() {
        return this.isPaused;
    }

    /**
     * Set player ID
     */
    setPlayerId(id) {
        this.playerId = id;
    }

    /**
     * Get player ID
     */
    getPlayerId() {
        return this.playerId;
    }
}