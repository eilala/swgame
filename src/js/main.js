import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import RAPIER from '@dimforge/rapier3d';
import Player from './player/player.js';
import { loadRandomMap } from './maps/map-loader.js';
import Controls from './controls.js';
import PlayerCamera from './camera/player-camera.js';
import UI from './ui.js';
import BaseEnemy from './enemies/base-enemy.js';
import BaseShip from './ships/base-ship.js';
import ImperialTieFighter from './ships/imperial-tie-fighter.js';
import DebrisManager from './managers/debris-manager.js';

// Initialize Rapier physics
let world = null;

// Debug mode for tab-out bolt accumulation issue (set to false in production)
// window.DEBUG_TAB_OUT_BOLTS = false;

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
window.scene = scene; // Make scene globally available for weapon sounds

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Audio listener attached to camera
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

// Make camera and audioListener globally available for weapon sounds and UI
window.camera = { audioListener, camera }; // Store both the audio listener and the camera object
// Also make the camera directly available as a global variable
window.mainCamera = camera;

// Load audio buffer for networked laser sounds
const audioLoader = new THREE.AudioLoader();
let laserAudioBuffer = null;
audioLoader.load(
    '/assets/sfx/bolt.ogg',
    (buffer) => {
        laserAudioBuffer = buffer;
        console.log('Laser sound loaded for networked fire');
    },
    (progress) => {
        console.log('Loading networked laser sound...', (progress.loaded / progress.total * 100) + '%');
    },
    (error) => {
        console.warn('Failed to load networked laser sound:', error);
    }
);

// Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Post-processing setup for glow effects
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Add bloom pass for glow effects on emissive materials
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, // strength
    0.4, // radius
    0.85 // threshold
);
composer.addPass(bloomPass);

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

// Debris manager for component explosion effects
const debrisManager = new DebrisManager(scene, world);

window.world = world; // Make world globally available
window.RAPIER = RAPIER; // Make RAPIER globally available for other scripts

// Initialize Rapier before setting up the game
await initializeRapier();

// Load Map
loadRandomMap(scene, world);

// Player
const player = new Player(scene, world);
// Note: player.ship will be set based on ship type

// Set debris manager reference for the player's ship
if (player.ship && typeof player.ship.setDebrisManager === 'function') {
    player.ship.setDebrisManager(debrisManager);
}

// Store the player's assigned ship type
let myShipType = 'imperial-tie-fighter';

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
        myShipType = message.shipType || 'imperial-tie-fighter';
        console.log(`You are ${myPlayerName} with ship type ${myShipType}`);

        // Initialize player ship based on type
        if (myShipType === 'imperial-tie-fighter') {
            player.ship = new ImperialTieFighter(scene, world);
        } else {
            player.ship = new BaseShip(scene, world);
        }

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
    } else if (message.type === 'enemyRespawned') {
        handleEnemyRespawn(message.enemy);
    } else if (message.type === 'playerDamaged') {
        handlePlayerDamage(message);
    } else if (message.type === 'playerComponentDestroyed') {
        handlePlayerComponentDestruction(message);
    } else if (message.type === 'enemyComponentDestroyed') {
        handleEnemyComponentDestruction(message);
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

    // Determine ship type - all players currently use imperial-tie-fighter
    const shipType = playerData.shipType || 'imperial-tie-fighter';

    // Load the appropriate model based on ship type
    let modelPath = '/assets/models/tiefighter/TIEFighter.glb'; // Default to TIE Fighter

    const loader = new GLTFLoader();
    loader.load(
        modelPath,
        (gltf) => {
            const mesh = gltf.scene;
            mesh.position.set(playerData.x || 0, playerData.y || 0, playerData.z || 0);
            mesh.quaternion.set(playerData.rotationX || 0, playerData.rotationY || 0, playerData.rotationZ || 0, playerData.rotationW || 1);
            mesh.scale.set(0.5, 0.5, 0.5); // Scale same as local player ship

            // Traverse the model and set material properties for visibility
            // Also assign component IDs to child meshes (same as BaseEnemy)
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

                    // Assign component IDs based on mesh name (same logic as BaseEnemy)
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

                    child.userData = child.userData || {};
                    child.userData.componentId = componentId;
                    child.userData.isPlayer = true;
                    child.userData.playerId = playerData.id || playerData.playerId;

                    console.log(`Other player ${playerData.name}: Assigned mesh "${child.name}" to component "${componentId}"`);
                }
            });

            // Mark mesh as player for collision detection
            mesh.userData = mesh.userData || {};
            mesh.userData.isPlayer = true;
            mesh.userData.playerId = playerData.id || playerData.playerId;

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
                shipType,
                health: playerData.health || 110,
                maxHealth: playerData.maxHealth || 110,
                shield: playerData.shield || 0,
                maxShield: playerData.maxShield || 0,
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
                shipType,
                health: playerData.health || 110,
                maxHealth: playerData.maxHealth || 110,
                shield: playerData.shield || 0,
                maxShield: playerData.maxShield || 0,
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
    // Set debris manager reference for the enemy
    enemy.setDebrisManager(debrisManager);
    enemies.push(enemy);
    // Note: enemy.mesh will be added to scene in the GLTF loader callback within BaseEnemy constructor
}

