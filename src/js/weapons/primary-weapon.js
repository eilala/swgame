import * as THREE from 'three';
import BlasterBolt from './blaster-bolt.js';

export default class PrimaryWeapon {
    constructor(ship, energyCost = 5, damage = 10, fireRate = 0.2) {
        this.ship = ship; // Reference to the ship that owns this weapon
        this.energyCost = energyCost; // Amount of energy drained per shot
        this.damage = damage; // Damage dealt by each blaster bolt
        this.fireRate = fireRate; // Time in seconds between shots (1/fireRate = shots per second)
        this.lastShotTime = 0; // Time when the last shot was fired
        this.bolts = []; // Array to hold active blaster bolts
    }
    
    canFire(currentTime) {
        // Check if enough time has passed since the last shot
        return (currentTime - this.lastShotTime) >= this.fireRate;
    }
    
    fire(player) {
        const currentTime = Date.now() / 1000; // Convert to seconds
        
        // Check if we can fire and if the ship has enough energy
        if (this.canFire(currentTime) && this.ship.energy >= this.energyCost) {
            // Drain energy from the ship
            this.ship.energy -= this.energyCost;
            
            // Update the ship's energy action time to prevent immediate regeneration
            this.ship.lastEnergyActionTime = currentTime;
            
            // Set the time of the last shot
            this.lastShotTime = currentTime;
            
            // Calculate the firing position (in front of the ship)
            const firingOffset = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion).multiplyScalar(1.5);
            const firingPosition = player.position.clone().add(firingOffset);
            
            // Calculate the direction the bolt should travel (forward from the ship)
            const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
            
            // Create a new blaster bolt
            const bolt = new BlasterBolt(firingPosition, direction, this.damage);
            
            // Add the bolt to our array of active bolts
            this.bolts.push(bolt);
            
            // Return true to indicate successful firing
            return true;
        }
        
        // Return false if we can't fire
        return false;
    }
    
    update(deltaTime) {
        // Update all active bolts and remove those that have exceeded their lifetime
        this.bolts = this.bolts.filter(bolt => !bolt.update(deltaTime));
    }
    
    getBolts() {
        return this.bolts;
    }
}