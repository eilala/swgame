import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d';
import Player from './player/player.js';
import { loadRandomMap } from './maps/map-loader.js';
import Controls from './controls.js';
import PlayerCamera from './camera/player-camera.js';
import UI from './ui.js';
import BaseEnemy from './enemies/base-enemy.js';

// Initialize Rapier physics
let world = null;

async function initializeRapier() {
     // Initialize Rapier WASM module
     // RAPIER is already initialized in this version
     console.log('Initializing Rapier world...');
     world = new RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });
     console.log('Rapier.js physics world initialized:', world);
 }

// WebSocket connection
const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);
window.ws = ws; // Make ws globally available for weapon firing
window.myPlayerId = null; // Make myPlayerId globally available
let myPlayerId = null;
let myPlayerName = null;
let otherPlayers = {};

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add ambient light for visibility
const ambientLight = new THREE.AmbientLight(0x404040, 1); // soft white light
scene.add(ambientLight);

// Add directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

// Enemies array to hold active enemies
// Networked bolts array
const networkedBolts = [];
const enemies = [];

// Physics bodies map for collision handling
const physicsBodies = new Map();
window.world = world; // Make world globally available
window.RAPIER = RAPIER; // Make RAPIER globally available for other scripts

// Initialize Rapier before setting up the game
await initializeRapier();

// Load Map
loadRandomMap(scene, world);

// Player
const player = new Player(scene, world);
// Note: player.ship.mesh will be added to scene in the GLTF loader callback within BaseShip constructor

// WebSocket event handlers
ws.onopen = () => {
    console.log('Connected to server');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'spawn') {
        myPlayerId = message.playerId;
        window.myPlayerId = message.playerId; // Set global ID
        myPlayerName = message.playerName;
        console.log(`You are ${myPlayerName}`);
        // Spawn other players
        message.players.forEach(otherPlayer => {
            if (otherPlayer.id !== myPlayerId) {
                spawnOtherPlayer(otherPlayer);
            }
        });
        // Spawn enemies
        message.enemies.forEach(enemyData => {
            spawnEnemy(enemyData);
        });
} else if (message.type === 'newPlayer') {
  spawnOtherPlayer({ ...message, name: message.playerName });
} else if (message.type === 'playerUpdate') {
        updateOtherPlayer(message);
    } else if (message.type === 'playerDisconnected') {
        removeOtherPlayer(message.playerId);
    } else if (message.type === 'playerRespawned') {
        handlePlayerRespawn(message);
    } else if (message.type === 'fire') {
        handleNetworkedFire(message);
    } else if (message.type === 'enemyDestroyed') {
        handleEnemyDestruction(message.enemyId);
    } else if (message.type === 'playerDamaged') {
        handlePlayerDamage(message);
    }
};

ws.onclose = () => {
    console.log('Disconnected from server');
};

