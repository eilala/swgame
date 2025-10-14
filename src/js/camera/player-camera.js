import * as THREE from 'three';

export default class PlayerCamera {
    constructor(camera, player) {
        this.camera = camera;
        this.player = player;

        this.offset = new THREE.Vector3(0, 2, 5);
    }

    update() {
        // Calculate the desired camera position with offset
        const offset = this.offset.clone().applyQuaternion(this.player.quaternion);
        const cameraPosition = this.player.position.clone().add(offset);

        // Copy player's state to the camera
        this.camera.position.copy(cameraPosition);
        this.camera.quaternion.copy(this.player.quaternion);
    }
}