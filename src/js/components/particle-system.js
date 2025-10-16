import * as THREE from 'three';

/**
 * Simple particle system using sprite-based particles (visible dots)
 * Similar to the white dots in your map system
 */
export default class ParticleSystem {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.particles = [];
        this.maxParticles = options.maxParticles || 100;

        // Create canvas for particle texture (white dot)
        this.canvas = document.createElement('canvas');
        this.canvas.width = 32;
        this.canvas.height = 32;
        const ctx = this.canvas.getContext('2d');

        // Draw white circle with slight glow
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();

        // Add outer glow
        ctx.beginPath();
        ctx.arc(16, 16, 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Create texture
        this.texture = new THREE.CanvasTexture(this.canvas);

        console.log('ParticleSystem initialized with sprite-based particles');
    }

    /**
     * Create hit effect particles
     * @param {THREE.Vector3} position - Impact position
     * @param {THREE.Vector3} direction - Direction the bolt was traveling (will reverse for particles)
     * @param {THREE.Color|string|number} color - Particle color (THREE.Color, hex string, or number)
     * @param {number} count - Number of particles (default: 8)
     * @param {number} speed - Particle speed (default: 5)
     * @param {number} spread - Random spread angle in radians (default: PI/4)
     */
    createHitEffect(position, direction, color, count = 12, speed = 8, spread = Math.PI / 3) {
        // Convert color to THREE.Color if needed
        let particleColor;
        if (color instanceof THREE.Color) {
            particleColor = color;
        } else if (typeof color === 'string' || typeof color === 'number') {
            particleColor = new THREE.Color(color);
        } else {
            particleColor = new THREE.Color(0xffffff); // Default white
        }

        const reverseDirection = direction.clone().negate().normalize();

        for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
            // Create sprite
            const spriteMaterial = new THREE.SpriteMaterial({
                map: this.texture,
                color: particleColor,
                transparent: true,
                blending: THREE.AdditiveBlending,
                opacity: 1.0
            });
            const sprite = new THREE.Sprite(spriteMaterial);

            // Position at impact point
            sprite.position.copy(position);

            // Size (very small and subtle)
            sprite.scale.set(0.05, 0.05, 0.05); // 0.05 units = very small

            // Calculate velocity
            const velocity = this.calculateParticleVelocity(reverseDirection, speed * 3, spread);

            // Create particle data
            const particle = {
                sprite: sprite,
                velocity: velocity,
                lifetime: 0,
                maxLifetime: 0.5 + Math.random() * 0.2, // 0.5-0.7 seconds
                initialScale: sprite.scale.x
            };

            this.particles.push(particle);
            this.scene.add(sprite);
        }

        console.log('Created hit effect with', count, 'sprite particles at', position, 'total active:', this.particles.length);
    }

    /**
     * Calculate particle velocity with spread
     */
    calculateParticleVelocity(baseDirection, speed, spread) {
        // Random rotation within spread angle
        const randomAngle = (Math.random() - 0.5) * 2 * spread;
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(baseDirection, up).normalize();
        if (right.length() === 0) {
            right.set(1, 0, 0); // Fallback if up and direction are parallel
        }

        const rotationMatrix = new THREE.Matrix4().makeRotationAxis(right, randomAngle);
        const spreadDirection = baseDirection.clone().applyMatrix4(rotationMatrix);

        // Add some random variation
        spreadDirection.x += (Math.random() - 0.5) * 0.3;
        spreadDirection.y += (Math.random() - 0.5) * 0.3;
        spreadDirection.z += (Math.random() - 0.5) * 0.3;
        spreadDirection.normalize();

        return spreadDirection.multiplyScalar(speed);
    }

    /**
     * Update particles
     * @param {number} deltaTime - Time elapsed since last update
     */
    update(deltaTime) {
        if (this.particles.length > 0) {
            console.log('Updating', this.particles.length, 'sprite particles with deltaTime:', deltaTime);
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.lifetime += deltaTime;

            if (particle.lifetime >= particle.maxLifetime) {
                // Remove particle
                this.scene.remove(particle.sprite);
                this.particles.splice(i, 1);
                continue;
            }

            // Update position
            particle.sprite.position.add(particle.velocity.clone().multiplyScalar(deltaTime));

            // Update scale (fade out)
            const scaleProgress = particle.lifetime / particle.maxLifetime;
            const currentScale = particle.initialScale * (1 - scaleProgress * 0.5); // Fade to half size
            particle.sprite.scale.set(currentScale, currentScale, currentScale);

            // Update opacity
            particle.sprite.material.opacity = 1 - scaleProgress;
        }
    }

    /**
     * Get particle count
     */
    getParticleCount() {
        return this.particles.length;
    }

    /**
     * Clear all particles
     */
    clear() {
        this.particles.forEach(particle => {
            this.scene.remove(particle.sprite);
        });
        this.particles = [];
    }

    /**
     * Destroy the particle system
     */
    destroy() {
        this.clear();
        if (this.texture) {
            this.texture.dispose();
        }
    }
}