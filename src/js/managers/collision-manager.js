import * as THREE from 'three';

/**
 * Manages collision detection between game entities
 */
export default class CollisionManager {
    constructor(gameState, networkManager) {
        this.gameState = gameState;
        this.networkManager = networkManager;
        this.collisionTargets = [];
        this.localBolts = [];
        this.networkedBolts = [];
    }

    /**
     * Update collision detection
     */
    update(deltaTime) {
        // Update collision targets
        this.collisionTargets = this.gameState.getCollisionTargets();

        // Handle collisions
        this.detectAndResolveEntityCollisions();
        this.handleISDCollisions();

        // Handle bolt collisions
        this.handleBoltCollisions(deltaTime);
    }

    /**
     * Handle collisions between entities (ships, players, enemies)
     */
    detectAndResolveEntityCollisions() {
        const otherPlayers = Object.values(this.gameState.otherPlayers).filter(p => p.isAlive);

        // Player vs other players
        if (this.gameState.player && this.gameState.player.ship.mesh) {
            otherPlayers.forEach(playerObj => {
                if (playerObj.mesh && this.simpleSphereCollisionCheck(this.gameState.player.ship.mesh, playerObj.mesh)) {
                    this.resolveSimpleCollision(this.gameState.player.ship.mesh, playerObj.mesh);
                }
            });
        }

        // Player vs enemies
        this.gameState.enemies.forEach(enemy => {
            if (this.gameState.player && this.gameState.player.ship.mesh && enemy.mesh) {
                if (this.simpleSphereCollisionCheck(this.gameState.player.ship.mesh, enemy.mesh)) {
                    this.resolveSimpleCollision(this.gameState.player.ship.mesh, enemy.mesh);
                }
            }
        });

        // Other players vs enemies
        otherPlayers.forEach(playerObj => {
            if (playerObj.mesh) {
                this.gameState.enemies.forEach(enemy => {
                    if (enemy.mesh) {
                        if (this.simpleSphereCollisionCheck(playerObj.mesh, enemy.mesh)) {
                            this.resolveSimpleCollision(playerObj.mesh, enemy.mesh);
                        }
                    }
                });
            }
        });

        // Other players vs other players
        for (let i = 0; i < otherPlayers.length; i++) {
            for (let j = i + 1; j < otherPlayers.length; j++) {
                if (this.simpleSphereCollisionCheck(otherPlayers[i].mesh, otherPlayers[j].mesh)) {
                    this.resolveSimpleCollision(otherPlayers[i].mesh, otherPlayers[j].mesh);
                }
            }
        }
    }

    /**
     * Handle collisions with ISD static objects
     */
    handleISDCollisions() {
        if (!this.gameState.player || !this.gameState.player.ship || !this.gameState.player.ship.mesh) return;

        const playerPosition = this.gameState.player.ship.mesh.position;

        // Find ISD meshes in the scene
        const isdMeshes = [];
        this.gameState.scene.traverse((child) => {
            if (child.userData && child.userData.isStaticObject && child.userData.isISD) {
                isdMeshes.push(child);
            }
        });

        if (isdMeshes.length === 0) return;

        const checkDirections = [
            new THREE.Vector3(1, 0, 0),   // Right
            new THREE.Vector3(-1, 0, 0),  // Left
            new THREE.Vector3(0, 1, 0),   // Up
            new THREE.Vector3(0, -1, 0),  // Down
            new THREE.Vector3(0, 0, 1),   // Forward
            new THREE.Vector3(0, 0, -1),  // Back
        ];

        let minDistance = Infinity;
        let closestNormal = new THREE.Vector3();
        let needsCorrection = false;

        // Check proximity to surfaces
        for (const direction of checkDirections) {
            const raycaster = new THREE.Raycaster(playerPosition, direction, 0, 4);
            const intersects = raycaster.intersectObjects(isdMeshes, true);

            if (intersects.length > 0) {
                const intersection = intersects[0];
                if (intersection.distance < minDistance) {
                    minDistance = intersection.distance;
                    needsCorrection = true;
                    closestNormal.copy(intersection.face ? intersection.face.normal : direction);
                    if (intersection.face) {
                        closestNormal.transformDirection(intersection.object.matrixWorld);
                    }
                }
            }
        }

        // Apply collision correction
        if (needsCorrection && minDistance < 2.8) {
            const safeDistance = 3.0;
            const correctionNeeded = safeDistance - minDistance;

            if (correctionNeeded > 0) {
                const interpolationFactor = 0.3;
                const interpolatedCorrection = correctionNeeded * interpolationFactor;
                const correctionVector = closestNormal.clone().multiplyScalar(interpolatedCorrection);

                this.gameState.player.ship.mesh.position.add(correctionVector);
                this.gameState.player.position.copy(this.gameState.player.ship.mesh.position);

                // Reduce velocity toward surface
                const normalDotVelocity = this.gameState.player.velocity.dot(closestNormal);
                if (normalDotVelocity > 0) {
                    const velocityReduction = Math.min(normalDotVelocity * 0.3, normalDotVelocity);
                    const velocityCorrection = closestNormal.clone().multiplyScalar(velocityReduction);
                    this.gameState.player.velocity.sub(velocityCorrection);
                }

                // Update physics body
                if (this.gameState.player.ship.rigidBody) {
                    this.gameState.player.ship.rigidBody.setTranslation(this.gameState.player.ship.mesh.position, true);
                    this.gameState.player.ship.rigidBody.setLinvel({
                        x: this.gameState.player.velocity.x,
                        y: this.gameState.player.velocity.y,
                        z: this.gameState.player.velocity.z
                    }, true);
                }
            }
        }
    }