function spawnOtherPlayer(playerData) {
    const playerId = String(playerData.id || playerData.playerId);

    if (otherPlayers[playerId]) {
        return;
    }

    // Load the TIE Fighter model for other players
    const loader = new GLTFLoader();
    loader.load(
        'src/assets/models/tiefighter/TIEFighter.glb',
        (gltf) => {
            const mesh = gltf.scene;
            mesh.position.set(playerData.x || 0, playerData.y || 0, playerData.z || 0);
            mesh.quaternion.set(playerData.rotationX || 0, playerData.rotationY || 0, playerData.rotationZ || 0, playerData.rotationW || 1);
            mesh.scale.set(0.5, 0.5, 0.5); // Scale same as local player ship

            // Traverse the model and set material properties for visibility
            mesh.traverse((child) => {
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

            // Mark mesh as player for collision detection
            mesh.userData = mesh.userData || {};
            mesh.userData.isPlayer = true;
            mesh.userData.playerId = playerData.id || playerData.playerId;

            // Mark all child meshes as player parts too
            mesh.traverse((child) => {
                if (child.isMesh) {
                    child.userData = child.userData || {};
                    child.userData.isPlayer = true;
                    child.userData.playerId = playerData.id || playerData.playerId;
                }
            });

            scene.add(mesh);

            // Create physics body for this player
            createPlayerRigidBody(mesh, false);

            // Create name label positioned above the model's bounding box
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 64;
            context.font = 'Bold 30px Arial';
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.fillText(playerData.name || 'Unknown', 128, 40);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);

            // Position sprite above the bounding box of the model
            const box = new THREE.Box3().setFromObject(mesh);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            sprite.position.set(center.x, center.y + size.y / 2 + 1, center.z); // Above the top of the bounding box
            sprite.scale.set(2, 0.5, 1); // Scale appropriately
            sprite.userData = { name: playerData.name || 'Unknown' }; // Store name in sprite

            scene.add(sprite); // Add sprite to scene separately for proper positioning
            console.log('Added name sprite to player:', playerData.name);

            otherPlayers[playerId] = {
                mesh,
                nameSprite: sprite,
                health: playerData.health || 100,
                maxHealth: playerData.maxHealth || 100,
                shield: playerData.shield || 100,
                maxShield: playerData.maxShield || 100,
                isAlive: playerData.isAlive !== false
            };

            // Hide dead players initially
            if (!playerData.isAlive) {
                mesh.visible = false;
            }
        },
        undefined,
        (error) => {
            console.error('An error happened loading the player GLTF model:', error);
            // Fallback to red cube if loading fails
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(playerData.x || 0, playerData.y || 0, playerData.z || 0);
            mesh.quaternion.set(playerData.rotationX || 0, playerData.rotationY || 0, playerData.rotationZ || 0, playerData.rotationW || 1);
            scene.add(mesh);

            // Create name label
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 64;
            context.font = 'Bold 30px Arial';
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.fillText(playerData.name || 'Unknown', 128, 40);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.set(0, 2, 0); // Position above the cube
            sprite.scale.set(2, 0.5, 1); // Scale appropriately
            sprite.userData = { name: playerData.name || 'Unknown' }; // Store name in sprite
            mesh.add(sprite);
            
            // Mark all child meshes as player parts too (for fallback case)
            mesh.traverse((child) => {
                if (child.isMesh) {
                    child.userData = child.userData || {};
                    child.userData.isPlayer = true;
                    child.userData.playerId = playerData.id || playerData.playerId;
                }
            });

            // Create physics body for this player (fallback case)
            createPlayerRigidBody(mesh, false);

            otherPlayers[playerId] = {
                mesh,
                nameSprite: sprite,
                health: playerData.health || 100,
                maxHealth: playerData.maxHealth || 100,
                shield: playerData.shield || 100,
                maxShield: playerData.maxShield || 100,
                isAlive: playerData.isAlive !== false
            };

            // Hide dead players initially
            if (!playerData.isAlive) {
                mesh.visible = false;
            }
        }
    );
}

function updateOtherPlayer(data) {
    const playerId = String(data.playerId);
    const playerObj = otherPlayers[playerId];
    if (playerObj) {
        playerObj.mesh.position.set(data.x, data.y, data.z);
        playerObj.mesh.quaternion.set(data.rotationX, data.rotationY, data.rotationZ, data.rotationW || 1);

        // Update name sprite position to follow the player mesh
        if (playerObj.nameSprite) {
            const box = new THREE.Box3().setFromObject(playerObj.mesh);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            playerObj.nameSprite.position.set(center.x, center.y + size.y / 2 + 1, center.z);
        }

        // Update name if provided and different
        if (data.playerName && playerObj.nameSprite.userData.name !== data.playerName) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 64;
            context.font = 'Bold 30px Arial';
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.fillText(data.playerName, 128, 40);

            const texture = new THREE.CanvasTexture(canvas);
            playerObj.nameSprite.material.map = texture;
            playerObj.nameSprite.userData.name = data.playerName;
        }
    }
}

function removeOtherPlayer(playerId) {
    const playerObj = otherPlayers[String(playerId)];
    if (playerObj) {
        scene.remove(playerObj.mesh);
        if (playerObj.nameSprite) {
            scene.remove(playerObj.nameSprite);
        }
        delete otherPlayers[String(playerId)];
    }
}

function spawnEnemy(enemyData) {
    const enemy = new BaseEnemy(scene, world, new THREE.Vector3(enemyData.x, enemyData.y, enemyData.z), 50, 25, enemyData.id);
    enemies.push(enemy);
    // Note: enemy.mesh will be added to scene in the GLTF loader callback within BaseEnemy constructor
}

// Create physics rigid body for player ships
function createPlayerRigidBody(mesh, isLocalPlayer = false) {
    if (!world) return null;

    // Create a kinematic rigid body for ships (controlled by game logic)
    const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Create a collider based on the mesh's bounding box
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    colliderDesc.setCollisionGroups(isLocalPlayer ? 0b0001 : 0b0010); // Different collision groups for local vs other players
    const collider = world.createCollider(colliderDesc, rigidBody);

    // Store reference to the mesh and other data
    rigidBody.userData = {
        mesh: mesh,
        isPlayer: true,
        isLocalPlayer: isLocalPlayer,
        playerId: isLocalPlayer ? myPlayerId : mesh.userData?.playerId
    };

    physicsBodies.set(mesh, rigidBody);
    return rigidBody;
}
function handleNetworkedFire(data) {
    // Create a networked blaster bolt
    const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00aaff, // Blue color for the blaster bolt
        emissive: 0x0066ff // Make it glow
    });
    const boltMesh = new THREE.Mesh(geometry, material);

    // Orient the cylinder to face the direction of travel
    boltMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), // Default cylinder orientation (Y-axis)
        new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize()
    );

    // Position the bolt at the given position
    boltMesh.position.copy(data.position);
    const previousPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z); // Store initial position as Vector3

    boltMesh.userData = { direction: data.direction, isNetworkedBolt: true, speed: 60, lifetime: 1, age: 0, ownerId: data.playerId, previousPosition: previousPosition };
    scene.add(boltMesh);
    networkedBolts.push(boltMesh);
}

function handleEnemyDestruction(enemyId) {
    // Find and remove the enemy with the matching ID
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].id === enemyId) {
            scene.remove(enemies[i].mesh);
            enemies.splice(i, 1);
            console.log(`Enemy ${enemyId} destroyed for all players`);
            break;
        }
    }
}