function spawnRespawnedEnemy(enemyData) {
    const enemy = new BaseEnemy(scene, world, new THREE.Vector3(enemyData.x, enemyData.y, enemyData.z), 50, 25, enemyData.id);
    // Set debris manager reference for the respawned enemy
    enemy.setDebrisManager(debrisManager);
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

    return rigidBody;
}
function handleNetworkedFire(data) {
    // Create a networked blaster bolt - but limit creation rate to prevent flooding
    const currentTime = Date.now() / 1000;

    // Check if we received a fire event recently from this player
    if (!window.lastFireTime) window.lastFireTime = {};
    if (!window.lastFireTime[data.playerId]) window.lastFireTime[data.playerId] = 0;

    // Limit networked bolts to 10 per second per player to prevent flooding
    const timeSinceLastFire = currentTime - window.lastFireTime[data.playerId];
    if (timeSinceLastFire < 0.1) { // 100ms minimum between bolts from same player
        if (window.DEBUG_TAB_OUT_BOLTS) {
            console.log(`[DEBUG] Ignoring rapid networked fire from player ${data.playerId}, time since last: ${timeSinceLastFire}`);
        }
        return;
    }

    window.lastFireTime[data.playerId] = currentTime;

    if (window.DEBUG_TAB_OUT_BOLTS) {
        console.log(`[DEBUG] Creating networked bolt from player ${data.playerId}, tabHidden=${document.hidden}, networkedBoltsBefore=${networkedBolts.length}`);
    }

    // Create the bolt
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

    boltMesh.userData = { direction: data.direction, isNetworkedBolt: true, speed: 60, lifetime: 1, age: 0, ownerId: data.playerId, previousPosition: previousPosition, hitTargets: new Set() };
    scene.add(boltMesh);
    networkedBolts.push(boltMesh);

    if (window.DEBUG_TAB_OUT_BOLTS) {
        console.log(`[DEBUG] Created networked bolt, total now: ${networkedBolts.length}`);
    }

    // Play firing sound at the bolt's position (only if tab is visible)
    if (!document.hidden && laserAudioBuffer) {
        try {
            // Create positional audio source
            const sound = new THREE.PositionalAudio(audioListener);
            sound.setBuffer(laserAudioBuffer);
            sound.setRefDistance(20); // Distance at which volume starts to attenuate
            sound.setVolume(0.03); // Reduce volume to avoid being too loud

            // Position the sound at the firing location
            sound.position.copy(data.position);
            scene.add(sound);

            // Play the sound
            sound.play();

            // Clean up after sound finishes (with some buffer time)
            setTimeout(() => {
                if (sound.parent) {
                    sound.parent.remove(sound);
                }
            }, 1000); // 1 second should be enough for most laser sounds

        } catch (error) {
            console.warn('Failed to play networked firing sound:', error);
        }
    }
}

