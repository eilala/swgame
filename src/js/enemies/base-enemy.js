import * as THREE from 'three';

export default class BaseEnemy {
    constructor(position = new THREE.Vector3(0, 0, 0), health = 50, shield = 25, id = null) {
        // Create the visual representation of the enemy
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(geometry, material);

        // Position the enemy
        this.mesh.position.copy(position);

        // Stats
        this.health = health;
        this.maxHealth = health;
        this.shield = shield;
        this.maxShield = shield;

        // Unique ID for networked synchronization
        this.id = id || Math.random().toString(36).substr(2, 9);

        // Mark the mesh as an enemy for easy identification
        this.mesh.userData = this.mesh.userData || {};
        this.mesh.userData.isEnemy = true;
        this.mesh.userData.enemyId = this.id;
    }

    update(deltaTime) {
        // Basic update logic - can be overridden by subclasses
        // For now, enemies just sit there
    }

    takeDamage(damage) {
        // First, damage the shield
        if (this.shield > 0) {
            const shieldDamage = Math.min(damage, this.shield);
            this.shield -= shieldDamage;
            damage -= shieldDamage;
        }

        // Then damage health if shield is depleted
        if (damage > 0) {
            this.health -= damage;
        }

        // Return true if enemy is destroyed
        return this.health <= 0;
    }

    isDestroyed() {
        return this.health <= 0;
    }
}