function handlePlayerDamage(data) {
    if (data.playerId === myPlayerId) {
        // Update local player's health/shield
        player.ship.health = data.health;
        player.ship.shield = data.shield;
        player.ship.hull = data.health; // Assuming hull is health
        player.isAlive = data.isAlive;
        
        // Update the last shield damage time to prevent immediate regeneration
        const currentTime = Date.now() / 1000; // Convert to seconds
        player.ship.lastShieldDamageTime = currentTime;
        
        if (!data.isAlive) {
            // Handle player death locally
            console.log('You died! Press R to respawn.');
            // Hide the ship mesh
            player.ship.mesh.visible = false;
            // Could add death effects, respawn timer, etc.
        } else {
            // Ensure ship is visible when alive
            player.ship.mesh.visible = true;
        }
    } else {
        // Update other player's data
        const playerObj = otherPlayers[String(data.playerId)];
        if (playerObj) {
            // Store health data for visual feedback (could change cube color based on health)
            playerObj.health = data.health;
            playerObj.shield = data.shield;
            playerObj.isAlive = data.isAlive;
            if (!data.isAlive) {
                // Could hide the player's ship or show explosion effect
                playerObj.mesh.visible = false;
                if (playerObj.nameSprite) {
                    playerObj.nameSprite.visible = false;
                }
                console.log(`${playerObj.nameSprite.userData?.name || 'Player'} died!`);
            } else {
                playerObj.mesh.visible = true;
                if (playerObj.nameSprite) {
                    playerObj.nameSprite.visible = true;
                }
            }
        }
    }
}

function handlePlayerRespawn(data) {
    if (data.playerId === myPlayerId) {
        // Local player respawned
        player.ship.health = data.health;
        player.ship.shield = data.shield;
        player.ship.hull = data.health;
        player.isAlive = data.isAlive;
        player.position.set(data.x, data.y, data.z);
        player.quaternion.set(data.rotationX, data.rotationY, data.rotationZ, data.rotationW);
        player.ship.mesh.visible = true;
        console.log('You respawned!');
    } else {
        // Other player respawned
        if (otherPlayers[String(data.playerId)]) {
            const playerObj = otherPlayers[String(data.playerId)];
            playerObj.mesh.position.set(data.x, data.y, data.z);
            playerObj.mesh.quaternion.set(data.rotationX, data.rotationY, data.rotationZ, data.rotationW);
            playerObj.health = data.health;
            playerObj.shield = data.shield;
            playerObj.isAlive = data.isAlive;
            playerObj.mesh.visible = true;
            if (playerObj.nameSprite) {
                playerObj.nameSprite.visible = true;
            }
        } else {
            // Player didn't exist, spawn them
            spawnOtherPlayer(data);
        }
    }
}

// Player Camera
const playerCamera = new PlayerCamera(camera, player);

// Controls
const controls = new Controls(renderer.domElement, player);

// UI
const ui = new UI(player);

const clock = new THREE.Clock();

// Animation loop with proper visibility handling
let animationId = null;
let isPaused = false;