function handleEnemyDestruction(enemyId) {
    // Find and remove the enemy with the matching ID
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].id === enemyId) {
            // Clean up the enemy's resources before removing
            if (enemies[i].destroy) {
                enemies[i].destroy();
            }
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
        player.ship.totalHullHealth = data.totalHullHealth || player.ship.totalHullHealth;
        player.isAlive = data.isAlive;

        // Update component health if provided
        if (data.componentHealth) {
            player.ship.componentHealth = { ...player.ship.componentHealth, ...data.componentHealth };
        }

        // Handle component-specific damage for other players
        if (data.componentId && data.componentId !== null) {
            // Apply damage to the other player's component
            if (playerObj.componentHealth && playerObj.componentHealth[data.componentId] !== undefined) {
                playerObj.componentHealth[data.componentId] -= (data.damage || 10);
                playerObj.componentHealth[data.componentId] = Math.max(0, playerObj.componentHealth[data.componentId]);
            }
        }

        // Update the last shield damage time to prevent immediate regeneration
        const currentTime = Date.now() / 1000; // Convert to seconds
        player.ship.lastShieldDamageTime = currentTime;

        // Apply component-specific damage if component was hit
        if (data.componentId && player.ship.componentHealth[data.componentId] !== undefined) {
            console.log(`Applying component-specific damage: componentId=${data.componentId}, damage=${data.damage || 10}`);
            player.ship.componentHealth[data.componentId] -= (data.damage || 10);
            player.ship.componentHealth[data.componentId] = Math.max(0, player.ship.componentHealth[data.componentId]);

            // Check if component should be destroyed
            if (player.ship.componentHealth[data.componentId] <= 0) {
                console.log(`Local player component ${data.componentId} destroyed due to network damage`);
                player.ship.destroyComponent(data.componentId);
            }
        } else {
            // Apply damage to shields and health if no specific component was hit
            let damage = data.damage || 10;
            if (player.ship.shield > 0) {
                const shieldDamage = Math.min(damage, player.ship.shield);
                player.ship.shield -= shieldDamage;
                damage -= shieldDamage;
                player.ship.shield = Math.max(0, player.ship.shield);
                console.log(`Shield absorbed ${shieldDamage} damage, remaining shield: ${player.ship.shield}`);
            }
            if (damage > 0) {
                player.ship.totalHullHealth -= damage;
                player.ship.totalHullHealth = Math.max(0, player.ship.totalHullHealth);
                console.log(`Hull damage: ${damage}, remaining hull: ${player.ship.totalHullHealth}`);
            }

            // Check destruction conditions
            const mainHullDestroyed = !player.ship.componentHealth.main_body || player.ship.componentHealth.main_body <= 0;
            const leftWingDestroyed = !player.ship.componentHealth.left_wing || player.ship.componentHealth.left_wing <= 0;
            const rightWingDestroyed = !player.ship.componentHealth.right_wing || player.ship.componentHealth.right_wing <= 0;
            const bothWingsDestroyed = leftWingDestroyed && rightWingDestroyed;

            const isDestroyed = player.ship.totalHullHealth <= 0 || mainHullDestroyed || bothWingsDestroyed;

            if (isDestroyed && player.isAlive) {
                player.isAlive = false;
                console.log('You died! Press R to respawn.');
                // Hide the ship mesh
                player.ship.mesh.visible = false;
            }
        }

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
            playerObj.totalHullHealth = data.totalHullHealth || playerObj.totalHullHealth || 110;
            playerObj.componentHealth = data.componentHealth || playerObj.componentHealth || {
                main_body: 100,
                left_wing: 50,
                right_wing: 50
            };
            playerObj.isAlive = data.isAlive;

            if (!data.isAlive) {
                // Player died - hide the ship and create debris explosion for the entire ship
                playerObj.mesh.visible = false;
                if (playerObj.nameSprite) {
                    playerObj.nameSprite.visible = false;
                }
                console.log(`${playerObj.nameSprite.userData?.name || 'Player'} died!`);

                // Create debris explosion for entire ship destruction
                if (debrisManager && playerObj.mesh) {
                    // Collect all meshes from the player's ship
                    const shipMeshes = [];
                    playerObj.mesh.traverse((child) => {
                        if (child.isMesh) {
                            shipMeshes.push(child);
                        }
                    });

                    // Calculate center position for the explosion
                    let centerPosition = new THREE.Vector3();
                    if (shipMeshes.length > 0) {
                        shipMeshes.forEach(mesh => {
                            centerPosition.add(mesh.position);
                        });
                        centerPosition.divideScalar(shipMeshes.length);
                        // Transform to world position
                        centerPosition.applyMatrix4(playerObj.mesh.matrixWorld);
                    } else {
                        // Fallback to mesh position if no children
                        centerPosition.copy(playerObj.mesh.position);
                    }

                    // Create debris for the entire ship
                    debrisManager.createDebrisFromComponent(shipMeshes, centerPosition);
                    console.log(`Player ${playerObj.nameSprite?.userData?.name || 'Player'} ship converted to debris`);
                }
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
        // Local player respawned - reload the entire model to restore destroyed components
        player.isAlive = data.isAlive;

        // Remove the old mesh from scene if it exists
        if (player.ship.mesh && player.ship.mesh.parent) {
            player.ship.mesh.parent.remove(player.ship.mesh);
        }

        // Recreate the ship with a fresh model
        const shipType = data.shipType || myShipType;
        if (shipType === 'imperial-tie-fighter') {
            player.ship = new ImperialTieFighter(scene, world);
        } else {
            player.ship = new BaseShip(scene, world);
        }

        // Set initial stats after model loads (in the ship constructor callback)
        player.ship.health = data.health;
        player.ship.shield = data.shield;
        player.ship.componentHealth = {
            main_body: 100,
            left_wing: 50,
            right_wing: 50
        };

        player.position.set(data.x, data.y, data.z);
        player.quaternion.set(data.rotationX, data.rotationY, data.rotationZ, data.rotationW);

        // Wait for the model to load, then position it correctly
        const checkModelLoaded = () => {
            if (player.ship.modelLoaded) {
                player.ship.mesh.position.copy(player.position);
                player.ship.mesh.quaternion.copy(player.quaternion);
                player.ship.mesh.visible = true;
                console.log(`You respawned with a fresh ${shipType}!`);
            } else {
                setTimeout(checkModelLoaded, 50); // Check again in 50ms
            }
        };
        checkModelLoaded();
    } else {
        // Other player respawned - reload the entire model to restore destroyed components
        if (otherPlayers[String(data.playerId)]) {
            const playerObj = otherPlayers[String(data.playerId)];

            // Remove old model from scene
            if (playerObj.mesh && playerObj.mesh.parent) {
                playerObj.mesh.parent.remove(playerObj.mesh);
            }
            if (playerObj.nameSprite && playerObj.nameSprite.parent) {
                playerObj.nameSprite.parent.remove(playerObj.nameSprite);
            }

            // Remove from tracking
            delete otherPlayers[String(data.playerId)];

            // Respawn with fresh model
            spawnOtherPlayer(data);
        } else {
            // Player didn't exist, spawn them
            spawnOtherPlayer(data);
        }
    }
}

