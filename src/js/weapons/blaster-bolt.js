import * as THREE from 'three';

export default class BlasterBolt {
    constructor(position, direction, shipVelocity, damage = 10) {
        // Create the visual representation of the blaster bolt
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x00aff, // Blue color for the blaster bolt
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
        this.velocity = this.direction.clone().multiplyScalar(30).add(shipVelocity); // Speed of 30 units per second + ship velocity
        this.damage = damage;
        this.lifetime = 1; // Bolt will be destroyed after 1 second (travels 30 units at speed 30)
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