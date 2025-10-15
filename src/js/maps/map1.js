import * as THREE from 'three';
import BaseEnemy from '../enemies/base-enemy.js';

export default function(scene) {
    scene.background = new THREE.Color(0x000000);

    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 });

    const starVertices = [];
    for (let i = 0; i < 5000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 2000;
        starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // Spawn an enemy cube at position (10, 0, 0)
    const enemy = new BaseEnemy(new THREE.Vector3(10, 0, 0));
    scene.add(enemy.mesh);

    // Return enemies array for the main game loop
    return [enemy];
}