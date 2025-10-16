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
        this.safeSeparationDistance = 1.0;
        this.penetrationBuffer = 0.05;
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
                if (playerObj.mesh) {
                    this.handleEntityCollision(this.gameState.player.ship.mesh, playerObj.mesh);
                }
            });
        }

        // Player vs enemies
        this.gameState.enemies.forEach(enemy => {
            if (this.gameState.player && this.gameState.player.ship.mesh && enemy.mesh) {
                this.handleEntityCollision(this.gameState.player.ship.mesh, enemy.mesh);
            }
        });

        // Other players vs enemies
        otherPlayers.forEach(playerObj => {
            if (playerObj.mesh) {
                this.gameState.enemies.forEach(enemy => {
                    if (enemy.mesh) {
                        this.handleEntityCollision(playerObj.mesh, enemy.mesh);
                    }
                });
            }
        });

        // Other players vs other players
        for (let i = 0; i < otherPlayers.length; i++) {
            for (let j = i + 1; j < otherPlayers.length; j++) {
                this.handleEntityCollision(otherPlayers[i].mesh, otherPlayers[j].mesh);
            }
        }
    }

    /**
     * Handle entity collision using accurate mesh-based collision detection
     */
    handleEntityCollision(mesh1, mesh2) {
        const collisionResult = this.accurateCollisionCheck(mesh1, mesh2);

        const resolved = this.resolveAccurateCollision(
            mesh1,
            mesh2,
            collisionResult.normal,
            collisionResult.penetrationDepth,
            collisionResult.separationDistance
        );

        if (resolved) {
            return;
        }

        // Fallback: separate based on center-to-center distance if still overlapping
        const pos1 = new THREE.Vector3();
        const pos2 = new THREE.Vector3();
        mesh1.getWorldPosition(pos1);
        mesh2.getWorldPosition(pos2);
        const distance = pos1.distanceTo(pos2);

        // Use a threshold that ensures ships don't overlap significantly
        const minSafeDistance = 2.0; // Increased for better fallback
        if (distance < minSafeDistance) {
            const separationDirection = new THREE.Vector3().subVectors(pos2, pos1).normalize();
            const separationDistance = (minSafeDistance - distance) * 0.8;

            mesh1.position.addScaledVector(separationDirection, -separationDistance * 0.5);
            mesh2.position.addScaledVector(separationDirection, separationDistance * 0.5);

            // Update physics bodies
            this.updateMeshRigidBody(mesh1);
            this.updateMeshRigidBody(mesh2);

            // Apply velocity damping
            this.applyVelocityCorrection(mesh1, separationDirection);
            this.applyVelocityCorrection(mesh2, separationDirection.clone().negate());
        }
    }

    /**
     * Apply velocity correction to prevent phasing through collision surface
     */
    applyVelocityCorrection(mesh, normal) {
        const physicsData = this.getEntityPhysicsData(mesh);
        const entity = physicsData?.entity;
        const rigidBody = physicsData?.rigidBody;

        if (entity && entity.velocity) {
            const normalDotVelocity = entity.velocity.dot(normal);
            if (normalDotVelocity > 0) {
                // Stronger velocity reduction to prevent phasing through surfaces
                const velocityReduction = Math.min(normalDotVelocity * 0.8, normalDotVelocity);
                const velocityCorrection = normal.clone().multiplyScalar(velocityReduction);
                entity.velocity.sub(velocityCorrection);

                // Update rigid body velocity if it exists
                if (rigidBody) {
                    rigidBody.setLinvel({
                        x: entity.velocity.x,
                        y: entity.velocity.y,
                        z: entity.velocity.z
                    }, true);
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
                        // Send destruction message to server for networking
                        if (isLocalBolt && window.ws && window.ws.readyState === WebSocket.OPEN) {
                            window.ws.send(JSON.stringify({
                                type: 'enemyDestroyed',
                                enemyId: enemy.id
                            }));
                        }
                    } else if (componentId && enemy.componentHealth[componentId] <= 0) {
                        // Component was destroyed but enemy survived
                        console.log(`Enemy ${enemy.id} component ${componentId} destroyed locally!`);

                        // Store debris creation info for shooter-side replication
                        // We'll create debris locally AND store info for when network message arrives
                        if (isLocalBolt && enemy.componentMeshes[componentId] && enemy.componentMeshes[componentId].length > 0) {
                            const meshes = enemy.componentMeshes[componentId];

                            // Store this info globally for network message handling (when we receive confirmation)
                            if (!window.pendingDebrisCreations) window.pendingDebrisCreations = {};
                            window.pendingDebrisCreations[`${enemy.id}_${componentId}`] = {
                                enemyId: enemy.id,
                                componentId: componentId,
                                processed: false // Mark as not yet processed by network message
                            };
                        }

                        if (isLocalBolt && window.ws && window.ws.readyState === WebSocket.OPEN) {
                            window.ws.send(JSON.stringify({
                                type: 'enemyComponentDestroyed',
                                enemyId: enemy.id,
                                componentId: componentId
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
     * Accurate model-based collision check using bounding box and raycasting
     */
    accurateCollisionCheck(mesh1, mesh2) {
        const result = {
            collision: false,
            penetrationDepth: 0,
            separationDistance: Infinity,
            normal: new THREE.Vector3()
        };

        if (!mesh1 || !mesh2) {
            return result;
        }

        const bb1 = new THREE.Box3().setFromObject(mesh1);
        const bb2 = new THREE.Box3().setFromObject(mesh2);

        if (!bb1.intersectsBox(bb2)) {
            return result;
        }

        const pos1 = new THREE.Vector3();
        const pos2 = new THREE.Vector3();
        mesh1.getWorldPosition(pos1);
        mesh2.getWorldPosition(pos2);

        const world = this.gameState.world;
        const colliderInfo1 = this.getEntityPhysicsData(mesh1);
        const colliderInfo2 = this.getEntityPhysicsData(mesh2);
        const collider1 = colliderInfo1?.collider;
        const collider2 = colliderInfo2?.collider;

        if (collider1 && collider2 && world && world.narrowPhase) {
            world.narrowPhase.contactPair(collider1.handle, collider2.handle, (manifold, flipped) => {
                const manifoldNormal = manifold.normal();
                const worldNormal = new THREE.Vector3(manifoldNormal.x, manifoldNormal.y, manifoldNormal.z);
                if (flipped) {
                    worldNormal.negate();
                }

                for (let i = 0; i < manifold.numContacts(); i++) {
                    const distance = manifold.contactDist(i);

                    if (distance < 0) {
                        const penetration = -distance;
                        if (penetration > result.penetrationDepth) {
                            result.penetrationDepth = penetration;
                            result.normal.copy(worldNormal);
                        }
                        result.collision = true;
                    } else if (distance < result.separationDistance) {
                        result.separationDistance = distance;
                        if (!result.collision) {
                            result.normal.copy(worldNormal);
                        }
                    }
                }
            });

            if (result.collision || result.separationDistance !== Infinity) {
                if (result.normal.lengthSq() === 0) {
                    result.normal.subVectors(pos2, pos1).normalize();
                }
                return result;
            }
        }

        if (collider1 && collider2) {
            try {
                const translation1 = collider1.translation();
                const rotation1 = collider1.rotation();
                const translation2 = collider2.translation();
                const rotation2 = collider2.rotation();
                const shape1 = collider1.shape;
                const shape2 = collider2.shape;

                const contact = shape1.contactShape(
                    translation1,
                    rotation1,
                    shape2,
                    translation2,
                    rotation2,
                    this.safeSeparationDistance
                );

                if (contact) {
                    const contactNormal = new THREE.Vector3(contact.normal1.x, contact.normal1.y, contact.normal1.z);
                    const hasNormal = contactNormal.lengthSq() > 0;
                    if (hasNormal) {
                        contactNormal.normalize();
                    }
                    if (contact.distance < 0) {
                        const penetration = -contact.distance;
                        if (penetration > result.penetrationDepth) {
                            result.penetrationDepth = penetration;
                            if (hasNormal) {
                                result.normal.copy(contactNormal);
                            }
                        }
                        result.collision = true;
                    } else if (contact.distance < result.separationDistance) {
                        result.separationDistance = contact.distance;
                        if (!result.collision && hasNormal) {
                            result.normal.copy(contactNormal);
                        }
                    }

                    if (result.collision || result.separationDistance !== Infinity) {
                        if (result.normal.lengthSq() === 0) {
                            result.normal.subVectors(pos2, pos1).normalize();
                        }
                        return result;
                    }
                }
            } catch (error) {
                console.warn('Shape contact computation failed:', error);
            }
        }

        // Fallback: raycast sampling across both meshes
        const mesh1Children = [];
        const mesh2Children = [];

        mesh1.traverse((child) => {
            if (child.isMesh && child.geometry) {
                mesh1Children.push(child);
            }
        });

        mesh2.traverse((child) => {
            if (child.isMesh && child.geometry) {
                mesh2Children.push(child);
            }
        });

        const checkDirections = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(1, 1, 0).normalize(),
            new THREE.Vector3(-1, 1, 0).normalize(),
            new THREE.Vector3(1, -1, 0).normalize(),
            new THREE.Vector3(-1, -1, 0).normalize(),
            new THREE.Vector3(0, 1, 1).normalize(),
            new THREE.Vector3(0, -1, 1).normalize(),
        ];

        let minDistance = Infinity;
        let closestNormal = new THREE.Vector3();
        let hasCollision = false;

        for (const direction of checkDirections) {
            const raycaster = new THREE.Raycaster(pos1, direction, 0, 4);
            const intersects = raycaster.intersectObjects(mesh2Children, false);

            if (intersects.length > 0) {
                const intersection = intersects[0];
                if (intersection.distance < minDistance) {
                    minDistance = intersection.distance;
                    hasCollision = true;
                    closestNormal.copy(intersection.face ? intersection.face.normal : direction);
                    if (intersection.face) {
                        closestNormal.transformDirection(intersection.object.matrixWorld);
                    }
                }
            }
        }

        const reverseDirections = checkDirections.map(dir => dir.clone().negate());
        for (const direction of reverseDirections) {
            const raycaster = new THREE.Raycaster(pos2, direction, 0, 4);
            const intersects = raycaster.intersectObjects(mesh1Children, false);

            if (intersects.length > 0) {
                const intersection = intersects[0];
                if (intersection.distance < minDistance) {
                    minDistance = intersection.distance;
                    hasCollision = true;
                    closestNormal.copy(intersection.face ? intersection.face.normal : direction);
                    if (intersection.face) {
                        closestNormal.transformDirection(intersection.object.matrixWorld);
                    }
                    closestNormal.negate();
                }
            }
        }

        if (hasCollision) {
            result.collision = true;
            result.separationDistance = minDistance;
            result.penetrationDepth = Math.max(0, this.safeSeparationDistance - minDistance);
            result.normal.copy(closestNormal.normalize());
            return result;
        }

        result.normal.subVectors(pos2, pos1).normalize();
        return result;
    }

    /**
     * Resolve accurate collision using Rapier contact data or fallback normals
     */
    resolveAccurateCollision(mesh1, mesh2, normal, penetrationDepth = 0, separationDistance = Infinity) {
        if (!mesh1 || !mesh2 || !normal || normal.lengthSq() === 0) {
            return false;
        }

        const direction = normal.clone().normalize();
        let resolved = false;

        if (penetrationDepth > 0) {
            const correctionAmount = penetrationDepth + this.penetrationBuffer;
            mesh1.position.addScaledVector(direction, -correctionAmount * 0.5);
            mesh2.position.addScaledVector(direction, correctionAmount * 0.5);

            this.updateMeshRigidBody(mesh1);
            this.updateMeshRigidBody(mesh2);

            this.applyVelocityCorrection(mesh1, direction);
            this.applyVelocityCorrection(mesh2, direction.clone().negate());

            resolved = true;
        } else if (separationDistance !== Infinity && separationDistance < this.safeSeparationDistance) {
            const correctionNeeded = this.safeSeparationDistance - separationDistance;
            if (correctionNeeded > 0) {
                mesh1.position.addScaledVector(direction, -correctionNeeded * 0.5);
                mesh2.position.addScaledVector(direction, correctionNeeded * 0.5);

                this.updateMeshRigidBody(mesh1);
                this.updateMeshRigidBody(mesh2);

                this.applyVelocityCorrection(mesh1, direction);
                this.applyVelocityCorrection(mesh2, direction.clone().negate());

                resolved = true;
            }
        }

        return resolved;
    }

    /**
     * Update rigid body position for a mesh
     */
    updateMeshRigidBody(mesh) {
        const rigidBody = this.getEntityPhysicsData(mesh)?.rigidBody;

        if (rigidBody) {
            rigidBody.setTranslation(mesh.position, true);
        }
    }

    /**
     * Gather physics-related references for a mesh
     */
    getEntityPhysicsData(mesh) {
        if (!mesh) return null;

        if (this.gameState.player && this.gameState.player.ship && this.gameState.player.ship.mesh === mesh) {
            return {
                entity: this.gameState.player,
                rigidBody: this.gameState.player.ship.rigidBody,
                collider: this.gameState.player.ship.collider,
                type: 'player'
            };
        }

        for (const playerObj of Object.values(this.gameState.otherPlayers)) {
            if (!playerObj) continue;

            const playerMesh = playerObj.mesh || playerObj.ship?.mesh;
            if (playerMesh === mesh) {
                const rigidBody = playerObj.rigidBody || playerObj.ship?.rigidBody || playerMesh?.userData?.rigidBody;
                const collider = playerObj.collider || playerObj.ship?.collider || playerMesh?.userData?.collider;
                return {
                    entity: playerObj,
                    rigidBody,
                    collider,
                    type: 'otherPlayer'
                };
            }
        }

        for (const enemy of this.gameState.enemies) {
            if (!enemy) continue;

            if (enemy.mesh === mesh) {
                return {
                    entity: enemy,
                    rigidBody: enemy.rigidBody,
                    collider: enemy.collider,
                    type: 'enemy'
                };
            }
        }

        return null;
    }

    /**
     * Simple sphere-based collision check (kept for compatibility)
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
     * Simple collision resolution (kept for compatibility)
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