function animate() {
    // Only continue if the page is visible and not paused
    if (!document.hidden && !isPaused) {
        animationId = requestAnimationFrame(animate);
        
        const deltaTime = clock.getDelta();
        
        // Cap deltaTime to prevent issues when tabbing back in after being away
        const cappedDeltaTime = Math.min(deltaTime, 0.05); // Maximum 50ms per frame
        
        // Log if deltaTime is unusually large (can happen when tabbing back in after being away)
        if (deltaTime > 0.1) { // More than 100ms between frames
            console.log('Large deltaTime detected:', deltaTime, 'Using cappedDeltaTime:', cappedDeltaTime);
        }

        controls.update(cappedDeltaTime);
        player.update(controls, cappedDeltaTime);
        player.ship.update(player, cappedDeltaTime);
        playerCamera.update();
        ui.update();
        
        // Detect and resolve collisions between all meshes
        detectAndResolveCollisions();

        // Handle ISD collision detection and response
        handleISDCollisions();

        // Send position updates if connected
        if (ws.readyState === WebSocket.OPEN && myPlayerId !== null) {
            ws.send(JSON.stringify({
                type: 'position',
                x: player.position.x,
                y: player.position.y,
                z: player.position.z,
                rotationX: player.quaternion.x,
                rotationY: player.quaternion.y,
                rotationZ: player.quaternion.z,
                rotationW: player.quaternion.w
            }));
        }

        // Update enemies
        enemies.forEach(enemy => enemy.update(cappedDeltaTime));
        
        // Clean up dead enemies (if any remain after destruction)
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].isDestroyed()) {
                scene.remove(enemies[i].mesh);
                enemies.splice(i, 1);
            }
        }

        // Update networked bolts
        for (let i = networkedBolts.length - 1; i >= 0; i--) {
            const bolt = networkedBolts[i];
            const direction = new THREE.Vector3(bolt.userData.direction.x, bolt.userData.direction.y, bolt.userData.direction.z).normalize();

            // Update previous position before moving
            bolt.userData.previousPosition.copy(bolt.position);

            bolt.position.add(direction.clone().multiplyScalar(bolt.userData.speed * cappedDeltaTime));

            bolt.userData.age += cappedDeltaTime;
            if (bolt.userData.age >= bolt.userData.lifetime) {
                scene.remove(bolt);
                networkedBolts.splice(i, 1);
            }
        }
        
        // Limit the number of active networked bolts to prevent performance issues
        if (networkedBolts.length > 100) { // Reasonable limit to prevent too many bolts
            // Remove oldest bolts if we have too many
            while (networkedBolts.length > 100) {
                const bolt = networkedBolts.shift(); // Remove oldest bolt from the beginning
                scene.remove(bolt);
            }
        }
        
        // Get active blaster bolts from the ship's weapon
        const shipBolts = player.ship.primaryWeapon.getBolts();
        
        // Update and add any new bolts to the scene if they're not already added
        shipBolts.forEach(bolt => {
            // Update the bolt's position and state if it has a mesh
            if (bolt.mesh) {
                bolt.update(cappedDeltaTime);
            }
            
            if (bolt.mesh && !scene.children.includes(bolt.mesh)) {
                // Mark the mesh as a blaster bolt for easy identification later
                bolt.mesh.userData = bolt.mesh.userData || {};
                bolt.mesh.userData.isBlasterBolt = true;
                bolt.mesh.userData.ownerId = bolt.ownerId; // Store owner ID in mesh userData
                scene.add(bolt.mesh);
            }
        });
        
        // Remove any bolts from the scene that are no longer active
        for (let i = scene.children.length - 1; i >= 0; i--) {
            const child = scene.children[i];
            // If it's a blaster bolt mesh that's no longer in the weapon's bolt array, remove it
            if (child.userData && child.userData.isBlasterBolt) {
                const stillActive = shipBolts.some(bolt => bolt.mesh === child);
                if (!stillActive) {
                    scene.remove(child);
                }
            }
        }
        
        // Limit the number of active ship bolts to prevent performance issues
        if (shipBolts.length > 50) { // Reasonable limit to prevent too many bolts
            // Remove oldest bolts if we have too many
            while (shipBolts.length > 50) {
                const bolt = shipBolts.shift(); // Remove oldest bolt from the beginning
                scene.remove(bolt.mesh);
            }
        }

        // Build array of potential collision targets (excluding bolts)
        const collisionTargets = [];

        // Add enemy meshes
        enemies.forEach(enemy => {
            if (enemy.mesh && enemy.mesh.parent) {
                // Only add enemies that have been properly positioned (not at origin unless they're supposed to be there)
                // We can't easily distinguish here, so we'll add all valid enemy meshes
                collisionTargets.push(enemy.mesh);
            }
        });

        // Add player meshes (local and other players)
        if (player.ship.mesh && player.ship.mesh.parent) collisionTargets.push(player.ship.mesh);
        Object.values(otherPlayers).forEach(playerObj => {
            if (playerObj.mesh && playerObj.isAlive && playerObj.mesh.parent) collisionTargets.push(playerObj.mesh);
        });

        // Update physics simulation
        if (world) {
            world.step();

            // Handle collisions using Rapier event system
            handleRapierCollisions();
        }

        // Collision detection: Check for collisions between blaster bolts and targets using raycasting
        // Check local bolts - limit processing to prevent freezing
        const maxLocalBoltsToProcess = 20; // Limit to prevent too many collision checks at once
        let localBoltsProcessed = 0;
        for (let i = shipBolts.length - 1; i >= 0 && localBoltsProcessed < maxLocalBoltsToProcess; i--) {
            localBoltsProcessed++;
            const bolt = shipBolts[i];

            // Skip collision detection if bolt doesn't have a mesh yet or is destroyed
            if (!bolt.mesh || bolt.isDestroyed) continue;

            // Create ray from previous position to current position
            const direction = bolt.mesh.position.clone().sub(bolt.previousPosition).normalize();
            const distance = bolt.mesh.position.distanceTo(bolt.previousPosition);
            const raycaster = new THREE.Raycaster(bolt.previousPosition, direction, 0, distance);

            const intersects = raycaster.intersectObjects(collisionTargets, true);

            // Debug logging for raycasting - only log when there are intersections
            // if (intersects.length > 0) {
            //     console.log(`Raycasting found ${intersects.length} intersections for bolt at position ${bolt.mesh.position.x.toFixed(2)}, ${bolt.mesh.position.y.toFixed(2)}, ${bolt.mesh.position.z.toFixed(2)}`);
            // }

            let hitSomething = false;
            for (const intersect of intersects) {
                const hitObject = intersect.object;

                // Debug logging
                console.log(`Collision detected: Bolt at ${bolt.mesh.position.x.toFixed(2)}, ${bolt.mesh.position.y.toFixed(2)}, ${bolt.mesh.position.z.toFixed(2)} hit object at ${hitObject.position.x.toFixed(2)}, ${hitObject.position.y.toFixed(2)}, ${hitObject.position.z.toFixed(2)}`);
                console.log(`Hit object userData:`, hitObject.userData);
                console.log(`Hit object name:`, hitObject.name);
                console.log(`Hit object type:`, hitObject.type);

                // Check if bolt hit the shooter's own ship
                // Only apply this check if it's not the owner's own bolt, or if the bolt is past the grace period
                if ((hitObject === player.ship.mesh || (hitObject.userData && hitObject.userData.isPlayer)) &&
                    !(bolt.ownerId === myPlayerId && bolt.age < 0.3)) { // Don't damage self during grace period
                    console.log("Bolt hit player's own ship");
                    // Remove the bolt
                    player.ship.primaryWeapon.bolts.splice(i, 1);
                    if (bolt.mesh && bolt.mesh.parent) {
                        bolt.mesh.parent.remove(bolt.mesh);
                    }
                    hitSomething = true;
                    break;
                }

                // Check collision with enemies first
                if (hitObject.userData && hitObject.userData.isEnemy) {
                    console.log(`Hit object is enemy with ID: ${hitObject.userData.enemyId}`);
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        // Check if this hitObject is associated with this enemy
                        if (enemy.mesh === hitObject || hitObject.userData.enemyId === enemy.id) {
                            console.log(`Bolt hit enemy ${enemy.id} for ${bolt.damage} damage!`);
                            // Damage the enemy
                            const destroyed = enemy.takeDamage(bolt.damage);

                            // Remove the bolt
                            player.ship.primaryWeapon.bolts.splice(i, 1);
                            if (bolt.mesh && bolt.mesh.parent) {
                                bolt.mesh.parent.remove(bolt.mesh);
                            }
                            hitSomething = true;

                            // If enemy is destroyed, remove it and notify other players
                            if (destroyed) {
                                console.log(`Enemy ${enemy.id} destroyed!`);
                                scene.remove(enemy.mesh);
                                enemies.splice(j, 1);

                                // Send enemy destruction to server
                                if (ws.readyState === WebSocket.OPEN) {
                                    ws.send(JSON.stringify({
                                        type: 'enemyDestroyed',
                                        enemyId: enemy.id
                                    }));
                                }
                            }
                            break;
                        }
                    }
                    if (hitSomething) break;
                }

                // Check collision with other players
                if (hitObject.userData && hitObject.userData.isPlayer) {
                    // Get the player ID from the hit object's userData
                    const hitPlayerId = hitObject.userData.playerId;
                    for (const [playerId, playerObj] of Object.entries(otherPlayers)) {
                        // Check if this hitObject is associated with this player
                        if (playerObj.mesh === hitObject || playerObj.mesh.userData.playerId === hitPlayerId || hitPlayerId === parseInt(playerId)) {
                            if (playerObj.isAlive) {
                                console.log(`Local bolt hit player ${playerObj.nameSprite.userData?.name || 'Player'} (ID: ${playerId}) for ${bolt.damage} damage!`);
                                // Damage the player
                                player.ship.primaryWeapon.bolts.splice(i, 1);
                                if (bolt.mesh && bolt.mesh.parent) {
                                    bolt.mesh.parent.remove(bolt.mesh);
                                }
                                hitSomething = true;

                                // Send player damage to server (don't hit own player)
                                const targetId = parseInt(playerId);
                                if (targetId !== bolt.ownerId) {
                                    console.log(`Sending playerHit message: attackerPlayerId=${bolt.ownerId}, targetPlayerId=${targetId}, damage=${bolt.damage}`);
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({
                                            type: 'playerHit',
                                            attackerPlayerId: bolt.ownerId,
                                            targetPlayerId: targetId,
                                            damage: bolt.damage
                                        }));
                                    }
                                }
                                break;
                            }
                        }
                    }
                    if (hitSomething) break;
                }
            }

            // If hit something, stop checking this bolt
            if (hitSomething) continue;
        }

        // Check networked bolts using raycasting - limit processing to prevent freezing
        const maxNetworkedBoltsToProcess = 20; // Limit to prevent too many collision checks at once
        let networkedBoltsProcessed = 0;
        for (let i = networkedBolts.length - 1; i >= 0 && networkedBoltsProcessed < maxNetworkedBoltsToProcess; i--) {
            networkedBoltsProcessed++;
            const bolt = networkedBolts[i];

            // Skip collision detection if bolt doesn't have required properties
            if (!bolt.userData || typeof bolt.userData.previousPosition === 'undefined') continue;

            // Create ray from previous position to current position
            const direction = bolt.position.clone().sub(bolt.userData.previousPosition).normalize();
            const distance = bolt.position.distanceTo(bolt.userData.previousPosition);
            const raycaster = new THREE.Raycaster(bolt.userData.previousPosition, direction, 0, distance);

            const intersects = raycaster.intersectObjects(collisionTargets, true);

            // Debug logging for raycasting - only log when there are intersections
            // if (intersects.length > 0) {
            //     console.log(`Networked raycasting found ${intersects.length} intersections for bolt at position ${bolt.position.x.toFixed(2)}, ${bolt.position.y.toFixed(2)}, ${bolt.position.z.toFixed(2)}`);
            // }

            let hitSomething = false;
            for (const intersect of intersects) {
                const hitObject = intersect.object;

                // Debug logging
                console.log(`Networked bolt collision detected: Bolt at ${bolt.position.x.toFixed(2)}, ${bolt.position.y.toFixed(2)}, ${bolt.position.z.toFixed(2)} hit object at ${hitObject.position.x.toFixed(2)}, ${hitObject.position.y.toFixed(2)}, ${hitObject.position.z.toFixed(2)}`);
                console.log(`Hit object userData:`, hitObject.userData);
                console.log(`Hit object name:`, hitObject.name);
                console.log(`Hit object type:`, hitObject.type);

                // Check if networked bolt hit the local player
                // Only apply this check if it's not the owner's own bolt, or if the bolt is past the grace period
                if ((hitObject === player.ship.mesh || (hitObject.userData && hitObject.userData.isPlayer)) &&
                    !(bolt.userData.ownerId === myPlayerId && bolt.userData.age < 0.2)) { // Don't damage self during grace period
                    console.log("Networked bolt hit player's own ship");
                    // Update the last shield damage time to prevent immediate regeneration
                    const currentTime = Date.now() / 1000; // Convert to seconds
                    player.ship.lastShieldDamageTime = currentTime;
                    
                    // Send damage to server
                    console.log(`Networked bolt from player ${bolt.userData.ownerId} hit local player for 10 damage!`);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'playerHit',
                            attackerPlayerId: bolt.userData.ownerId,
                            targetPlayerId: myPlayerId,
                            damage: 10
                        }));
                    }
                    // Remove the bolt
                    if (bolt.parent) {
                        bolt.parent.remove(bolt);
                    }
                    networkedBolts.splice(i, 1);
                    hitSomething = true;
                    break;
                }

                // Check collision with enemies
                if (hitObject.userData && hitObject.userData.isEnemy) {
                    console.log(`Networked bolt hit object is enemy with ID: ${hitObject.userData.enemyId}`);
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        // Check if this hitObject is associated with this enemy
                        if (enemy.mesh === hitObject || hitObject.userData.enemyId === enemy.id) {
                            console.log(`Networked bolt hit enemy ${enemy.id} for 10 damage!`);
                            // Damage the enemy
                            const destroyed = enemy.takeDamage(10); // Assuming damage 10 for networked bolts

                            // Remove the bolt
                            if (bolt.parent) {
                                bolt.parent.remove(bolt);
                            }
                            networkedBolts.splice(i, 1);
                            hitSomething = true;

                            // If enemy is destroyed, remove it and notify other players
                            if (destroyed) {
                                console.log(`Enemy ${enemy.id} destroyed by networked bolt!`);
                                scene.remove(enemy.mesh);
                                enemies.splice(j, 1);

                                // Send enemy destruction to server
                                if (ws.readyState === WebSocket.OPEN) {
                                    ws.send(JSON.stringify({
                                        type: 'enemyDestroyed',
                                        enemyId: enemy.id
                                    }));
                                }
                            }
                            break;
                        }
                    }
                    if (hitSomething) break;
                }

                // Check collision with other players
                if (hitObject.userData && hitObject.userData.isPlayer) {
                    // Get the player ID from the hit object's userData
                    const hitPlayerId = hitObject.userData.playerId;
                    for (const [playerId, playerObj] of Object.entries(otherPlayers)) {
                        // Check if this hitObject is associated with this player
                        if (playerObj.mesh === hitObject || playerObj.mesh.userData.playerId === hitPlayerId || hitPlayerId === parseInt(playerId)) {
                            if (playerObj.isAlive) {
                                console.log(`Networked bolt hit player ${playerObj.nameSprite.userData?.name || 'Player'} (ID: ${playerId}) for 10 damage!`);
                                // Damage the player
                                if (bolt.parent) {
                                    bolt.parent.remove(bolt);
                                }
                                networkedBolts.splice(i, 1);
                                hitSomething = true;

                                // Send player damage to server (don't hit own player)
                                const targetId = parseInt(playerId);
                                if (targetId !== bolt.userData.ownerId) {
                                    console.log(`Sending networked playerHit message: attackerPlayerId=${bolt.userData.ownerId}, targetPlayerId=${targetId}, damage=10`);
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify({
                                            type: 'playerHit',
                                            attackerPlayerId: bolt.userData.ownerId,
                                            targetPlayerId: targetId,
                                            damage: 10 // Assuming damage 10 for networked bolts
                                        }));
                                    }
                                }
                                break;
                            }
                        }
                    }
                    if (hitSomething) break;
                }
            }

            // If hit something, stop checking this bolt
            if (hitSomething) continue;
        }

        renderer.render(scene, camera);
    } else {
        // When paused or hidden, don't continue the animation loop
        // We'll restart it when the page becomes visible again
        isPaused = true;
    }
}

