export default class UI {
    constructor(player) {
        this.player = player;
        this.createCrosshair();
        this.createSpeedOverlay();
        this.createShieldOverlay();
        this.createHullOverlay();
        this.createEnergyOverlay();
        this.createWeaponOverlay();
        this.createComponentHealthOverlay();
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

    createComponentHealthOverlay() {
        this.componentHealthElement = document.createElement('div');
        this.componentHealthElement.classList.add('ui-overlay', 'component-health-overlay');
        document.body.appendChild(this.componentHealthElement);
    }

    update() {
        const speed = this.player.velocity.length();
        this.speedElement.innerText = `Speed: ${Math.round(speed * 100)} (${Math.round(speed)})`;

        if (this.player.ship) {
            const shield = this.player.ship.shield;
            this.shieldElement.innerText = `Shield: ${Math.round(shield)}`;

            const hull = this.player.ship.hull;
            this.hullElement.innerText = `Hull: ${Math.round(hull)}`;

            const totalHull = this.player.ship.totalHullHealth || 100;
            const energy = this.player.ship.energy;
            this.energyElement.innerText = `Energy: ${Math.round(energy)}`;

            // Update component health display
            const componentHealth = this.player.ship.componentHealth || {};
            const mainBodyHealth = componentHealth.main_body || 100;
            const leftWingHealth = componentHealth.left_wing || 50;
            const rightWingHealth = componentHealth.right_wing || 50;

            this.componentHealthElement.innerText =
                `Total Hull: ${Math.round(totalHull)}/100 | ` +
                `Main: ${Math.round(mainBodyHealth)} | ` +
                `Left Wing: ${Math.round(leftWingHealth)} | ` +
                `Right Wing: ${Math.round(rightWingHealth)}`;

            // Update weapon status
            const weapon = this.player.ship.primaryWeapon;
            if (weapon) {
                // Calculate time until next shot is available
                const currentTime = Date.now() / 1000;
                const timeSinceLastShot = currentTime - weapon.lastShotTime;
                const timeUntilNextShot = Math.max(0, weapon.fireRate - timeSinceLastShot);

                this.weaponElement.innerText = `Weapon: ${Math.round(timeUntilNextShot)}s until next shot`;
            } else {
                this.weaponElement.innerText = 'Weapon: Loading...';
            }
        } else {
            this.shieldElement.innerText = 'Shield: --';
            this.hullElement.innerText = 'Hull: --';
            this.energyElement.innerText = 'Energy: --';
            this.componentHealthElement.innerText = 'Systems: Initializing...';
            this.weaponElement.innerText = 'Weapon: --';
        }
    }
}
