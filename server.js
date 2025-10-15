const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8081 });

let players = {};
let playerIdCounter = 0;
let enemies = {};

const playerNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

// Store player quaternions for better sync

// Initialize enemies (hardcoded for map1 for now)
const dummyEnemy = { id: 'dummy', x: 0, y: 0, z: -10 };
enemies[dummyEnemy.id] = dummyEnemy;

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
        shield: 100, maxShield: 100,
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
                shield: 100, maxShield: 100,
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
                player.shield = player.maxShield;
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
                delete enemies[message.enemyId];
            }
            // Broadcast enemy destruction to all players
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'enemyDestroyed',
                        enemyId: message.enemyId
                    }));
                }
            });
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
                // Check if hit a specific component
                let componentId = message.componentId || null;
                let componentDestroyed = false;

                if (componentId && targetPlayer.componentHealth[componentId] !== undefined) {
                    // Apply damage to the specific component
                    targetPlayer.componentHealth[componentId] -= message.damage;
                    targetPlayer.componentHealth[componentId] = Math.max(0, targetPlayer.componentHealth[componentId]);
                    console.log(`Component ${componentId} health: ${targetPlayer.componentHealth[componentId]}`);

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

                // Apply damage to shield first, then health (only if no component was hit or component wasn't destroyed)
                if (!componentId || !componentDestroyed) {
                    let damage = message.damage;
                    if (targetPlayer.shield > 0) {
                        const shieldDamage = Math.min(damage, targetPlayer.shield);
                        targetPlayer.shield -= shieldDamage;
                        damage -= shieldDamage;
                        console.log(`Shield damage: ${shieldDamage}, remaining shield: ${targetPlayer.shield}`);
                    }
                    if (damage > 0) {
                        targetPlayer.health -= damage;
                        console.log(`Health damage: ${damage}, remaining health: ${targetPlayer.health}`);
                    }

                    // Check if player died
                    if (targetPlayer.health <= 0) {
                        targetPlayer.isAlive = false;
                        targetPlayer.health = 0;
                        console.log(`Player ${targetPlayer.name} died!`);
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