import * as THREE from 'three';

/**
 * UI element that displays health, shield, and component status above target dummies/enemies
 */
export default class TargetDummyUI {
    constructor(targetEntity) {
        this.targetEntity = targetEntity;
        this.scene = window.scene; // Use global scene reference
        
        // Create canvas for the UI element
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 160;
        this.context = this.canvas.getContext('2d');
        
        // Create texture from canvas
        this.texture = new THREE.CanvasTexture(this.canvas);
        
        // Create sprite material with the texture
        this.spriteMaterial = new THREE.SpriteMaterial({ 
            map: this.texture,
            transparent: true,
            depthWrite: false // Allow overlapping without depth conflicts
        });
        
        // Create sprite
        this.sprite = new THREE.Sprite(this.spriteMaterial);
        
        // Position above the target entity
        this.updatePosition();
        
        // Add to scene
        this.scene.add(this.sprite);
        
        // Update the display immediately
        this.update();
    }
    
    /**
     * Update the UI display with current target status
     */
    update() {
        if (!this.targetEntity) return;
        
        // Clear canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set up drawing context
        this.context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.context.fillStyle = 'white';
        this.context.font = 'Bold 24px Arial';
        this.context.textAlign = 'center';
        
        // Draw title
        this.context.fillText('TARGET STATUS', this.canvas.width / 2, 30);
        
        // Get shield value (if available)
        const shield = this.targetEntity.shield !== undefined ? this.targetEntity.shield : 0;
        const maxShield = this.targetEntity.maxShield !== undefined ? this.targetEntity.maxShield : 0;
        
        // Get hull/health values
        const hull = this.targetEntity.totalHullHealth !== undefined ? this.targetEntity.totalHullHealth : 
                     this.targetEntity.health !== undefined ? this.targetEntity.health : 0;
        const maxHull = this.targetEntity.maxTotalHullHealth !== undefined ? this.targetEntity.maxTotalHullHealth : 
                        this.targetEntity.maxHealth !== undefined ? this.targetEntity.maxHealth : 100;
        
        // Draw shield status
        if (maxShield > 0) {
            // Set color based on shield percentage
            const shieldPercentage = shield / maxShield;
            if (shieldPercentage > 0.5) {
                this.context.fillStyle = '#4FC3F7'; // Blue if shields > 50%
            } else if (shieldPercentage > 0.2) {
                this.context.fillStyle = '#FFF176'; // Yellow if shields 20-50%
            } else {
                this.context.fillStyle = '#E57373'; // Red if shields < 20%
            }
            this.context.font = '20px Arial';
            this.context.fillText(`SHIELDS: ${Math.round(shield)}/${maxShield}`, this.canvas.width / 2, 60);
        } else {
            // If no shields, just show the hull status in a larger area
            // Set color based on hull percentage
            const hullPercentage = hull / maxHull;
            if (hullPercentage > 0.5) {
                this.context.fillStyle = '#81C784'; // Green if hull > 50%
            } else if (hullPercentage > 0.2) {
                this.context.fillStyle = '#FFF176'; // Yellow if hull 20-50%
            } else {
                this.context.fillStyle = '#E57373'; // Red if hull < 20%
            }
            this.context.font = '20px Arial';
            this.context.fillText(`HULL: ${Math.round(hull)}/${maxHull}`, this.canvas.width / 2, 60);
        }
        
        // Draw hull status if shields are present
        if (maxShield > 0) {
            // Set color based on hull percentage
            const hullPercentage = hull / maxHull;
            if (hullPercentage > 0.5) {
                this.context.fillStyle = '#81C784'; // Green if hull > 50%
            } else if (hullPercentage > 0.2) {
                this.context.fillStyle = '#FFF176'; // Yellow if hull 20-50%
            } else {
                this.context.fillStyle = '#E57373'; // Red if hull < 20%
            }
            this.context.font = '20px Arial';
            this.context.fillText(`HULL: ${Math.round(hull)}/${maxHull}`, this.canvas.width / 2, 85);
        }
        
        // Draw component status if available
        if (this.targetEntity.componentHealth) {
            let yPos = maxShield > 0 ? 105 : 80; // Adjust Y position based on whether shields are shown
            this.context.fillStyle = 'white';
            this.context.font = '16px Arial';
            
            // Show main body status
            if (this.targetEntity.componentHealth.main_body !== undefined) {
                const mainBodyHealth = this.targetEntity.componentHealth.main_body || 0;
                const mainBodyMax = 100; // Default max for main body
                const mainPercentage = mainBodyHealth / mainBodyMax;
                
                // Set color based on health percentage
                if (mainPercentage > 0.5) {
                    this.context.fillStyle = '#81C784'; // Green if > 50%
                } else if (mainPercentage > 0.2) {
                    this.context.fillStyle = '#FFF176'; // Yellow if 20-50%
                } else {
                    this.context.fillStyle = '#E57373'; // Red if < 20%
                }
                
                this.context.fillText(`MAIN: ${Math.round(mainBodyHealth)}/${mainBodyMax}`, this.canvas.width / 2, yPos);
                yPos += 20;
            }
            
            // Show left wing status
            if (this.targetEntity.componentHealth.left_wing !== undefined) {
                const leftWingHealth = this.targetEntity.componentHealth.left_wing || 0;
                const leftWingMax = 50; // Default max for wings
                const leftPercentage = leftWingHealth / leftWingMax;
                
                // Set color based on health percentage
                if (leftPercentage > 0.5) {
                    this.context.fillStyle = '#81C784'; // Green if > 50%
                } else if (leftPercentage > 0.2) {
                    this.context.fillStyle = '#FFF176'; // Yellow if 20-50%
                } else {
                    this.context.fillStyle = '#E57373'; // Red if < 20%
                }
                
                this.context.fillText(`L-WING: ${Math.round(leftWingHealth)}/${leftWingMax}`, this.canvas.width / 2, yPos);
                yPos += 20;
            }
            
            // Show right wing status
            if (this.targetEntity.componentHealth.right_wing !== undefined) {
                const rightWingHealth = this.targetEntity.componentHealth.right_wing || 0;
                const rightWingMax = 50; // Default max for wings
                const rightPercentage = rightWingHealth / rightWingMax;
                
                // Set color based on health percentage
                if (rightPercentage > 0.5) {
                    this.context.fillStyle = '#81C784'; // Green if > 50%
                } else if (rightPercentage > 0.2) {
                    this.context.fillStyle = '#FFF176'; // Yellow if 20-50%
                } else {
                    this.context.fillStyle = '#E57373'; // Red if < 20%
                }
                
                this.context.fillText(`R-WING: ${Math.round(rightWingHealth)}/${rightWingMax}`, this.canvas.width / 2, yPos);
            }
        }
        
        // Reset fill style to white for any future text
        this.context.fillStyle = 'white';
        
        // Update texture
        this.texture.needsUpdate = true;
    }
    
    /**
     * Update the position of the UI element to stay above the target
     */
    updatePosition() {
        if (!this.targetEntity || !this.targetEntity.mesh) return;
        
        // Get the bounding box of the target to position above it
        const box = new THREE.Box3().setFromObject(this.targetEntity.mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Position the sprite above the target
        this.sprite.position.set(
            center.x, 
            center.y + size.y / 2 + 2, // 2 units above the top of the bounding box
            center.z
        );
        
        // Make the sprite always face the camera
        // The camera object in main.js is available as window.mainCamera
        if (window.mainCamera && window.mainCamera.position) {
            try {
                this.sprite.lookAt(window.mainCamera.position);
            } catch (e) {
                // If lookAt fails (e.g., if position is not a valid Vector3), skip it
                console.warn("Could not orient target dummy UI to camera, using default orientation");
            }
        }
    }
    
    /**
     * Remove the UI element from the scene
     */
    destroy() {
        if (this.scene && this.sprite) {
            this.scene.remove(this.sprite);
        }
        // Clean up resources
        this.spriteMaterial.dispose();
        this.texture.dispose();
    }
}