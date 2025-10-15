import * as THREE from 'three';
import { GameConfig } from '../config/game-config.js';

/**
 * Manages the Three.js scene, camera, renderer, and lighting
 */
export default class SceneManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.audioListener = null;
        this.lights = {};
        this.initialized = false;
    }

    /**
     * Initialize the scene, camera, and renderer
     * @param {HTMLElement} container - Container element for the renderer
     */
    init(container = document.body) {
        if (this.initialized) {
            console.warn('SceneManager already initialized');
            return;
        }

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(GameConfig.SCENE.BACKGROUND_COLOR);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            GameConfig.CAMERA.FOV,
            window.innerWidth / window.innerHeight,
            GameConfig.CAMERA.NEAR,
            GameConfig.CAMERA.FAR
        );
        this.camera.position.set(
            GameConfig.CAMERA.DEFAULT_POSITION.x,
            GameConfig.CAMERA.DEFAULT_POSITION.y,
            GameConfig.CAMERA.DEFAULT_POSITION.z
        );

        // Create audio listener
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: GameConfig.RENDERER.ANTIALIAS
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = GameConfig.RENDERER.SHADOW_MAP_ENABLED;

        // Add renderer to container
        container.appendChild(this.renderer.domElement);

        // Set up lighting
        this.setupLighting();

        // Handle window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));

        this.initialized = true;
        console.log('SceneManager initialized');
    }

    /**
     * Set up scene lighting
     */
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(
            GameConfig.LIGHTING.AMBIENT.COLOR,
            GameConfig.LIGHTING.AMBIENT.INTENSITY
        );
        this.scene.add(ambientLight);
        this.lights.ambient = ambientLight;

        // Directional light
        const directionalLight = new THREE.DirectionalLight(
            GameConfig.LIGHTING.DIRECTIONAL.COLOR,
            GameConfig.LIGHTING.DIRECTIONAL.INTENSITY
        );
        directionalLight.position.set(
            GameConfig.LIGHTING.DIRECTIONAL.POSITION.x,
            GameConfig.LIGHTING.DIRECTIONAL.POSITION.y,
            GameConfig.LIGHTING.DIRECTIONAL.POSITION.z
        );
        this.scene.add(directionalLight);
        this.lights.directional = directionalLight;
    }

    /**
     * Add stars background
     */
    addStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: GameConfig.SCENE.STAR_SIZE
        });

        const starVertices = [];
        for (let i = 0; i < GameConfig.SCENE.STAR_COUNT; i++) {
            const x = (Math.random() - 0.5) * 2000;
            const y = (Math.random() - 0.5) * 2000;
            const z = (Math.random() - 0.5) * 2000;
            starVertices.push(x, y, z);
        }

        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
        return stars;
    }

    /**
     * Add object to scene
     * @param {THREE.Object3D} object - Object to add
     */
    add(object) {
        if (this.scene) {
            this.scene.add(object);
        }
    }

    /**
     * Remove object from scene
     * @param {THREE.Object3D} object - Object to remove
     */
    remove(object) {
        if (this.scene) {
            this.scene.remove(object);
        }
    }

    /**
     * Get object by name
     * @param {string} name - Object name
     * @returns {THREE.Object3D|null} Found object or null
     */
    getObjectByName(name) {
        return this.scene ? this.scene.getObjectByName(name) : null;
    }

    /**
     * Get objects by property
     * @param {string} property - Property name
     * @param {*} value - Property value
     * @returns {Array} Array of matching objects
     */
    getObjectsByProperty(property, value) {
        const result = [];
        if (this.scene) {
            this.scene.traverse((child) => {
                if (child[property] === value) {
                    result.push(child);
                }
            });
        }
        return result;
    }

    /**
     * Update camera aspect ratio on window resize
     */
    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    /**
     * Render the scene
     */
    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Set camera position
     * @param {THREE.Vector3} position - New camera position
     */
    setCameraPosition(position) {
        if (this.camera) {
            this.camera.position.copy(position);
        }
    }

    /**
     * Set camera look at target
     * @param {THREE.Vector3} target - Target to look at
     */
    setCameraLookAt(target) {
        if (this.camera) {
            this.camera.lookAt(target);
        }
    }

    /**
     * Get camera
     * @returns {THREE.Camera} Camera instance
     */
    getCamera() {
        return this.camera;
    }

    /**
     * Get scene
     * @returns {THREE.Scene} Scene instance
     */
    getScene() {
        return this.scene;
    }

    /**
     * Get renderer
     * @returns {THREE.WebGLRenderer} Renderer instance
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Get audio listener
     * @returns {THREE.AudioListener} Audio listener
     */
    getAudioListener() {
        return this.audioListener;
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }

        // Dispose of geometries and materials
        if (this.scene) {
            this.scene.traverse((child) => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }

        window.removeEventListener('resize', this.onWindowResize);
        this.initialized = false;
    }
}