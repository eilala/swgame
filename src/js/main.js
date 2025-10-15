import * as THREE from 'three';
import Player from './player/player.js';
import { loadRandomMap } from './maps/map-loader.js';
import Controls from './controls.js';
import PlayerCamera from './camera/player-camera.js';
import UI from './ui.js';
import BaseEnemy from './enemies/base-enemy.js';

// WebSocket connection
const ws = new WebSocket('ws://localhost:8081');
window.ws = ws; // Make ws globally available for weapon firing
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

// Enemies array to hold active enemies
// Networked bolts array
const networkedBolts = [];
const enemies = [];

// Load Map stars background only
const sceneBackground = new THREE.Scene();
loadRandomMap(sceneBackground);
scene.background = sceneBackground.background;
scene.add(...sceneBackground.children.filter(child => child.type === 'Points'));

// Player
const player = new Player();
scene.add(player.ship.mesh);

// WebSocket event handlers
ws.onopen = () => {
    console.log('Connected to server');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'spawn') {
        myPlayerId = message.playerId;
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
        spawnOtherPlayer(message);
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
    if (!playerId || playerId === 'null' || playerId === 'undefined') {
        console.log('Invalid playerId, skipping spawn', playerData);
        return;
    }

    if (otherPlayers[playerId]) {
        return;
    }

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

function updateOtherPlayer(data) {
    const playerId = String(data.playerId);
    const playerObj = otherPlayers[playerId];
    if (playerObj) {
        playerObj.mesh.position.set(data.x, data.y, data.z);
        playerObj.mesh.quaternion.set(data.rotationX, data.rotationY, data.rotationZ, data.rotationW || 1);

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
        delete otherPlayers[String(playerId)];
    }
}

function spawnEnemy(enemyData) {
    const enemy = new BaseEnemy(new THREE.Vector3(enemyData.x, enemyData.y, enemyData.z), 50, 25, enemyData.id);
    scene.add(enemy.mesh);
    enemies.push(enemy);
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

    boltMesh.userData = { direction: data.direction, isNetworkedBolt: true, speed: 60, lifetime: 1, age: 0 };
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
        if (!data.isAlive) {
            // Handle player death locally
            console.log('You died! Press R to respawn.');
            // Could add death effects, respawn timer, etc.
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
                console.log(`${playerObj.nameSprite.userData?.name || 'Player'} died!`);
            } else {
                playerObj.mesh.visible = true;
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
        player.position.set(data.x, data.y, data.z);
        player.quaternion.set(data.rotationX, data.rotationY, data.rotationZ, data.rotationW);
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

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    controls.update(deltaTime);
    player.update(controls, deltaTime);
    player.ship.update(player, deltaTime);
    playerCamera.update();
    ui.update();

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
    enemies.forEach(enemy => enemy.update(deltaTime));

    // Update networked bolts
    for (let i = networkedBolts.length - 1; i >= 0; i--) {
        const bolt = networkedBolts[i];
        const direction = new THREE.Vector3(bolt.userData.direction.x, bolt.userData.direction.y, bolt.userData.direction.z).normalize();
        bolt.position.add(direction.clone().multiplyScalar(bolt.userData.speed * deltaTime));

        bolt.userData.age += deltaTime;
        if (bolt.userData.age >= bolt.userData.lifetime) {
            scene.remove(bolt);
            networkedBolts.splice(i, 1);
        }
    }
    
    // Get active blaster bolts from the ship's weapon
    const shipBolts = player.ship.primaryWeapon.getBolts();
    
    // Add any new bolts to the scene if they're not already added
    shipBolts.forEach(bolt => {
        if (!scene.children.includes(bolt.mesh)) {
            // Mark the mesh as a blaster bolt for easy identification later
            bolt.mesh.userData = bolt.mesh.userData || {};
            bolt.mesh.userData.isBlasterBolt = true;
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

    // Collision detection: Check for collisions between blaster bolts and targets
    // Check local bolts
    for (let i = shipBolts.length - 1; i >= 0; i--) {
        const bolt = shipBolts[i];

        // Check collision with enemies first
        let hitSomething = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (checkCollision(bolt.mesh, enemy.mesh)) {
                // Damage the enemy
                const destroyed = enemy.takeDamage(bolt.damage);

                // Remove the bolt
                player.ship.primaryWeapon.bolts.splice(i, 1);
                scene.remove(bolt.mesh);
                hitSomething = true;

                // If enemy is destroyed, remove it and notify other players
                if (destroyed) {
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
                break; // Bolt can only hit one target
            }
        }

        // If didn't hit enemy, check collision with other players
        if (!hitSomething) {
            for (const [playerId, playerObj] of Object.entries(otherPlayers)) {
                if (checkCollision(bolt.mesh, playerObj.mesh) && playerObj.isAlive) {
                    console.log(`Local bolt hit player ${playerObj.nameSprite.userData?.name || 'Player'} (ID: ${playerId}) for ${bolt.damage} damage!`);
                    // Damage the player
                    player.ship.primaryWeapon.bolts.splice(i, 1);
                    scene.remove(bolt.mesh);
                    hitSomething = true;

                    // Send player damage to server (don't hit own player)
                    const targetId = parseInt(playerId);
                    if (targetId !== myPlayerId) {
                        console.log(`Sending playerHit message: targetPlayerId=${targetId}, damage=${bolt.damage}`);
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'playerHit',
                                targetPlayerId: targetId,
                                damage: bolt.damage
                            }));
                        }
                    }
                    break; // Bolt can only hit one target
                }
            }
        }
    }

    // Check networked bolts
    for (let i = networkedBolts.length - 1; i >= 0; i--) {
        const bolt = networkedBolts[i];

        // Check collision with enemies
        let hitSomething = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (checkCollision(bolt, enemy.mesh)) {
                // Damage the enemy
                const destroyed = enemy.takeDamage(10); // Assuming damage 10 for networked bolts

                // Remove the bolt
                scene.remove(bolt);
                networkedBolts.splice(i, 1);
                hitSomething = true;

                // If enemy is destroyed, remove it and notify other players
                if (destroyed) {
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
                break; // Bolt can only hit one target
            }
        }

        // If didn't hit enemy, check collision with other players
        if (!hitSomething) {
            for (const [playerId, playerObj] of Object.entries(otherPlayers)) {
                if (checkCollision(bolt, playerObj.mesh) && playerObj.isAlive) {
                    console.log(`Networked bolt hit player ${playerObj.nameSprite.userData?.name || 'Player'} (ID: ${playerId}) for 10 damage!`);
                    // Damage the player
                    scene.remove(bolt);
                    networkedBolts.splice(i, 1);
                    hitSomething = true;

                    // Send player damage to server (don't hit own player)
                    const targetId = parseInt(playerId);
                    if (targetId !== myPlayerId) {
                        console.log(`Sending networked playerHit message: targetPlayerId=${targetId}, damage=10`);
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'playerHit',
                                targetPlayerId: targetId,
                                damage: 10 // Assuming damage 10 for networked bolts
                            }));
                        }
                    }
                    break; // Bolt can only hit one target
                }
            }
        }
    }

    renderer.render(scene, camera);
}

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

animate();