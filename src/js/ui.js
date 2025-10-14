export default class UI {
    constructor(player) {
        this.player = player;
        this.createCrosshair();
        this.createSpeedOverlay();
        this.createShieldOverlay();
        this.createHullOverlay();
        this.createEnergyOverlay();
        this.createWeaponOverlay();
    }

    createCrosshair() {
        const crosshair = document.createElement('div');
        crosshair.classList.add('crosshair');
        document.body.appendChild(crosshair);
    }

    createSpeedOverlay() {
        this.speedElement = document.createElement('div');
        this.speedElement.classList.add('ui-overlay', 'speed-overlay');
        document.body.appendChild(this.speedElement);
    }

    createShieldOverlay() {
        this.shieldElement = document.createElement('div');
        this.shieldElement.classList.add('ui-overlay', 'shield-overlay');
        document.body.appendChild(this.shieldElement);
    }

    createHullOverlay() {
        this.hullElement = document.createElement('div');
        this.hullElement.classList.add('ui-overlay', 'hull-overlay');
        document.body.appendChild(this.hullElement);
    }

    createEnergyOverlay() {
        this.energyElement = document.createElement('div');
        this.energyElement.classList.add('ui-overlay', 'energy-overlay');
        document.body.appendChild(this.energyElement);
    }
    
    createWeaponOverlay() {
        this.weaponElement = document.createElement('div');
        this.weaponElement.classList.add('ui-overlay', 'weapon-overlay');
        document.body.appendChild(this.weaponElement);
    }

    update() {
        const speed = this.player.velocity.length();
        this.speedElement.innerText = `Speed: ${speed.toFixed(2)}`;

        const shield = this.player.ship.shield;
        this.shieldElement.innerText = `Shield: ${shield}`;

        const hull = this.player.ship.hull;
        this.hullElement.innerText = `Hull: ${hull}`;

        const energy = this.player.ship.energy;
        this.energyElement.innerText = `Energy: ${energy}`;
        
        // Update weapon status
        const weapon = this.player.ship.primaryWeapon;
        if (weapon) {
            // Calculate time until next shot is available
            const currentTime = Date.now() / 1000;
            const timeSinceLastShot = currentTime - weapon.lastShotTime;
            const timeUntilNextShot = Math.max(0, weapon.fireRate - timeSinceLastShot);
            
            this.weaponElement.innerText = `Weapon: ${timeUntilNextShot.toFixed(2)}s until next shot`;
        }
    }
}