function handlePlayerComponentDestruction(data) {
    const playerId = String(data.playerId);
    const componentId = data.componentId;

    console.log(`Received component destruction: playerId=${playerId}, componentId=${componentId}`);

    if (playerId === String(myPlayerId)) {
        // Local player component destroyed - create debris
        console.log(`Local player component ${componentId} destroyed via network message`);
        if (player.ship.componentHealth[componentId] !== undefined) {
            player.ship.componentHealth[componentId] = 0;
            player.ship.destroyComponent(componentId);
            console.log(`Your ${componentId} was destroyed!`);
        }
    } else {
        // Other player component destroyed - create debris for the shooter
        const playerObj = otherPlayers[playerId];
        if (playerObj) {
            if (playerObj.componentHealth && playerObj.componentHealth[componentId] !== undefined) {
                playerObj.componentHealth[componentId] = 0;

                // Visually destroy the component for other players
                if (playerObj.mesh) {
                    try {
                        // Use direct children iteration instead of traverse to avoid issues
                        const meshesToRemove = [];

                        // Collect all children that match the component ID
                        function collectMeshes(obj) {
                            if (obj.children) {
                                obj.children.forEach(child => {
                                    if (child.isMesh && child.userData && child.userData.componentId === componentId) {
                                        meshesToRemove.push(child);
                                    }
                                    // Recursively check nested children
                                    collectMeshes(child);
                                });
                            }
                        }

                        collectMeshes(playerObj.mesh);

                        // Calculate center position for debris explosion
                        let centerPosition = new THREE.Vector3();
                        if (meshesToRemove.length > 0) {
                            meshesToRemove.forEach(mesh => {
                                centerPosition.add(mesh.position);
                            });
                            centerPosition.divideScalar(meshesToRemove.length);
                        }
   
                        // Remove all meshes for this component and create debris
                        meshesToRemove.forEach(mesh => {
                            console.log(`Removing component ${componentId} mesh "${mesh.name}" from other player ${playerObj.nameSprite?.userData?.name || 'Player'}`);
                            if (mesh.parent) {
                                mesh.parent.remove(mesh);
                            }
                        });
   
                        // Create debris explosion for the destroyed component
                        if (debrisManager) {
                            debrisManager.createDebrisFromComponent(meshesToRemove, centerPosition);
                            console.log(`Component ${componentId} from other player converted to debris`);
                        }

                        console.log(`Removed ${meshesToRemove.length} meshes for component ${componentId}`);
                    } catch (error) {
                        console.warn('Error removing component meshes:', error);
                    }
                }

                console.log(`${playerObj.nameSprite?.userData?.name || 'Player'}'s ${componentId} was destroyed!`);
            }
        }

        // Force debris creation on the shooter's side for enemy components
        // Since this is a component destruction message, it was likely an enemy component
        if (componentId && enemies.length > 0) {
            // Find any enemy that might have had this component destroyed
            enemies.forEach(enemy => {
                if (enemy.componentHealth && enemy.componentHealth[componentId] <= 0) {
                    // Force debris creation if the component is already destroyed
                    if (enemy.componentMeshes && enemy.componentMeshes[componentId] && enemy.componentMeshes[componentId].length > 0) {
                        console.log(`Forcing debris creation on shooter side for enemy component ${componentId}`);
                        // The component is already destroyed, but we need to create debris
                        // Since the component meshes are already removed, we need to recreate them temporarily
                        // This is a hack, but it should work for the debris effect
                        enemy.destroyComponent(componentId);
                    }
                }
            });
        }
    }
}

