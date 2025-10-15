/**
 * Common damage and component health system for ships and enemies
 */
export default class DamageableComponent {
    constructor(totalHealth = 100, componentHealth = {}) {
        this.totalHullHealth = totalHealth;
        this.maxTotalHullHealth = totalHealth;
        this.componentHealth = { ...componentHealth };
        this.componentMeshes = {};
        this.componentIds = Object.keys(componentHealth);
    }

    /**
     * Take damage and distribute it between shields, components, and hull
     * @param {number} damage - Amount of damage to apply
     * @param {string} componentId - Specific component to damage (optional)
     * @param {number} shieldAbsorption - Current shield value (0 if no shields)
     * @returns {boolean} True if entity is destroyed
     */
    takeDamage(damage, componentId = null, shieldAbsorption = 0) {
        console.log(`takeDamage called: damage=${damage}, componentId=${componentId}, shieldAbsorption=${shieldAbsorption}`);

        let remainingDamage = damage;

        // FIRST: Apply damage to shields (shields absorb damage before anything else)
        if (shieldAbsorption > 0) {
            const shieldDamage = Math.min(remainingDamage, shieldAbsorption);
            remainingDamage -= shieldDamage;
            console.log(`Shield absorbed ${shieldDamage} damage, remaining damage: ${remainingDamage}`);
        }

        // SECOND: If shields are depleted and we have remaining damage, apply to components and hull
        if (remainingDamage > 0) {
            // Always apply damage to total hull health
            const totalHullDamage = Math.min(remainingDamage, this.totalHullHealth);
            this.totalHullHealth -= totalHullDamage;
            remainingDamage -= totalHullDamage;
            this.totalHullHealth = Math.max(0, this.totalHullHealth);

            // Apply damage to specific component if provided
            if (componentId && this.componentHealth[componentId] !== undefined) {
                const componentDamage = Math.min(totalHullDamage, this.componentHealth[componentId]);
                this.componentHealth[componentId] -= componentDamage;
                this.componentHealth[componentId] = Math.max(0, this.componentHealth[componentId]);

                console.log(`Component ${componentId} damaged for ${componentDamage}, remaining health: ${this.componentHealth[componentId]}`);

                // Check if component should be destroyed
                if (this.componentHealth[componentId] <= 0) {
                    console.log(`Component ${componentId} destroyed!`);
                    this.destroyComponent(componentId);
                }
            }

            // Apply any remaining damage to legacy systems (for backward compatibility)
            if (remainingDamage > 0) {
                console.log(`Legacy damage: ${remainingDamage}`);
            }

            console.log(`Total hull health: ${this.totalHullHealth}/${this.maxTotalHullHealth}`);
        }

        // Check destruction conditions
        return this.isDestroyed();
    }

    /**
     * Check if the entity should be considered destroyed
     * @returns {boolean} True if destroyed
     */
    isDestroyed() {
        // Total hull health ≤ 0
        if (this.totalHullHealth <= 0) {
            return true;
        }

        // Main hull component destroyed
        if (this.componentHealth.main_body !== undefined && this.componentHealth.main_body <= 0) {
            return true;
        }

        // Both wings destroyed (if applicable)
        const hasWings = this.componentHealth.left_wing !== undefined && this.componentHealth.right_wing !== undefined;
        if (hasWings) {
            const leftWingDestroyed = this.componentHealth.left_wing <= 0;
            const rightWingDestroyed = this.componentHealth.right_wing <= 0;
            if (leftWingDestroyed && rightWingDestroyed) {
                return true;
            }
        }

        return false;
    }

    /**
     * Destroy a specific component
     * @param {string} componentId - ID of component to destroy
     */
    destroyComponent(componentId) {
        if (this.componentMeshes[componentId]) {
            const meshes = this.componentMeshes[componentId];

            // Remove all meshes belonging to this component
            meshes.forEach(mesh => {
                if (mesh.parent) {
                    mesh.parent.remove(mesh);
                    console.log(`Component ${componentId} mesh "${mesh.name}" destroyed and removed`);
                }
            });

            // Remove from tracking
            delete this.componentHealth[componentId];
            delete this.componentMeshes[componentId];

            console.log(`Component ${componentId} fully destroyed`);
        }
    }

    /**
     * Assign a mesh to a component
     * @param {THREE.Mesh} mesh - The mesh to assign
     * @param {string} componentId - Component ID
     */
    assignMeshToComponent(mesh, componentId) {
        // Initialize component health if not already done
        if (!this.componentHealth[componentId]) {
            // Assign default health values for different components
            switch (componentId) {
                case 'main_body':
                    this.componentHealth[componentId] = this.maxTotalHullHealth;
                    break;
                case 'left_wing':
                case 'right_wing':
                    this.componentHealth[componentId] = this.maxTotalHullHealth * 0.5; // Wings are 50% of main hull
                    break;
                default:
                    this.componentHealth[componentId] = this.maxTotalHullHealth * 0.5;
            }
            this.componentMeshes[componentId] = [];
        }

        // Track all meshes belonging to this component
        this.componentMeshes[componentId].push(mesh);
        mesh.userData.componentId = componentId;

        console.log(`Assigned mesh "${mesh.name}" to component "${componentId}" with health ${this.componentHealth[componentId]}`);
    }

    /**
     * Get health of a specific component
     * @param {string} componentId - Component ID
     * @returns {number} Component health
     */
    getComponentHealth(componentId) {
        return this.componentHealth[componentId] || 0;
    }

    /**
     * Set health of a specific component
     * @param {string} componentId - Component ID
     * @param {number} health - New health value
     */
    setComponentHealth(componentId, health) {
        if (this.componentHealth[componentId] !== undefined) {
            this.componentHealth[componentId] = Math.max(0, health);
        }
    }

    /**
     * Get all component health values
     * @returns {Object} Component health object
     */
    getAllComponentHealth() {
        return { ...this.componentHealth };
    }

    /**
     * Reset component health to default values
     */
    resetComponentHealth() {
        this.totalHullHealth = this.maxTotalHullHealth;

        // Reset all components to their default values
        this.componentIds.forEach(componentId => {
            switch (componentId) {
                case 'main_body':
                    this.componentHealth[componentId] = this.maxTotalHullHealth;
                    break;
                case 'left_wing':
                case 'right_wing':
                    this.componentHealth[componentId] = this.maxTotalHullHealth * 0.5;
                    break;
                default:
                    this.componentHealth[componentId] = this.maxTotalHullHealth * 0.5;
            }
        });

        console.log('Component health reset to defaults');
    }

    /**
     * Get total hull health
     * @returns {number} Total hull health
     */
    getTotalHullHealth() {
        return this.totalHullHealth;
    }

    /**
     * Set total hull health
     * @param {number} health - New total hull health
     */
    setTotalHullHealth(health) {
        this.totalHullHealth = Math.max(0, health);
    }

    /**
     * Get max total hull health
     * @returns {number} Max total hull health
     */
    getMaxTotalHullHealth() {
        return this.maxTotalHullHealth;
    }
}