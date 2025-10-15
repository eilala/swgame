import EventEmitter from '../core/event-emitter.js';

/**
 * Manages all game entities (players, enemies, projectiles, etc.)
 */
export default class EntityManager extends EventEmitter {
    constructor(gameState) {
        super();
        this.gameState = gameState;
        this.entities = new Map();
        this.entityIdCounter = 0;
        this.updatableEntities = [];
    }

    /**
     * Generate unique entity ID
     */
    generateId() {
        return `entity_${++this.entityIdCounter}`;
    }

    /**
     * Register an entity
     * @param {string} id - Entity ID
     * @param {Object} entity - Entity object
     * @param {string} type - Entity type (player, enemy, bolt, etc.)
     */
    registerEntity(id, entity, type) {
        this.entities.set(id, {
            entity: entity,
            type: type,
            id: id
        });

        // Add to updatable list if entity has update method
        if (typeof entity.update === 'function') {
            this.updatableEntities.push(entity);
        }

        this.emit('entityRegistered', { id, entity, type });
    }

    /**
     * Unregister an entity
     * @param {string} id - Entity ID
     */
    unregisterEntity(id) {
        const entityData = this.entities.get(id);
        if (entityData) {
            const { entity, type } = entityData;

            // Remove from updatable list
            const index = this.updatableEntities.indexOf(entity);
            if (index > -1) {
                this.updatableEntities.splice(index, 1);
            }

            // Remove from entities map
            this.entities.delete(id);

            this.emit('entityUnregistered', { id, entity, type });
        }
    }

    /**
     * Get entity by ID
     * @param {string} id - Entity ID
     * @returns {Object|null} Entity object or null if not found
     */
    getEntity(id) {
        const entityData = this.entities.get(id);
        return entityData ? entityData.entity : null;
    }

    /**
     * Get entities by type
     * @param {string} type - Entity type
     * @returns {Array} Array of entities of the specified type
     */
    getEntitiesByType(type) {
        const result = [];
        for (const [id, entityData] of this.entities) {
            if (entityData.type === type) {
                result.push(entityData.entity);
            }
        }
        return result;
    }

    /**
     * Get all entities
     * @returns {Map} Map of all entities
     */
    getAllEntities() {
        return new Map(this.entities);
    }

    /**
     * Update all updatable entities
     * @param {number} deltaTime - Time elapsed since last update
     */
    update(deltaTime) {
        this.updatableEntities.forEach(entity => {
            try {
                entity.update(deltaTime);
            } catch (error) {
                console.error('Error updating entity:', error);
                // Could emit error event here
            }
        });
    }

    /**
     * Clean up destroyed entities
     */
    cleanup() {
        const entitiesToRemove = [];

        // Find entities that are destroyed
        for (const [id, entityData] of this.entities) {
            const { entity, type } = entityData;

            // Check if entity has isDestroyed method and is destroyed
            if (typeof entity.isDestroyed === 'function' && entity.isDestroyed()) {
                entitiesToRemove.push(id);
            }

            // Special handling for different entity types
            if (type === 'enemy' && (!entity.mesh || !entity.mesh.parent)) {
                entitiesToRemove.push(id);
            }

            if (type === 'bolt' && (!entity.mesh || entity.isDestroyed)) {
                entitiesToRemove.push(id);
            }
        }

        // Remove destroyed entities
        entitiesToRemove.forEach(id => {
            this.unregisterEntity(id);
        });

        if (entitiesToRemove.length > 0) {
            this.emit('entitiesCleaned', { removedIds: entitiesToRemove });
        }
    }

    /**
     * Create and register a player entity
     * @param {Player} player - Player instance
     * @returns {string} Entity ID
     */
    createPlayer(player) {
        const id = this.generateId();
        this.registerEntity(id, player, 'player');
        return id;
    }

    /**
     * Create and register an enemy entity
     * @param {BaseEnemy} enemy - Enemy instance
     * @returns {string} Entity ID
     */
    createEnemy(enemy) {
        const id = enemy.id || this.generateId();
        this.registerEntity(id, enemy, 'enemy');
        return id;
    }

    /**
     * Create and register a bolt entity
     * @param {BlasterBolt} bolt - Bolt instance
     * @returns {string} Entity ID
     */
    createBolt(bolt) {
        const id = this.generateId();
        this.registerEntity(id, bolt, 'bolt');
        return id;
    }

    /**
     * Create and register other player entity
     * @param {Object} playerData - Player data
     * @returns {string} Entity ID
     */
    createOtherPlayer(playerData) {
        const id = `player_${playerData.id}`;
        // Note: Other players are stored in gameState, not as full entities here
        // This is just for tracking purposes
        this.registerEntity(id, playerData, 'other_player');
        return id;
    }

    /**
     * Find entity by mesh reference
     * @param {THREE.Mesh} mesh - Mesh to find entity for
     * @returns {Object|null} Entity data or null if not found
     */
    findEntityByMesh(mesh) {
        for (const [id, entityData] of this.entities) {
            const { entity } = entityData;
            if (entity.mesh === mesh) {
                return entityData;
            }
        }
        return null;
    }

    /**
     * Get entity count by type
     * @param {string} type - Entity type
     * @returns {number} Count of entities of the specified type
     */
    getEntityCount(type = null) {
        if (type) {
            return this.getEntitiesByType(type).length;
        }
        return this.entities.size;
    }

    /**
     * Get statistics about entities
     * @returns {Object} Entity statistics
     */
    getStats() {
        const stats = {
            total: this.entities.size,
            byType: {}
        };

        for (const [id, entityData] of this.entities) {
            const { type } = entityData;
            stats.byType[type] = (stats.byType[type] || 0) + 1;
        }

        return stats;
    }
}