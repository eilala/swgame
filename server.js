const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });

let players = {};
let playerIdCounter = 0;
let enemies = {};

const playerNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

// Respawn time in milliseconds (5 seconds)
const ENEMY_RESPAWN_TIME = 5000;

// Store original enemy configurations for respawning
const originalEnemies = {
    'dummy': { id: 'dummy', x: 0, y: 0, z: -10 }
};

// Initialize enemies with original configurations
Object.keys(originalEnemies).forEach(enemyId => {
    enemies[enemyId] = { ...originalEnemies[enemyId] };
});

console.log('Initialized enemies:', enemies);

// Store player quaternions for better sync

console.log('WebSocket server started on port 8081');

wss.on('connection', (ws) => {
    const playerId = playerIdCounter++;
    const playerName = playerNames[playerId % playerNames.length];
    console.log(`Assigning name "${playerName}" to player ${playerId}`);
    players[playerId] = {
        ws,
        id: playerId,
        name: playerName,
        x: 0, y: 0, z: 0,
        rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
        health: 100, maxHealth: 100,
        shield: 10, maxShield: 10,
        componentHealth: {
            main_body: 100,
            left_wing: 50,
            right_wing: 50
        },
        isAlive: true
    };

    console.log(`Player ${playerId} (${playerName}) connected`);

    // Send initial spawn message to the new player
    ws.send(JSON.stringify({
        type: 'spawn',
        playerId: playerId,
        playerName: playerName,
        players: Object.keys(players).map(id => ({
            id: parseInt(id),
            name: players[id].name,
            x: players[id].x, y: players[id].y, z: players[id].z,
            rotationX: players[id].rotationX, rotationY: players[id].rotationY, rotationZ: players[id].rotationZ, rotationW: players[id].rotationW,
            health: players[id].health, maxHealth: players[id].maxHealth,
            shield: players[id].shield, maxShield: players[id].maxShield,
            componentHealth: players[id].componentHealth,
            isAlive: players[id].isAlive
        })),
        enemies: Object.values(enemies)
    }));

    // Broadcast new player to all other players
    wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'newPlayer',
                playerId: playerId,
                playerName: playerName,
                x: 0, y: 0, z: 0,
                rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
                health: 100, maxHealth: 100,
                shield: 10, maxShield: 10,
                componentHealth: {
                    main_body: 100,
                    left_wing: 50,
                    right_wing: 50
                },
                isAlive: true
            }));
        }
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'position') {
            players[playerId].x = message.x;
            players[playerId].y = message.y;
            players[playerId].z = message.z;
            players[playerId].rotationX = message.rotationX;
            players[playerId].rotationY = message.rotationY;
            players[playerId].rotationZ = message.rotationZ;
            players[playerId].rotationW = message.rotationW;

            // Broadcast position to all other players
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'playerUpdate',
                        playerId: playerId,
                        playerName: players[playerId].name,
                        x: message.x, y: message.y, z: message.z,
                        rotationX: message.rotationX, rotationY: message.rotationY, rotationZ: message.rotationZ, rotationW: message.rotationW,
                        health: players[playerId].health, maxHealth: players[playerId].maxHealth,
                        shield: players[playerId].shield, maxShield: players[playerId].maxShield,
                        isAlive: players[playerId].isAlive
                    }));
                }
            });
        } else if (message.type === 'fire') {
            // Broadcast fire event to all players except sender
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'fire',
                        playerId: playerId,
                        direction: message.direction,
                        position: message.position
                    }));
                }
            });
        } else if (message.type === 'respawn') {
            // Handle player respawn
            const player = players[playerId];
            if (player && !player.isAlive) {
                // Reset player stats
                player.health = player.maxHealth;
                player.shield = 10; // Reset to 10 shields, not maxShield
                player.componentHealth = {
                    main_body: 100,
                    left_wing: 50,
                    right_wing: 50
                };
                player.isAlive = true;
                player.x = 0; // Reset to spawn position
                player.y = 0;
                player.z = 0;
                player.rotationX = 0;
                player.rotationY = 0;
                player.rotationZ = 0;
                player.rotationW = 1;

                console.log(`Player ${player.name} respawned!`);

                // Broadcast respawn to all clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'playerRespawned',
                            playerId: playerId,
                            name: player.name,
                            x: player.x, y: player.y, z: player.z,
                            rotationX: player.rotationX, rotationY: player.rotationY, rotationZ: player.rotationZ, rotationW: player.rotationW,
                            health: player.health, maxHealth: player.maxHealth,
                            shield: player.shield, maxShield: player.maxShield,
                            componentHealth: player.componentHealth,
                            isAlive: player.isAlive
                        }));
                    }
                });
            }
        } else if (message.type === 'enemyDestroyed') {
            // Remove enemy from server's enemies list
            if (enemies[message.enemyId]) {
                // Store the destroyed enemy's original position for respawn
                const destroyedEnemy = { ...enemies[message.enemyId] };
                delete enemies[message.enemyId];
                
                // Broadcast enemy destruction to all players
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'enemyDestroyed',
                            enemyId: message.enemyId
                        }));
                    }
                });
                
                // Schedule enemy respawn after configured time
                setTimeout(() => {
                    // Check if this enemy should respawn (exists in original enemies)
                    if (originalEnemies[destroyedEnemy.id]) {
                        // Respawn the enemy at its original position
                        enemies[destroyedEnemy.id] = { ...originalEnemies[destroyedEnemy.id] };
                        console.log(`Enemy ${destroyedEnemy.id} respawned at position (${originalEnemies[destroyedEnemy.id].x}, ${originalEnemies[destroyedEnemy.id].y}, ${originalEnemies[destroyedEnemy.id].z})`);
                        
                        // Broadcast enemy respawn to all players
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'enemyRespawned',
                                    enemy: { ...originalEnemies[destroyedEnemy.id] }
                                }));
                            }
                        });
                    }
                }, ENEMY_RESPAWN_TIME); // Configurable respawn time
            }
        } else if (message.type === 'playerHit') {
            // Handle player damage from another player's bullet
            const targetPlayer = players[message.targetPlayerId];
            const attackerPlayer = players[message.attackerPlayerId];
            console.log(`Player ${attackerPlayer ? attackerPlayer.name : 'Unknown'} (ID: ${message.attackerPlayerId}) hit player ${targetPlayer ? targetPlayer.name : 'Unknown'} (ID: ${message.targetPlayerId}) for ${message.damage} damage`);
            // Prevent self-damage
            if (message.targetPlayerId === message.attackerPlayerId) {
                console.log('Player tried to damage themselves, ignoring');
                return;
            }
            if (targetPlayer && targetPlayer.isAlive) {
                let remainingDamage = message.damage;
                let componentDestroyed = false;

                // FIRST: Apply damage to shields (shields absorb damage before anything else)
                if (targetPlayer.shield > 0) {
                    const shieldDamage = Math.min(remainingDamage, targetPlayer.shield);
                    targetPlayer.shield -= shieldDamage;
                    remainingDamage -= shieldDamage;
                    targetPlayer.shield = Math.max(0, targetPlayer.shield);
                    console.log(`Shield absorbed ${shieldDamage} damage, remaining shield: ${targetPlayer.shield}`);
                }

                // SECOND: If shields are depleted and we have remaining damage, apply to components and health
                if (remainingDamage > 0) {
                    // Check if hit a specific component
                    let componentId = message.componentId || null;

                    if (componentId && targetPlayer.componentHealth[componentId] !== undefined) {
                            // Apply damage to the specific component
                            const componentDamage = Math.min(remainingDamage, targetPlayer.componentHealth[componentId]);
                            targetPlayer.componentHealth[componentId] -= componentDamage;
                            targetPlayer.componentHealth[componentId] = Math.max(0, targetPlayer.componentHealth[componentId]);
                            remainingDamage -= componentDamage;
    
                            // Also apply damage to total hull health when component is damaged
                            const hullDamage = componentDamage;
                            targetPlayer.health -= hullDamage;
                            targetPlayer.health = Math.max(0, targetPlayer.health);
    
                            console.log(`Component ${componentId} damaged for ${componentDamage}, remaining component health: ${targetPlayer.componentHealth[componentId]}, remaining hull health: ${targetPlayer.health}`);
    
                            // Check if component should be destroyed
                            if (targetPlayer.componentHealth[componentId] <= 0) {
                                componentDestroyed = true;
                                console.log(`Player ${targetPlayer.name}'s ${componentId} was destroyed!`);
    
                                // Broadcast component destruction to all clients
                                wss.clients.forEach(client => {
                                    if (client.readyState === WebSocket.OPEN) {
                                        client.send(JSON.stringify({
                                            type: 'playerComponentDestroyed',
                                            playerId: message.targetPlayerId,
                                            componentId: componentId
                                        }));
                                    }
                                });
                            }
                    }

                    // Apply any remaining damage to health
                    if (remainingDamage > 0) {
                        targetPlayer.health -= remainingDamage;
                        targetPlayer.health = Math.max(0, targetPlayer.health);
                        console.log(`Health damage: ${remainingDamage}, remaining health: ${targetPlayer.health}`);

                        // Check if player died
                        if (targetPlayer.health <= 0) {
                            targetPlayer.isAlive = false;
                            console.log(`Player ${targetPlayer.name} died!`);
                        }
                    }
                }

                // Broadcast player damage to all clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'playerDamaged',
                            playerId: message.targetPlayerId,
                            health: targetPlayer.health,
                            shield: targetPlayer.shield,
                            componentHealth: targetPlayer.componentHealth,
                            isAlive: targetPlayer.isAlive
                        }));
                    }
                });
            } else {
                console.log(`Target player ${targetPlayer ? targetPlayer.name : 'unknown'} (ID: ${message.targetPlayerId}) is not alive or doesn't exist`);
            }
        }
    });

    ws.on('close', () => {
        const player = players[playerId];
        console.log(`Player ${playerId} (${player ? player.name : 'Unknown'}) disconnected`);
        delete players[playerId];

        // Notify all players about the disconnected player
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'playerDisconnected',
                    playerId: playerId
                }));
            }
        });
    });
});