// Handle tab visibility changes properly
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isPaused) {
        // Reset the clock to avoid large deltaTime when resuming
        clock.getDelta();
        // Resume the animation loop
        isPaused = false;
        animate();
    } else if (document.hidden) {
        // Pause the game when tab is hidden
        isPaused = true;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }
});

// Start the animation loop

// Simple bounding box collision detection
function checkCollision(mesh1, mesh2) {
    const box1 = new THREE.Box3().setFromObject(mesh1);
    const box2 = new THREE.Box3().setFromObject(mesh2);
    const intersects = box1.intersectsBox(box2);
    if (intersects) {
        console.log('Collision detected between:', mesh1.userData, 'and', mesh2.userData);
    }
    return intersects;
}

// Simple collision detection for player-to-player and player-to-enemy collisions only
function detectAndResolveCollisions() {
    // Check collisions between local player and other players
    Object.values(otherPlayers).forEach(playerObj => {
        if (playerObj.mesh && playerObj.isAlive && player.ship.mesh) {
            if (simpleSphereCollisionCheck(player.ship.mesh, playerObj.mesh)) {
                resolveSimpleCollision(player.ship.mesh, playerObj.mesh);
            }
        }
    });

    // Check collisions between local player and enemies
    enemies.forEach(enemy => {
        if (enemy.mesh && player.ship.mesh) {
            if (simpleSphereCollisionCheck(player.ship.mesh, enemy.mesh)) {
                resolveSimpleCollision(player.ship.mesh, enemy.mesh);
            }
        }
    });

    // Check collisions between other players and enemies
    Object.values(otherPlayers).forEach(playerObj => {
        if (playerObj.mesh && playerObj.isAlive) {
            enemies.forEach(enemy => {
                if (enemy.mesh) {
                    if (simpleSphereCollisionCheck(playerObj.mesh, enemy.mesh)) {
                        resolveSimpleCollision(playerObj.mesh, enemy.mesh);
                    }
                }
            });
        }
    });

    // Check collisions between other players
    const otherPlayerMeshes = Object.values(otherPlayers)
        .filter(playerObj => playerObj.mesh && playerObj.isAlive)
        .map(playerObj => playerObj.mesh);

    for (let i = 0; i < otherPlayerMeshes.length; i++) {
        for (let j = i + 1; j < otherPlayerMeshes.length; j++) {
            if (simpleSphereCollisionCheck(otherPlayerMeshes[i], otherPlayerMeshes[j])) {
                resolveSimpleCollision(otherPlayerMeshes[i], otherPlayerMeshes[j]);
            }
        }
    }
}

