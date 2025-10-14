import * as THREE from 'three';

export default class BlasterBolt {
    constructor(position, direction, shipVelocity, damage = 10) {
        // Create the visual representation of the blaster bolt
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00aaff, // Blue color for the blaster bolt
            emissive: 0x0066ff // Make it glow
        });
        
        this.mesh = new THREE.Mesh(geometry, material);

        // Orient the cylinder to face the direction of travel
        this.mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), // Default cylinder orientation (Y-axis)
            direction.clone().normalize()
        );
        
        // Position the bolt at the given position
        this.mesh.position.copy(position);
        
        // Physics properties
        this.direction = direction.clone().normalize();
        // Calculate bullet velocity: base speed in firing direction + ship's current velocity
        const baseVelocity = new THREE.Vector3().copy(this.direction).multiplyScalar(60); // Increased from 30 to 60 for better separation from player speed
        this.velocity = new THREE.Vector3().copy(shipVelocity).add(baseVelocity);
        this.damage = damage;
        this.lifetime = 1; // Bolt will be destroyed after 1 second (travels 60 units at speed 60)
        this.age = 0;
        
        // Keep the visual representation always facing forward (no additional rotation)
        // The physics direction and visual representation are now separate
        
        // Mark the mesh as a blaster bolt for easy identification
        this.mesh.userData = this.mesh.userData || {};
        this.mesh.userData.isBlasterBolt = true;
    }
    
    update(deltaTime) {
        // Move the bolt based on its velocity
        this.mesh.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Update the age of the bolt
        this.age += deltaTime;
        
        // Return true if the bolt should be destroyed (lifetime exceeded)
        return this.age >= this.lifetime;
    }
}