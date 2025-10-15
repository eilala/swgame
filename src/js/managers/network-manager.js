import * as THREE from 'three';

/**
 * Manages WebSocket connections and network message handling
 */
export default class NetworkManager {
    constructor() {
        this.ws = null;
        this.myPlayerId = null;
        this.myPlayerName = null;
        this.otherPlayers = {};
        this.enemies = [];
        this.networkedBolts = [];

        // Callbacks for game logic to handle network events
        this.callbacks = {
            onSpawn: null,
            onNewPlayer: null,
            onPlayerUpdate: null,
            onPlayerDisconnected: null,
            onPlayerRespawned: null,
            onFire: null,
            onEnemyDestroyed: null,
            onPlayerDamaged: null,
            onPlayerComponentDestroyed: null,
            onEnemyComponentDestroyed: null
        };
    }

    /**
     * Connect to the server
     */
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        this.ws.onopen = () => {
            console.log('Connected to server');
        };

        this.ws.onmessage = (event) => {
            this.handleMessage(event);
        };

        this.ws.onclose = () => {
            console.log('Disconnected from server');
        };

        // Make globally available for other scripts that need it
        window.ws = this.ws;
        window.myPlayerId = this.myPlayerId;
    }

    /**
     * Handle incoming network messages
     */
    handleMessage(event) {
        const message = JSON.parse(event.data);

        switch (message.type) {
            case 'spawn':
                this.handleSpawn(message);
                break;
            case 'newPlayer':
                this.handleNewPlayer(message);
                break;
            case 'playerUpdate':
                this.handlePlayerUpdate(message);
                break;
            case 'playerDisconnected':
                this.handlePlayerDisconnected(message);
                break;
            case 'playerRespawned':
                this.handlePlayerRespawned(message);
                break;
            case 'fire':
                this.handleFire(message);
                break;
            case 'enemyDestroyed':
                this.handleEnemyDestroyed(message);
                break;
            case 'playerDamaged':
                this.handlePlayerDamaged(message);
                break;
            case 'playerComponentDestroyed':
                this.handlePlayerComponentDestroyed(message);
                break;
            case 'enemyComponentDestroyed':
                this.handleEnemyComponentDestroyed(message);
                break;
        }
    }

    /**
     * Send position updates to server
     */
    sendPosition(x, y, z, rotationX, rotationY, rotationZ, rotationW) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'position',
                x, y, z, rotationX, rotationY, rotationZ, rotationW
            }));
        }
    }

    /**
     * Send fire event to server
     */
    sendFire(direction, position) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'fire',
                direction: { x: direction.x, y: direction.y, z: direction.z },
                position: { x: position.x, y: position.y, z: position.z }
            }));
        }
    }

    /**
     * Send player hit event to server
     */
    sendPlayerHit(attackerPlayerId, targetPlayerId, damage, componentId = null) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'playerHit',
                attackerPlayerId,
                targetPlayerId,
                damage,
                componentId
            }));
        }
    }

    /**
     * Send enemy destruction to server
     */
    sendEnemyDestroyed(enemyId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'enemyDestroyed',
                enemyId
            }));
        }
    }

    /**
     * Send respawn request
     */
    sendRespawn() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'respawn'
            }));
        }
    }

    // Message handlers
    handleSpawn(message) {
        this.myPlayerId = message.playerId;
        window.myPlayerId = message.playerId;
        this.myPlayerName = message.playerName;
        console.log(`You are ${this.myPlayerName}`);

        // Handle existing players and enemies
        message.players.forEach(otherPlayer => {
            if (otherPlayer.id !== this.myPlayerId) {
                if (this.callbacks.onNewPlayer) {
                    this.callbacks.onNewPlayer(otherPlayer);
                }
            }
        });

        message.enemies.forEach(enemyData => {
            if (this.callbacks.onSpawn) {
                this.callbacks.onSpawn('enemy', enemyData);
            }
        });

        if (this.callbacks.onSpawn) {
            this.callbacks.onSpawn('player', message);
        }
    }

    handleNewPlayer(message) {
        if (this.callbacks.onNewPlayer) {
            this.callbacks.onNewPlayer({ ...message, name: message.playerName });
        }
    }

    handlePlayerUpdate(message) {
        if (this.callbacks.onPlayerUpdate) {
            this.callbacks.onPlayerUpdate(message);
        }
    }

    handlePlayerDisconnected(message) {
        if (this.callbacks.onPlayerDisconnected) {
            this.callbacks.onPlayerDisconnected(message.playerId);
        }
    }

    handlePlayerRespawned(message) {
        if (this.callbacks.onPlayerRespawned) {
            this.callbacks.onPlayerRespawned(message);
        }
    }

    handleFire(message) {
        if (this.callbacks.onFire) {
            this.callbacks.onFire(message);
        }
    }

    handleEnemyDestroyed(message) {
        if (this.callbacks.onEnemyDestroyed) {
            this.callbacks.onEnemyDestroyed(message.enemyId);
        }
    }

    handlePlayerDamaged(message) {
        if (this.callbacks.onPlayerDamaged) {
            this.callbacks.onPlayerDamaged(message);
        }
    }

    handlePlayerComponentDestroyed(message) {
        if (this.callbacks.onPlayerComponentDestroyed) {
            this.callbacks.onPlayerComponentDestroyed(message);
        }
    }

    handleEnemyComponentDestroyed(message) {
        if (this.callbacks.onEnemyComponentDestroyed) {
            this.callbacks.onEnemyComponentDestroyed(message);
        }
    }

    /**
     * Set callback for network events
     */
    setCallback(eventType, callback) {
        this.callbacks[eventType] = callback;
    }

    /**
     * Get current player ID
     */
    getMyPlayerId() {
        return this.myPlayerId;
    }

    /**
     * Get other players
     */
    getOtherPlayers() {
        return this.otherPlayers;
    }

    /**
     * Get enemies
     */
    getEnemies() {
        return this.enemies;
    }

    /**
     * Get networked bolts
     */
    getNetworkedBolts() {
        return this.networkedBolts;
    }

    /**
     * Add networked bolt
     */
    addNetworkedBolt(bolt) {
        this.networkedBolts.push(bolt);
    }

    /**
     * Remove networked bolt
     */
    removeNetworkedBolt(bolt) {
        const index = this.networkedBolts.indexOf(bolt);
        if (index > -1) {
            this.networkedBolts.splice(index, 1);
        }
    }

    /**
     * Add other player
     */
    addOtherPlayer(playerId, playerData) {
        this.otherPlayers[playerId] = playerData;
    }

    /**
     * Remove other player
     */
    removeOtherPlayer(playerId) {
        delete this.otherPlayers[playerId];
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
    removeEnemy(enemy) {
        const index = this.enemies.indexOf(enemy);
        if (index > -1) {
            this.enemies.splice(index, 1);
        }
    }
}