// Handle ISD collision detection specifically
function handleISDCollisions() {
    if (!player || !player.ship || !player.ship.mesh) return;

    // Use raycasting for very accurate collision detection with the ISD model
    const playerPosition = player.ship.mesh.position;

    // Find ISD meshes in the scene
    const isdMeshes = [];
    scene.traverse((child) => {
        if (child.userData && child.userData.isStaticObject && child.userData.isISD) {
            isdMeshes.push(child);
        }
    });

    if (isdMeshes.length === 0) return;

    // Check multiple directions for proximity to surfaces
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

    // Check if player is getting too close to surfaces
    for (const direction of checkDirections) {
        const raycaster = new THREE.Raycaster(playerPosition, direction, 0, 4); // Check within 4 units
        const intersects = raycaster.intersectObjects(isdMeshes, true);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            if (intersection.distance < minDistance) {
                minDistance = intersection.distance;
                needsCorrection = true;
                if (intersection.face) {
                    closestNormal.copy(intersection.face.normal);
                    closestNormal.transformDirection(intersection.object.matrixWorld);
                } else {
                    closestNormal.copy(direction);
                }
            }
        }
    }

    // Smoothly interpolate position correction
    if (needsCorrection && minDistance < 2.8) { // Within 2.8 units - getting close
        // Calculate desired safe distance
        const safeDistance = 3.0;
        const correctionNeeded = safeDistance - minDistance;

        if (correctionNeeded > 0) {
            // Interpolate the correction over time for smoothness
            const interpolationFactor = 0.3; // Adjust for smoothness (0.1 = very smooth, 1.0 = instant)
            const interpolatedCorrection = correctionNeeded * interpolationFactor;

            // Apply smooth correction
            const correctionVector = closestNormal.clone().multiplyScalar(interpolatedCorrection);
            player.ship.mesh.position.add(correctionVector);
            player.position.copy(player.ship.mesh.position);

            // Gradually reduce velocity toward the surface
            const normalDotVelocity = player.velocity.dot(closestNormal);
            if (normalDotVelocity > 0) {
                // Gradually remove the component moving toward the surface
                const velocityReduction = Math.min(normalDotVelocity * 0.3, normalDotVelocity);
                const velocityCorrection = closestNormal.clone().multiplyScalar(velocityReduction);
                player.velocity.sub(velocityCorrection);
            }

            // Update physics body with interpolated values
            if (player.ship.rigidBody) {
                player.ship.rigidBody.setTranslation(player.ship.mesh.position, true);
                player.ship.rigidBody.setLinvel({
                    x: player.velocity.x,
                    y: player.velocity.y,
                    z: player.velocity.z
                }, true);
            }
        }
    }
}

