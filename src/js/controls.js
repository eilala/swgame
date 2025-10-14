import * as THREE from 'three';

export default class Controls {
    constructor(domElement, player) {
        this.keys = {};
        this.mouseDelta = { x: 0, y: 0 };
        this.player = player;

        domElement.addEventListener('click', () => {
            domElement.requestPointerLock();
        });

        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                // Primary weapon fire event
                if (this.player.ship) {
                    this.player.ship.isFiringPrimary = true;
                }
            }
            if (e.button === 2) {
                console.log('Secondary Weapon Fired');
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                // Stop primary weapon fire event
                if (this.player.ship) {
                    this.player.ship.isFiringPrimary = false;
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === domElement) {
                this.mouseDelta.x += e.movementX || 0;
                this.mouseDelta.y += e.movementY || 0;
            }
        });
    }

    update(deltaTime) {
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.mouseDelta.x * 0.002);
        const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.mouseDelta.y * 0.002);

        let roll = 0;
        if (this.keys['KeyA']) {
            roll = 1.5;
        } else if (this.keys['KeyD']) {
            roll = -1.5;
        }
        const rollQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, roll * deltaTime, 'XYZ'));

        // Apply all rotations locally
        this.player.quaternion.multiply(yaw);
        this.player.quaternion.multiply(pitch);
        this.player.quaternion.multiply(rollQuaternion);
        this.player.quaternion.normalize();

        this.resetMouseDelta();
    }

    resetMouseDelta() {
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
    }
}