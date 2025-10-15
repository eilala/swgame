import * as THREE from 'three';
import BaseEnemy from '../enemies/base-enemy.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

    // Load and add ISD model
    const isdLoader = new GLTFLoader();
    isdLoader.load(
        'src/assets/models/isd/ISD.glb',
        (gltf) => {
            const isdMesh = gltf.scene;
            isdMesh.scale.set(0.5, 0.5, 0.5);
            isdMesh.position.set(200, 0, 0);

            // Traverse the model and set material properties for visibility
            isdMesh.traverse((child) => {
                if (child.isMesh) {
                    // Ensure materials have proper settings for lighting
                    if (child.material) {
                        // If material is an array, iterate through materials
                        if (Array.isArray(child.material)) {
                            child.material.forEach((mat) => {
                                if (mat) {
                                    mat.needsUpdate = true;
                                }
                            });
                        } else {
                            child.material.needsUpdate = true;
                        }
                    }
                }
            });

            // Add to scene after loading
            scene.add(isdMesh);
            console.log('ISD model added to scene');
        },
        undefined,
        (error) => {
            console.error('An error happened loading the ISD GLTF model:', error);
        }
    );

    // Return enemies array for the main game loop (empty since enemies are server-managed)
    return [];
}
