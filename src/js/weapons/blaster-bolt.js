import * as THREE from 'three';

export default class BlasterBolt {
    constructor(position, direction, damage = 10) {
        // Create the visual representation of the blaster bolt
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00aff, // Blue color for the blaster bolt
            emissive: 0x0066ff // Make it glow
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Orient the cylinder to face the direction of travel
        this.mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1), // Default cylinder orientation
            direction.clone().normalize()
        );
        
        // Position the bolt at the given position
        this.mesh.position.copy(position);
        
        // Physics properties
        this.direction = direction.clone().normalize();
        this.velocity = this.direction.clone().multiplyScalar(50); // Speed of 30 units per second
        this.damage = damage;
        this.lifetime = 2; // Bolt will be destroyed after 1 second (travels 30 units at speed 30)
        this.age = 0;
        
        // Rotate the cylinder so it's aligned with the direction of travel
        this.mesh.lookAt(
            this.mesh.position.clone().add(this.direction)
        );
        
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