function handleEnemyComponentDestruction(data) {
    const enemyId = data.enemyId;
    const componentId = data.componentId;

    // Find the enemy and destroy the component
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].id === enemyId) {
            const enemy = enemies[i];
            if (enemy.componentHealth[componentId] !== undefined) {
                enemy.componentHealth[componentId] = 0;
                // Mark this as network damage to prevent duplicate network messages
                enemy.receivedNetworkDamage = true;
                enemy.destroyComponent(componentId);
                enemy.receivedNetworkDamage = false; // Reset flag
                console.log(`Enemy ${enemyId}'s ${componentId} was destroyed via network!`);
            } else {
                // Component might already be destroyed locally (shooter case)
                // Check if we have stored debris creation info for this component
                const debrisKey = `${enemyId}_${componentId}`;
                if (window.pendingDebrisCreations && window.pendingDebrisCreations[debrisKey]) {
                    const debrisInfo = window.pendingDebrisCreations[debrisKey];

                    // Mark as processed to prevent double processing
                    if (!debrisInfo.processed) {
                        console.log(`Network confirmation received for shooter-side debris: ${debrisKey}`);
                        debrisInfo.processed = true;

                        // Since debris was already created locally, we just mark it as confirmed
                        // Clean up stored info after a delay to prevent memory issues
                        setTimeout(() => {
                            if (window.pendingDebrisCreations && window.pendingDebrisCreations[debrisKey]) {
                                delete window.pendingDebrisCreations[debrisKey];
                            }
                        }, 1000); // Clean up after 1 second
                    }
                }
            }
            break;
        }
    }
}

// Force-create debris on the shooter's side when a component is destroyed
// This function is no longer needed as debris creation is handled directly in handleEnemyComponentDestruction
function handleEnemyComponentDestructionForShooter(data) {
    // Debris creation is now handled directly in handleEnemyComponentDestruction
}