// Simple sphere-based collision check
function simpleSphereCollisionCheck(mesh1, mesh2) {
    // Get world positions of both meshes
    const pos1 = new THREE.Vector3();
    const pos2 = new THREE.Vector3();
    mesh1.getWorldPosition(pos1);
    mesh2.getWorldPosition(pos2);
    
    // Calculate distance between centers
    const distance = pos1.distanceTo(pos2);
    
    // Use a fixed collision radius based on the scale of the objects
    const scale1 = new THREE.Vector3();
    const scale2 = new THREE.Vector3();
    mesh1.getWorldScale(scale1);
    mesh2.getWorldScale(scale2);
    
    // Average scale factor to determine collision threshold
    const avgScale = (Math.max(scale1.x, scale1.y, scale1.z) + Math.max(scale2.x, scale2.y, scale2.z)) / 2;
    const collisionThreshold = avgScale * 1.5; // Adjust this value as needed
    
    return distance < collisionThreshold;
}

// Simple collision resolution
function resolveSimpleCollision(mesh1, mesh2) {
    // Get world positions of both meshes
    const pos1 = new THREE.Vector3();
    const pos2 = new THREE.Vector3();
    mesh1.getWorldPosition(pos1);
    mesh2.getWorldPosition(pos2);
    
    // Calculate the direction from mesh1 to mesh2
    const direction = new THREE.Vector3().subVectors(pos2, pos1).normalize();
    
    // Calculate current distance
    const currentDistance = pos1.distanceTo(pos2);
    
    // Calculate minimum separation distance
    const scale1 = new THREE.Vector3();
    const scale2 = new THREE.Vector3();
    mesh1.getWorldScale(scale1);
    mesh2.getWorldScale(scale2);
    const avgScale = (Math.max(scale1.x, scale1.y, scale1.z) + Math.max(scale2.x, scale2.y, scale2.z)) / 2;
    const minDistance = avgScale * 1.5;
    
    // Only resolve if objects are too close
    if (currentDistance < minDistance) {
        // Calculate how much to separate
        const overlap = minDistance - currentDistance;
        const moveDistance = overlap / 2; // Move each object half the distance
        
        // Move mesh1 away from mesh2
        const offset1 = direction.clone().multiplyScalar(-moveDistance);
        mesh1.position.add(offset1);
        
        // Move mesh2 away from mesh1
        const offset2 = direction.clone().multiplyScalar(moveDistance);
        mesh2.position.add(offset2);
    }
}

