import * as THREE from 'three';
import Debris from '../components/debris.js';

/**
 * Create smaller debris pieces by breaking geometry into faces
 * @param {THREE.Mesh} mesh - The mesh to break into face pieces
 * @param {number} pieceCount - Number of pieces to create (default: 4-8)
 * @returns {THREE.Mesh[]} Array of smaller mesh pieces
 */
function createFaceDebris(mesh, pieceCount = null) {
    if (!mesh || !mesh.geometry) return [mesh];

    const geometry = mesh.geometry;
    const material = mesh.material;

    // Clone the geometry to avoid modifying the original
    const clonedGeometry = geometry.clone();

    // Ensure we have indexed geometry for faces
    if (!clonedGeometry.index) {
        clonedGeometry.setIndex([...Array(clonedGeometry.attributes.position.count).keys()]);
    }

    const positions = clonedGeometry.attributes.position;
    const indices = clonedGeometry.index;

    // Calculate number of pieces if not specified
    if (pieceCount === null) {
        const faceCount = indices.count / 3;
        pieceCount = Math.max(3, Math.min(8, Math.floor(faceCount / 12))); // 3-8 pieces based on geometry complexity
    }

    const pieces = [];

    // Get bounding box to distribute pieces
    const bbox = new THREE.Box3().setFromBufferAttribute(positions);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    for (let i = 0; i < pieceCount; i++) {
        // Create a small piece geometry (cube or tetrahedral)
        const pieceGeometry = new THREE.BoxGeometry(
            size.x * (0.1 + Math.random() * 0.15), // 10-25% of original size
            size.y * (0.1 + Math.random() * 0.15),
            size.z * (0.1 + Math.random() * 0.15)
        );

        // Clone material for each piece
        const pieceMaterial = Array.isArray(material) ? material.map(m => m.clone()) : material.clone();

        const pieceMesh = new THREE.Mesh(pieceGeometry, pieceMaterial);

        // Position piece randomly within the bounds of the original mesh
        const randomOffset = new THREE.Vector3(
            (Math.random() - 0.5) * size.x * 0.8,
            (Math.random() - 0.5) * size.y * 0.8,
            (Math.random() - 0.5) * size.z * 0.8
        );

        pieceMesh.position.copy(center).add(randomOffset);

        pieces.push(pieceMesh);
    }

    return pieces;
}

/**
 * Manages all debris entities in the game
 * Handles creation, updating, and cleanup of exploding components
 */
export default class DebrisManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.debris = new Set();
    }

    /**
     * Create debris from a destroyed component
     * @param {THREE.Mesh[]} meshes - Array of meshes from the destroyed component
     * @param {THREE.Vector3} centerPosition - Center position of the original component
     * @param {THREE.Object3D} parentObject - The parent object (e.g., enemy ship) for correct positioning
     */
    createDebrisFromComponent(meshes, centerPosition, parentObject = null) {
        if (!meshes || !Array.isArray(meshes)) return;

        meshes.forEach(mesh => {
            if (!mesh) return;

            // Debug: Log before detaching
            console.log(`Before detach - mesh position: ${mesh.position.x}, ${mesh.position.y}, ${mesh.position.z}`);

            // Detach mesh from parent
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }

            // Debug: Log after detaching
            console.log(`After detach - mesh position: ${mesh.position.x}, ${mesh.position.y}, ${mesh.position.z}`);

            // Instead of using the whole mesh, break it into smaller face pieces
            const facePieces = createFaceDebris(mesh);

            facePieces.forEach(piece => {
                // Use the parent object's world position if provided, otherwise try to get mesh world position
                let baseWorldPosition = new THREE.Vector3(0, 0, 0);
                let baseWorldQuaternion = new THREE.Quaternion();
                let baseWorldScale = new THREE.Vector3(1, 1, 1);

                if (parentObject) {
                    parentObject.updateMatrixWorld();
                    parentObject.getWorldPosition(baseWorldPosition);
                    parentObject.getWorldQuaternion(baseWorldQuaternion);
                    parentObject.getWorldScale(baseWorldScale);
                    console.log(`Using parent position: ${baseWorldPosition.x}, ${baseWorldPosition.y}, ${baseWorldPosition.z}`);
                } else {
                    // Fallback to mesh world position
                    mesh.updateMatrixWorld();
                    mesh.getWorldPosition(baseWorldPosition);
                    mesh.getWorldQuaternion(baseWorldQuaternion);
                    mesh.getWorldScale(baseWorldScale);
                    console.log(`Using mesh world position: ${baseWorldPosition.x}, ${baseWorldPosition.y}, ${baseWorldPosition.z}`);
                }

                console.log(`Piece local position before: ${piece.position.x}, ${piece.position.y}, ${piece.position.z}`);

                // Apply the base world transformation to the piece
                piece.position.add(baseWorldPosition);
                piece.quaternion.premultiply(baseWorldQuaternion);
                piece.scale.multiply(baseWorldScale);

                console.log(`Piece final position: ${piece.position.x}, ${piece.position.y}, ${piece.position.z}`);

                // Calculate direction based on piece's LOCAL position relative to component center
                // This gives true outward explosion from the component's center
                const localPiecePosition = piece.position.clone().sub(baseWorldPosition);
                const pieceDirection = localPiecePosition.sub(centerPosition);
                const distanceFromCenter = pieceDirection.length();

                // If piece is too close to center, use random direction
                let finalDirection;
                if (distanceFromCenter < 0.1) {
                    finalDirection = new THREE.Vector3(
                        Math.random() - 0.5,
                        Math.random() - 0.5,
                        Math.random() - 0.5
                    );
                } else {
                    // Use outward direction with increased randomness for more natural spread
                    finalDirection = pieceDirection.normalize();
                    const randomOffset = new THREE.Vector3(
                        (Math.random() - 0.5) * 1.2,
                        (Math.random() - 0.5) * 1.2,
                        (Math.random() - 0.5) * 1.2
                    );
                    finalDirection.add(randomOffset);
                }

                const direction = finalDirection.normalize();

                // Random speed between 3-8 units per second (gentler explosion)
                const speed = 3 + Math.random() * 5;
                const velocity = direction.multiplyScalar(speed);

                // Random angular velocity for spinning (reduced)
                const angularVelocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 8,
                    (Math.random() - 0.5) * 8,
                    (Math.random() - 0.5) * 8
                );

                // Create debris
                const debris = new Debris(piece, {
                    scene: this.scene,
                    world: this.world,
                    velocity: velocity,
                    angularVelocity: angularVelocity,
                    lifetime: 4.0 + Math.random() * 3.0 // 4-7 seconds (longer for better visibility)
                });

                this.debris.add(debris);
            });
        });
    }

    /**
     * Update all debris
     * @param {number} deltaTime - Time elapsed since last update
     */
    update(deltaTime) {
        const toRemove = [];

        this.debris.forEach(debris => {
            if (debris.update(deltaTime)) {
                // Debris lifetime expired
                toRemove.push(debris);
            }
        });

        // Clean up expired debris
        toRemove.forEach(debris => {
            debris.destroy();
            this.debris.delete(debris);
        });
    }

    /**
     * Remove all debris
     */
    clear() {
        this.debris.forEach(debris => {
            debris.destroy();
        });
        this.debris.clear();
    }

    /**
     * Get current debris count
     * @returns {number} Number of active debris pieces
     */
    getDebrisCount() {
        return this.debris.size;
    }
}