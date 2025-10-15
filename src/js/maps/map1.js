import * as THREE from 'three';
import BaseEnemy from '../enemies/base-enemy.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d';
import { Map1Config } from '../config/maps/map1-config.js';

export default function(scene, world = null, staticObjects = null) {
    scene.background = new THREE.Color(Map1Config.BACKGROUND_COLOR);

    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: Map1Config.STAR_SIZE });

    const starVertices = [];
    for (let i = 0; i < Map1Config.STAR_COUNT; i++) {
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
        '/assets/models/isd/ISD.glb',
        (gltf) => {
            const isdMesh = gltf.scene;
            isdMesh.scale.set(Map1Config.ISD_SCALE, Map1Config.ISD_SCALE, Map1Config.ISD_SCALE);
            isdMesh.position.set(Map1Config.ISD_POSITION.x, Map1Config.ISD_POSITION.y, Map1Config.ISD_POSITION.z);

            // Mark the main ISD mesh for collision detection
            isdMesh.userData = isdMesh.userData || {};
            isdMesh.userData.isStaticObject = true;
            isdMesh.userData.isISD = true;

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

                    // Mark all child meshes as ISD parts for collision detection
                    child.userData = child.userData || {};
                    child.userData.isStaticObject = true;
                    child.userData.isISD = true;

                    // Create physics colliders for each mesh in the ISD model
                    if (world) {
                        // Get the world matrix to compute accurate collider position
                        const worldMatrix = child.matrixWorld;
                        const position = new THREE.Vector3();
                        const quaternion = new THREE.Quaternion();
                        const scale = new THREE.Vector3();
                        worldMatrix.decompose(position, quaternion, scale);

                        // Create a static rigid body for the collider
                        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
                        const rigidBody = world.createRigidBody(rigidBodyDesc);

                        // Set the position and rotation of the rigid body
                        rigidBody.setTranslation(position, true);
                        rigidBody.setRotation(quaternion, true);

                        // Get the geometry of the mesh to create accurate colliders
                        const geometry = child.geometry;
                        if (geometry) {
                            // For complex models, create compound colliders from individual triangles
                            const positions = geometry.attributes.position;
                            const indices = geometry.index;

                            if (indices) {
                                // Create triangle mesh collider
                                const vertices = [];
                                const indicesArray = [];

                                // Collect vertices
                                for (let i = 0; i < positions.count; i++) {
                                    const vertex = new THREE.Vector3();
                                    vertex.fromBufferAttribute(positions, i);
                                    vertex.multiply(scale); // Apply scale
                                    vertices.push(vertex.x, vertex.y, vertex.z);
                                }

                                // Collect indices
                                for (let i = 0; i < indices.count; i++) {
                                    indicesArray.push(indices.getX(i));
                                }

                                // Create triangle mesh collider
                                const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indicesArray);
                                colliderDesc.setCollisionGroups(0b0100); // Static objects collision group
                                world.createCollider(colliderDesc, rigidBody);
                            } else {
                                // Fallback: create bounding box collider
                                const box = new THREE.Box3().setFromBufferAttribute(positions);
                                const size = box.getSize(new THREE.Vector3());
                                size.multiply(scale); // Apply scale
                                const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
                                colliderDesc.setCollisionGroups(0b0100); // Static objects collision group
                                world.createCollider(colliderDesc, rigidBody);
                            }
                        }

                        // Store reference to the mesh for collision handling
                        rigidBody.userData = {
                            mesh: child,
                            isStaticObject: true,
                            isISD: true
                        };
                    }
                }
            });

            // Add to scene after loading
            scene.add(isdMesh);
            console.log('ISD model added to scene with physics colliders');

            // Add to static objects array for collision detection if provided
            if (staticObjects) {
                // Add all mesh children of the ISD to the static objects array
                isdMesh.traverse((child) => {
                    if (child.isMesh) {
                        staticObjects.push(child);
                    }
                });
            }
        },
        undefined,
        (error) => {
            console.error('An error happened loading the ISD GLTF model:', error);
        }
    );

    // Return enemies array for the main game loop (empty since enemies are server-managed)
    return [];
}