// Handle collisions using Rapier.js event system
function handleRapierCollisions() {
    if (!world) return;

    // Use the correct Rapier API for handling collisions in version 0.19
    try {
        // Check for intersections manually using contact pairs
        world.forEachCollider((collider) => {
            const body = collider.parent();
            const userData = body.userData || {};

            // Only check player colliders
            if (userData.isPlayer) {
                // Check intersection with ISD colliders
                world.forEachCollider((isdCollider) => {
                    const isdBody = isdCollider.parent();
                    const isdUserData = isdBody.userData || {};

                    if (isdUserData.isISD && collider !== isdCollider) {
                        // Check if these colliders are intersecting using narrow phase
                        const contact = world.narrowPhase.contactPair(collider, isdCollider);

                        if (contact && contact.hasAnyActiveContact) {
                            console.log('Player collided with ISD!');

                            // Get the player's mesh for position correction
                            const playerMesh = userData.mesh;

                            if (playerMesh) {
                                // Simple collision response: push player away from ISD
                                const isdPos = isdBody.translation();
                                const playerPos = body.translation();

                                // Calculate direction from ISD to player
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

                                // Push player away by a small amount
                                const pushDistance = 2.0; // Adjust as needed
                                playerMesh.position.x += direction.x * pushDistance;
                                playerMesh.position.y += direction.y * pushDistance;
                                playerMesh.position.z += direction.z * pushDistance;

                                // Also update the rigid body position
                                body.setTranslation({
                                    x: playerMesh.position.x,
                                    y: playerMesh.position.y,
                                    z: playerMesh.position.z
                                }, true);

                                console.log('Pushed player away from ISD');
                            }
                        }
                    }
                });
            }
        });
    } catch (error) {
        console.warn('Rapier collision handling error:', error);
        // Fallback: use simple distance-based collision detection
        handleSimpleCollisionDetection();
    }
}

// Fallback collision detection using simple distance checks
function handleSimpleCollisionDetection() {
    // Get all collision targets including ISD meshes
    const collisionTargets = [];

    // Add ISD meshes (they should be marked as static objects)
    scene.traverse((child) => {
        if (child.userData && child.userData.isStaticObject && child.userData.isISD) {
            collisionTargets.push(child);
        }
    });

    // Check player collision with ISD
    if (player && player.ship && player.ship.mesh) {
        const playerPos = player.ship.mesh.position;

        collisionTargets.forEach(target => {
            // Use bounding box intersection for more accurate collision detection
            const playerBox = new THREE.Box3().setFromObject(player.ship.mesh);
            const targetBox = new THREE.Box3().setFromObject(target);

            if (playerBox.intersectsBox(targetBox)) {
                console.log('Player intersecting with ISD, pushing away');

                // Calculate the intersection depth and direction
                const intersection = new THREE.Box3().setFromObject(target);
                intersection.intersect(playerBox);

                // Get the center of the intersection
                const intersectionCenter = intersection.getCenter(new THREE.Vector3());

                // Calculate direction from ISD center to player
                const direction = new THREE.Vector3()
                    .subVectors(playerPos, target.position)
                    .normalize();

                // Calculate push distance based on bounding box sizes
                const playerSize = playerBox.getSize(new THREE.Vector3());
                const targetSize = targetBox.getSize(new THREE.Vector3());

                // Use the maximum dimension for push distance
                const maxPlayerDim = Math.max(playerSize.x, playerSize.y, playerSize.z);
                const maxTargetDim = Math.max(targetSize.x, targetSize.y, targetSize.z);
                const pushDistance = (maxPlayerDim + maxTargetDim) / 2 + 1.0;

                // Push player away
                player.ship.mesh.position.add(direction.multiplyScalar(pushDistance));

                // Update player's logical position
                player.position.copy(player.ship.mesh.position);

                // Update physics body if it exists
                if (player.ship.rigidBody) {
                    player.ship.rigidBody.setTranslation(player.ship.mesh.position, true);
                }

                console.log(`Pushed player by ${pushDistance} units`);
            }
        });
    }
}

animate();