    /**
     * Handle bolt collision detection
     */
    handleBoltCollisions(deltaTime) {
        const maxLocalBoltsToProcess = 20;
        const maxNetworkedBoltsToProcess = 20;

        let localBoltsProcessed = 0;
        let networkedBoltsProcessed = 0;

        // Local bolt collisions using raycasting
        for (let i = this.gameState.localBolts.length - 1; i >= 0 && localBoltsProcessed < maxLocalBoltsToProcess; i--) {
            localBoltsProcessed++;
            const bolt = this.gameState.localBolts[i];

            if (!bolt.mesh || bolt.isDestroyed) continue;

            const direction = bolt.mesh.position.clone().sub(bolt.previousPosition).normalize();
            const distance = bolt.mesh.position.distanceTo(bolt.previousPosition);
            const raycaster = new THREE.Raycaster(bolt.previousPosition, direction, 0, distance);

            const intersects = raycaster.intersectObjects(this.collisionTargets, true);
            const hitComponents = {};

            let hitSomething = false;
            for (const intersect of intersects) {
                const hitObject = intersect.object;

                console.log(`Collision detected: Bolt at ${bolt.mesh.position.x.toFixed(2)}, ${bolt.mesh.position.y.toFixed(2)}, ${bolt.mesh.position.z.toFixed(2)} hit object at ${hitObject.position.x.toFixed(2)}, ${hitObject.position.y.toFixed(2)}, ${hitObject.position.z.toFixed(2)}`);

                // Handle different collision types
                hitSomething = this.handleBoltHit(bolt, hitObject, i, true);
                if (hitSomething) break;
            }

            if (hitSomething) continue;
        }

        // Networked bolt collisions using raycasting
        for (let i = this.gameState.networkedBolts.length - 1; i >= 0 && networkedBoltsProcessed < maxNetworkedBoltsToProcess; i--) {
            networkedBoltsProcessed++;
            const bolt = this.gameState.networkedBolts[i];

            if (!bolt.userData || typeof bolt.userData.previousPosition === 'undefined') continue;

            const direction = bolt.position.clone().sub(bolt.userData.previousPosition).normalize();
            const distance = bolt.position.distanceTo(bolt.userData.previousPosition);
            const raycaster = new THREE.Raycaster(bolt.userData.previousPosition, direction, 0, distance);

            const intersects = raycaster.intersectObjects(this.collisionTargets, true);

            let hitSomething = false;
            for (const intersect of intersects) {
                const hitObject = intersect.object;

                console.log(`Networked bolt collision detected: Bolt at ${bolt.position.x.toFixed(2)}, ${bolt.position.y.toFixed(2)}, ${bolt.position.z.toFixed(2)} hit object at ${hitObject.position.x.toFixed(2)}, ${hitObject.position.y.toFixed(2)}, ${hitObject.position.z.toFixed(2)}`);

                hitSomething = this.handleBoltHit(bolt, hitObject, i, false);
                if (hitSomething) break;
            }

            if (hitSomething) continue;
        }
    }

    /**
     * Handle a bolt hitting an object
     */
    handleBoltHit(bolt, hitObject, boltIndex, isLocalBolt) {
        // Check for self-hit (own ship)
        const isLocalPlayer = (hitObject === this.gameState.player.ship.mesh || (hitObject.userData && hitObject.userData.isPlayer));
        const isOwnBolt = isLocalBolt ? (bolt.ownerId === this.networkManager.getMyPlayerId()) : (bolt.userData.ownerId === this.networkManager.getMyPlayerId());

        if (isLocalPlayer && !((isLocalBolt && bolt.age < 0.3) || (!isLocalBolt && bolt.userData.age < 0.2))) {
            console.log(isLocalBolt ? "Bolt hit player's own ship" : "Networked bolt hit player's own ship");
            this.removeBolt(bolt, isLocalBolt);
            return true;
        }

        // Enemy collision
        if (hitObject.userData && hitObject.userData.isEnemy) {
            console.log(`Bolt hit object is enemy with ID: ${hitObject.userData.enemyId}`);
            for (let j = this.gameState.enemies.length - 1; j >= 0; j--) {
                const enemy = this.gameState.enemies[j];
                if (enemy.mesh === hitObject || hitObject.userData.enemyId === enemy.id) {
                    const componentId = hitObject.userData.componentId;
                    const destroyed = enemy.takeDamage(isLocalBolt ? bolt.damage : 10, componentId);

                    console.log(`${isLocalBolt ? 'Local' : 'Networked'} bolt hit enemy ${enemy.id} for ${isLocalBolt ? bolt.damage : 10} damage!`);

                    this.removeBolt(bolt, isLocalBolt);

                    if (destroyed) {
                        console.log(`Enemy ${enemy.id} destroyed! Starting respawn process.`);
                        enemy.startRespawn();
                        // Don't remove from enemies array, let it respawn
                        // Send destruction message to server for networking
                        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                            window.ws.send(JSON.stringify({
                                type: 'enemyDestroyed',
                                enemyId: enemy.id
                            }));
                        }
                    }
                    return true;
                }
            }
        }