function handleEnemyRespawn(enemyData) {
    console.log(`Handling enemy respawn for enemy ${enemyData.id} at position (${enemyData.x}, ${enemyData.y}, ${enemyData.z})`);

    // Check if enemy already exists (shouldn't in normal cases, but just in case)
    for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].id === enemyData.id) {
            // Clean up the enemy's resources before removing
            if (enemies[i].destroy) {
                enemies[i].destroy();
            }
            // If enemy already exists, remove it first
            scene.remove(enemies[i].mesh);
            enemies.splice(i, 1);
            break;
        }
    }

    // Create a new enemy at the respawned position using the dedicated respawn function
    spawnRespawnedEnemy(enemyData);
    console.log(`Enemy ${enemyData.id} respawned on client`);
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
    animationId = requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    // Always cap deltaTime to prevent issues when tabbing back in after being away
    const cappedDeltaTime = Math.min(deltaTime, 0.016); // Maximum ~16ms per frame (60 FPS)
    // Log if deltaTime is unusually large (can happen when tabbing back in after being away)
    if (deltaTime > 0.1) { // More than 100ms between frames
        console.log('Large deltaTime detected:', deltaTime, 'Using cappedDeltaTime:', cappedDeltaTime);
    }

    // Update bolts even when tabbed out to prevent shotgun effect
    const beforeUpdateNetworked = networkedBolts.length;
    const beforeUpdateLocal = player?.ship?.primaryWeapon?.getBolts()?.length || 0;
    updateBolts(cappedDeltaTime);
    const afterUpdateNetworked = networkedBolts.length;
    const afterUpdateLocal = player?.ship?.primaryWeapon?.getBolts()?.length || 0;

    if (window.DEBUG_TAB_OUT_BOLTS && (beforeUpdateNetworked !== afterUpdateNetworked || beforeUpdateLocal !== afterUpdateLocal)) {
        console.log(`[DEBUG] Bolt update: networked ${beforeUpdateNetworked}->${afterUpdateNetworked}, local ${beforeUpdateLocal}->${afterUpdateLocal}, tabHidden=${document.hidden}`);
    }

    // Only continue if the page is visible and not paused
    if (!document.hidden && !isPaused) {

        controls.update(cappedDeltaTime);
        player.update(controls, cappedDeltaTime);
        // Ship update is done here, which includes weapon updates
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

        // Update debris effects
        debrisManager.update(cappedDeltaTime);

        // Clean up dead enemies that are not meant to respawn (server handles respawning)
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].isDestroyed()) {
                // Clean up the enemy's resources before removing
                if (enemies[i].destroy) {
                    enemies[i].destroy();
                }
                // Remove from scene and array since server will handle respawn via enemyRespawned message
                scene.remove(enemies[i].mesh);
                enemies.splice(i, 1);
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

            // Collect all intersected objects for component-specific damage
            const hitComponents = {};

            // Debug logging for raycasting - only log when there are intersections

            let hitSomething = false;
            for (const intersect of intersects) {
                const hitObject = intersect.object;


                // Check if bolt hit the shooter's own ship
                // Only apply this check if it's not the owner's own bolt, or if the bolt is past the grace period
                if ((hitObject === player.ship.mesh || (hitObject.userData && hitObject.userData.isPlayer)) &&
                    !(bolt.ownerId === myPlayerId && bolt.age < 0.3)) { // Don't damage self during grace period
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
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        // Check if this hitObject is associated with this enemy
                        if (enemy.mesh === hitObject || hitObject.userData.enemyId === enemy.id) {
                            // Check if hit a specific component
                            let componentId = null;
                            if (hitObject.userData && hitObject.userData.componentId) {
                                componentId = hitObject.userData.componentId;
                            }

                            // Damage the enemy (with component-specific damage if applicable)
                            const destroyed = enemy.takeDamage(bolt.damage, componentId);

                            // Remove the bolt
                            player.ship.primaryWeapon.bolts.splice(i, 1);
                            if (bolt.mesh && bolt.mesh.parent) {
                                bolt.mesh.parent.remove(bolt.mesh);
                            }
                            hitSomething = true;

                            // If enemy is destroyed, notify server (server handles respawn)
                            if (destroyed) {
                                console.log(`Enemy ${enemy.id} destroyed! Notifying server.`);

                                // Send enemy destruction to server (server handles respawn)
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
                if (hitObject.userData && hitObject.userData.isPlayer && hitObject.userData.playerId !== myPlayerId) {
                    // Check if hit a specific component
                    let componentId = null;
                    if (hitObject.userData.componentId) {
                        componentId = hitObject.userData.componentId;
                    }

                    // Send damage to server for player-to-player hit (with component info)
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'playerHit',
                            attackerPlayerId: myPlayerId,
                            targetPlayerId: hitObject.userData.playerId,
                            damage: bolt.damage || 10,
                            componentId: componentId
                        }));
                    }

                    // Remove the bolt
                    player.ship.primaryWeapon.bolts.splice(i, 1);
                    if (bolt.mesh && bolt.mesh.parent) {
                        bolt.mesh.parent.remove(bolt.mesh);
                    }
                    hitSomething = true;
                    break;
                }

            }

            // If hit something, stop checking this bolt
            if (hitSomething) continue;
        }

        // Check networked bolts using raycasting - limit processing to prevent freezing
        const maxNetworkedBoltsToProcess = 10; // Reduced limit to prevent multiple hits
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


            let hitSomething = false;
            for (const intersect of intersects) {
                const hitObject = intersect.object;


                // Check if networked bolt hit the local player
                // Only apply this check if it's not the owner's own bolt, or if the bolt is past the grace period
                if ((hitObject === player.ship.mesh || (hitObject.userData && hitObject.userData.isPlayer)) &&
                    !(bolt.userData.ownerId === myPlayerId && bolt.userData.age < 0.2)) { // Don't damage self during grace period

                    // Check if this bolt has already hit this target
                    const targetKey = `player_${myPlayerId}`;
                    if (!bolt.userData.hitTargets.has(targetKey)) {
                        if (window.DEBUG_TAB_OUT_BOLTS) {
                            console.log(`[DEBUG] Networked bolt hit player's own ship - DAMAGE APPLIED`);
                        }
                        // Mark this target as hit by this bolt
                        bolt.userData.hitTargets.add(targetKey);

                        // Update the last shield damage time to prevent immediate regeneration
                        const currentTime = Date.now() / 1000; // Convert to seconds
                        player.ship.lastShieldDamageTime = currentTime;

                        // Send damage to server
                        if (window.DEBUG_TAB_OUT_BOLTS) {
                            console.log(`[DEBUG] Sending damage: networked bolt from player ${bolt.userData.ownerId} hit local player for 10 damage!`);
                        }
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'playerHit',
                                attackerPlayerId: bolt.userData.ownerId,
                                targetPlayerId: myPlayerId,
                                damage: 10
                            }));
                        }
                    }
                    // Remove the bolt immediately after collision to prevent multiple hits
                    if (bolt.parent) {
                        bolt.parent.remove(bolt);
                    }
                    networkedBolts.splice(i, 1);
                    if (window.DEBUG_TAB_OUT_BOLTS) {
                        console.log(`[DEBUG] Removed networked bolt after hitting player, remaining: ${networkedBolts.length}`);
                    }
                    hitSomething = true;
                    break;
                }

                // Check collision with enemies
                if (hitObject.userData && hitObject.userData.isEnemy) {
                    if (window.DEBUG_TAB_OUT_BOLTS) {
                        console.log(`[DEBUG] Networked bolt hit enemy with ID: ${hitObject.userData.enemyId}`);
                    }
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        // Check if this hitObject is associated with this enemy
                        if (enemy.mesh === hitObject || hitObject.userData.enemyId === enemy.id) {
                            if (window.DEBUG_TAB_OUT_BOLTS) {
                                console.log(`[DEBUG] Networked bolt hit enemy ${enemy.id} for 10 damage!`);
                            }

                            // Check if hit a specific component
                            let componentId = null;
                            if (hitObject.userData && hitObject.userData.componentId) {
                                componentId = hitObject.userData.componentId;
                                if (window.DEBUG_TAB_OUT_BOLTS) {
                                    console.log(`[DEBUG] Networked bolt hit specific component: ${componentId}`);
                                }
                            }

                            // Damage the enemy (with component-specific damage if applicable)
                            const destroyed = enemy.takeDamage(10, componentId); // Assuming damage 10 for networked bolts

                            // Remove the bolt immediately after collision to prevent multiple hits
                            if (bolt.parent) {
                                bolt.parent.remove(bolt);
                            }
                            networkedBolts.splice(i, 1);
                            if (window.DEBUG_TAB_OUT_BOLTS) {
                                console.log(`[DEBUG] Removed networked bolt after hitting enemy, remaining: ${networkedBolts.length}`);
                            }
                            hitSomething = true;

                            // If enemy is destroyed by networked bolt, notify server (server handles respawn)
                            if (destroyed) {
                                if (window.DEBUG_TAB_OUT_BOLTS) {
                                    console.log(`[DEBUG] Enemy ${enemy.id} destroyed by networked bolt!`);
                                }

                                // Send enemy destruction to server (server handles respawn)
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
            }

            // If hit something, stop checking this bolt
            if (hitSomething) continue;
        }

        composer.render();
    } else {
        // When paused or hidden, don't continue the animation loop
        // We'll restart it when the page becomes visible again
        isPaused = true;
    }
}