        // Other player collision
        if (hitObject.userData && hitObject.userData.isPlayer) {
            const hitPlayerId = hitObject.userData.playerId;
            for (const [playerId, playerObj] of Object.entries(this.gameState.otherPlayers)) {
                if (playerObj.mesh === hitObject || playerObj.mesh.userData.playerId === hitPlayerId || hitPlayerId === parseInt(playerId)) {
                    if (playerObj.isAlive) {
                        console.log(`${isLocalBolt ? 'Local' : 'Networked'} bolt hit player ${playerObj.nameSprite.userData?.name || 'Player'} (ID: ${playerId}) for ${isLocalBolt ? bolt.damage : 10} damage!`);

                        const componentId = hitObject.userData.componentId;
                        if (componentId && playerObj.componentHealth && playerObj.componentHealth[componentId] !== undefined) {
                            playerObj.componentHealth[componentId] -= (isLocalBolt ? bolt.damage : 10);
                            playerObj.componentHealth[componentId] = Math.max(0, playerObj.componentHealth[componentId]);
                            console.log(`Other player ${playerId} component ${componentId} health now ${playerObj.componentHealth[componentId]}`);
                        }

                        this.removeBolt(bolt, isLocalBolt);

                        const targetId = parseInt(playerId);
                        const damage = isLocalBolt ? bolt.damage : 10;
                        if (targetId !== bolt.ownerId) {
                            this.networkManager.sendPlayerHit(isLocalBolt ? bolt.ownerId : bolt.userData.ownerId, targetId, damage, componentId);
                        }
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Remove a bolt from the game
     */
    removeBolt(bolt, isLocalBolt) {
        if (isLocalBolt) {
            // For local bolts, remove from weapon's bolt array
            if (this.gameState.player && this.gameState.player.ship.primaryWeapon) {
                const boltIndex = this.gameState.player.ship.primaryWeapon.bolts.indexOf(bolt);
                if (boltIndex > -1) {
                    this.gameState.player.ship.primaryWeapon.bolts.splice(boltIndex, 1);
                }
            }
            if (bolt.mesh && bolt.mesh.parent) {
                bolt.mesh.parent.remove(bolt.mesh);
            }
        } else {
            // For networked bolts, remove from scene
            if (bolt.parent) {
                bolt.parent.remove(bolt);
            }
            this.gameState.networkedBolts.splice(this.gameState.networkedBolts.indexOf(bolt), 1);
        }
    }

    /**
     * Simple sphere-based collision check
     */
    simpleSphereCollisionCheck(mesh1, mesh2) {
        const pos1 = new THREE.Vector3();
        const pos2 = new THREE.Vector3();
        mesh1.getWorldPosition(pos1);
        mesh2.getWorldPosition(pos2);

        const distance = pos1.distanceTo(pos2);

        const scale1 = new THREE.Vector3();
        const scale2 = new THREE.Vector3();
        mesh1.getWorldScale(scale1);
        mesh2.getWorldScale(scale2);

        const avgScale = (Math.max(scale1.x, scale1.y, scale1.z) + Math.max(scale2.x, scale2.y, scale2.z)) / 2;
        const collisionThreshold = avgScale * 1.5;

        return distance < collisionThreshold;
    }

    /**
     * Simple collision resolution
     */
    resolveSimpleCollision(mesh1, mesh2) {
        const pos1 = new THREE.Vector3();
        const pos2 = new THREE.Vector3();
        mesh1.getWorldPosition(pos1);
        mesh2.getWorldPosition(pos2);

        const direction = new THREE.Vector3().subVectors(pos2, pos1).normalize();
        const currentDistance = pos1.distanceTo(pos2);

        const scale1 = new THREE.Vector3();
        const scale2 = new THREE.Vector3();
        mesh1.getWorldScale(scale1);
        mesh2.getWorldScale(scale2);
        const avgScale = (Math.max(scale1.x, scale1.y, scale1.z) + Math.max(scale2.x, scale2.y, scale2.z)) / 2;
        const minDistance = avgScale * 1.5;

        if (currentDistance < minDistance) {
            const overlap = minDistance - currentDistance;
            const moveDistance = overlap / 2;

            const offset1 = direction.clone().multiplyScalar(-moveDistance);
            mesh1.position.add(offset1);

            const offset2 = direction.clone().multiplyScalar(moveDistance);
            mesh2.position.add(offset2);
        }
    }
}