// Handle tab visibility changes properly
document.addEventListener('visibilitychange', () => {
    if (window.DEBUG_TAB_OUT_BOLTS) {
        console.log(`[DEBUG] Tab visibility change: hidden=${document.hidden}, paused=${isPaused}`);
    }

    if (!document.hidden) {
        // Reset the clock to avoid large deltaTime when resuming
        // Just call getDelta once to clear the accumulated time since the animation loop will handle the rest
        clock.getDelta();
        // Ensure we're not paused
        isPaused = false;
        // Make sure animation loop is running
        if (!animationId) {
            animate();
        }

        if (window.DEBUG_TAB_OUT_BOLTS) {
            console.log(`[DEBUG] Tab-in: networkedBolts=${networkedBolts.length}, playerBolts=${player?.ship?.primaryWeapon?.getBolts()?.length || 0}`);
        }

        // Sync game state on tab-in by cleaning up expired bolts and resetting timers
        syncGameStateOnTabIn();
    } else if (document.hidden) {
        if (window.DEBUG_TAB_OUT_BOLTS) {
            console.log(`[DEBUG] Tab-out: networkedBolts=${networkedBolts.length}, playerBolts=${player?.ship?.primaryWeapon?.getBolts()?.length || 0}`);
        }
        // Don't pause the animation loop completely - just mark as paused for game logic
        isPaused = true;
        // Animation loop continues to run for rendering and networked elements
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

// Sync game state when tabbing back in to prevent accumulation issues
function syncGameStateOnTabIn() {
    if (window.DEBUG_TAB_OUT_BOLTS) {
        console.log('[DEBUG] Syncing game state on tab-in');
        console.log(`[DEBUG] Before sync: networkedBolts=${networkedBolts.length}`);
    }

    // Clear ALL networked bolts to prevent shotgun effect when tabbing back in
    let clearedNetworked = 0;
    for (let i = networkedBolts.length - 1; i >= 0; i--) {
        const bolt = networkedBolts[i];
        scene.remove(bolt);
        networkedBolts.splice(i, 1);
        clearedNetworked++;
    }

    // Clear expired local bolts and reset weapon timer
    let expiredLocal = 0;
    if (player && player.ship && player.ship.primaryWeapon) {
        const shipBolts = player.ship.primaryWeapon.getBolts();
        for (let i = shipBolts.length - 1; i >= 0; i--) {
            const bolt = shipBolts[i];
            if (bolt.isDestroyed) {
                shipBolts.splice(i, 1);
                if (bolt.mesh && bolt.mesh.parent) {
                    bolt.mesh.parent.remove(bolt.mesh);
                }
                expiredLocal++;
            }
        }

        // Reset the weapon's firing timer to prevent immediate burst
        player.ship.primaryWeapon.fireTimer = 0;
    }

    if (window.DEBUG_TAB_OUT_BOLTS) {
        console.log(`[DEBUG] Tab-in sync results: clearedNetworked=${clearedNetworked}, expiredLocal=${expiredLocal}`);
        console.log(`[DEBUG] After sync: networkedBolts=${networkedBolts.length}, playerBolts=${player?.ship?.primaryWeapon?.getBolts()?.length || 0}`);
    }
}

// Separate function to update bolts even when tabbed out to prevent accumulation
function updateBolts(cappedDeltaTime) {
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

    // Update local bolts - only if player and ship exist
    if (player && player.ship && player.ship.primaryWeapon) {
        const shipBolts = player.ship.primaryWeapon.getBolts();
        shipBolts.forEach(bolt => {
            if (bolt.mesh) {
                bolt.update(cappedDeltaTime);
            }

            if (bolt.mesh && !scene.children.includes(bolt.mesh)) {
                bolt.mesh.userData = bolt.mesh.userData || {};
                bolt.mesh.userData.isBlasterBolt = true;
                bolt.mesh.userData.ownerId = bolt.ownerId;
                scene.add(bolt.mesh);
            }
        });

        // Clean up expired local bolts
        for (let i = scene.children.length - 1; i >= 0; i--) {
            const child = scene.children[i];
            if (child.userData && child.userData.isBlasterBolt) {
                const stillActive = shipBolts.some(bolt => bolt.mesh === child);
                if (!stillActive) {
                    scene.remove(child);
                }
            }
        }
    }
}