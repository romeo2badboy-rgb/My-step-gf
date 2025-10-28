import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from 'https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@2.1.0/lib/three-vrm.module.min.js';

// Scene Setup
let scene, camera, renderer, controls;
let currentVRM = null;
let mixer = null;
let clock = new THREE.Clock();
let currentEmotion = 'neutral';

// Animation state
let animationQueue = [];
let isAnimating = false;
let bones = {};
let eyeBlinkInterval = null;

// Initialize Three.js scene
function initScene() {
    const canvas = document.getElementById('character-canvas');
    const container = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();
    scene.background = null; // Transparent background

    // Camera
    camera = new THREE.PerspectiveCamera(
        35,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.3, 2.5);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-1, 1, -1);
    scene.add(directionalLight2);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 5;
    controls.update();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    // Update VRM
    if (currentVRM) {
        currentVRM.update(deltaTime);
    }

    // Update animations
    if (mixer) {
        mixer.update(deltaTime);
    }

    controls.update();
    renderer.render(scene, camera);
}

// Load VRM Model
async function loadVRMModel() {
    const loader = new GLTFLoader();
    loader.register((parser) => {
        return new VRMLoaderPlugin(parser);
    });

    try {
        // Using a sample VRM model URL
        // You can replace this with any VRM model URL
        const modelUrl = 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm';

        document.getElementById('loading').textContent = 'Loading your waifu...';

        const gltf = await loader.loadAsync(modelUrl);

        const vrm = gltf.userData.vrm;

        if (vrm) {
            // Rotate model to face camera
            VRMUtils.rotateVRM0(vrm);

            scene.add(vrm.scene);
            currentVRM = vrm;

            // Get bone references for animation
            getBoneReferences();

            // Setup animations
            setupAnimations();

            document.getElementById('loading').style.display = 'none';
            console.log('VRM model loaded successfully!');
            console.log('Available bones:', Object.keys(bones));
        }
    } catch (error) {
        console.error('Error loading VRM model:', error);
        document.getElementById('loading').textContent =
            'Could not load model. Using fallback character...';
        loadFallbackModel();
    }
}

// Get bone references from VRM model
function getBoneReferences() {
    if (!currentVRM || !currentVRM.humanoid) {
        console.log('No humanoid bones available');
        return;
    }

    // Get humanoid bones
    const humanoid = currentVRM.humanoid;
    const boneNames = [
        'head', 'neck', 'chest', 'spine', 'hips',
        'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
        'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
        'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
        'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
        'leftEye', 'rightEye'
    ];

    boneNames.forEach(boneName => {
        const bone = humanoid.getRawBoneNode(boneName);
        if (bone) {
            bones[boneName] = bone;
            // Store initial rotations
            if (!bone.userData.initialRotation) {
                bone.userData.initialRotation = bone.rotation.clone();
            }
        }
    });
}

// Fallback to a simple 3D character if VRM fails
function loadFallbackModel() {
    // Create a simple anime-style character using basic shapes
    const characterGroup = new THREE.Group();

    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const skinMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        roughness: 0.6
    });
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = 1.5;
    head.userData.initialRotation = new THREE.Euler(0, 0, 0);
    characterGroup.add(head);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.1, 1.55, 0.25);
    leftEye.userData.initialScale = new THREE.Vector3(1, 1, 1);
    characterGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.1, 1.55, 0.25);
    rightEye.userData.initialScale = new THREE.Vector3(1, 1, 1);
    characterGroup.add(rightEye);

    // Hair
    const hairGeometry = new THREE.SphereGeometry(0.35, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.7
    });
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = 1.65;
    characterGroup.add(hair);

    // Body
    const bodyGeometry = new THREE.CylinderGeometry(0.25, 0.3, 0.8, 16);
    const clothesMaterial = new THREE.MeshStandardMaterial({
        color: 0xff69b4,
        roughness: 0.6
    });
    const body = new THREE.Mesh(bodyGeometry, clothesMaterial);
    body.position.y = 0.8;
    characterGroup.add(body);

    // Left Arm (with bones for animation)
    const leftArm = new THREE.Group();
    const leftUpperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8),
        skinMaterial
    );
    leftUpperArm.position.set(-0.35, 1.05, 0);
    leftUpperArm.userData.initialRotation = new THREE.Euler(0, 0, 0.3);
    leftArm.add(leftUpperArm);

    const leftLowerArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, 0.3, 8),
        skinMaterial
    );
    leftLowerArm.position.set(-0.35, 0.65, 0);
    leftLowerArm.userData.initialRotation = new THREE.Euler(0, 0, 0.3);
    leftArm.add(leftLowerArm);

    const leftHand = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 16),
        skinMaterial
    );
    leftHand.position.set(-0.35, 0.5, 0);
    leftHand.userData.initialRotation = new THREE.Euler(0, 0, 0);
    leftArm.add(leftHand);

    characterGroup.add(leftArm);

    // Right Arm (with bones for animation)
    const rightArm = new THREE.Group();
    const rightUpperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8),
        skinMaterial
    );
    rightUpperArm.position.set(0.35, 1.05, 0);
    rightUpperArm.userData.initialRotation = new THREE.Euler(0, 0, -0.3);
    rightArm.add(rightUpperArm);

    const rightLowerArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, 0.3, 8),
        skinMaterial
    );
    rightLowerArm.position.set(0.35, 0.65, 0);
    rightLowerArm.userData.initialRotation = new THREE.Euler(0, 0, -0.3);
    rightArm.add(rightLowerArm);

    const rightHand = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 16),
        skinMaterial
    );
    rightHand.position.set(0.35, 0.5, 0);
    rightHand.userData.initialRotation = new THREE.Euler(0, 0, 0);
    rightArm.add(rightHand);

    characterGroup.add(rightArm);

    scene.add(characterGroup);

    // Create a fallback bone structure
    bones = {
        head: head,
        leftEye: leftEye,
        rightEye: rightEye,
        leftUpperArm: leftUpperArm,
        leftLowerArm: leftLowerArm,
        leftHand: leftHand,
        rightUpperArm: rightUpperArm,
        rightLowerArm: rightLowerArm,
        rightHand: rightHand
    };

    currentVRM = {
        scene: characterGroup,
        humanoid: null,
        update: () => {} // Empty update function
    };

    setupAnimations();
    document.getElementById('loading').style.display = 'none';
    console.log('Fallback character loaded with bones:', Object.keys(bones));
}

// Setup animations
function setupAnimations() {
    // Simple breathing/idle animation
    let breatheTime = 0;

    function breatheAnimation() {
        breatheTime += 0.016;

        if (currentVRM && currentVRM.scene) {
            const breatheScale = Math.sin(breatheTime * 2) * 0.01;
            currentVRM.scene.position.y = breatheScale;
        }

        requestAnimationFrame(breatheAnimation);
    }

    breatheAnimation();

    // Start idle eye blinking
    startIdleBlinking();
}

// Idle eye blinking
function startIdleBlinking() {
    if (eyeBlinkInterval) {
        clearInterval(eyeBlinkInterval);
    }

    eyeBlinkInterval = setInterval(() => {
        if (!isAnimating) {
            performBlink();
        }
    }, 3000 + Math.random() * 2000); // Random blink every 3-5 seconds
}

function performBlink() {
    if (!bones.leftEye && !bones.rightEye) return;

    const blinkDuration = 150;

    // Close eyes
    animateEyes(0.1, blinkDuration / 2);

    // Open eyes
    setTimeout(() => {
        animateEyes(1, blinkDuration / 2);
    }, blinkDuration / 2);
}

function animateEyes(scaleY, duration) {
    if (bones.leftEye) {
        animateScale(bones.leftEye, { y: scaleY }, duration);
    }
    if (bones.rightEye) {
        animateScale(bones.rightEye, { y: scaleY }, duration);
    }
}

// Animation helper functions
function animateBone(bone, targetRotation, duration = 500, easing = 'easeOutCubic') {
    if (!bone) return Promise.resolve();

    return new Promise((resolve) => {
        const startRotation = {
            x: bone.rotation.x,
            y: bone.rotation.y,
            z: bone.rotation.z
        };

        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Apply easing
            const eased = applyEasing(progress, easing);

            bone.rotation.x = startRotation.x + (targetRotation.x - startRotation.x) * eased;
            bone.rotation.y = startRotation.y + (targetRotation.y - startRotation.y) * eased;
            bone.rotation.z = startRotation.z + (targetRotation.z - startRotation.z) * eased;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        animate();
    });
}

function animateScale(object, targetScale, duration = 500) {
    if (!object) return Promise.resolve();

    return new Promise((resolve) => {
        const startScale = {
            x: object.scale.x,
            y: object.scale.y,
            z: object.scale.z
        };

        const target = {
            x: targetScale.x !== undefined ? targetScale.x : startScale.x,
            y: targetScale.y !== undefined ? targetScale.y : startScale.y,
            z: targetScale.z !== undefined ? targetScale.z : startScale.z
        };

        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            object.scale.x = startScale.x + (target.x - startScale.x) * progress;
            object.scale.y = startScale.y + (target.y - startScale.y) * progress;
            object.scale.z = startScale.z + (target.z - startScale.z) * progress;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        animate();
    });
}

function applyEasing(t, type) {
    switch (type) {
        case 'easeOutCubic':
            return 1 - Math.pow(1 - t, 3);
        case 'easeInOutCubic':
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        case 'easeOutElastic':
            const c4 = (2 * Math.PI) / 3;
            return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        default:
            return t; // linear
    }
}

function resetBone(bone, duration = 500) {
    if (!bone || !bone.userData.initialRotation) return Promise.resolve();

    return animateBone(bone, {
        x: bone.userData.initialRotation.x,
        y: bone.userData.initialRotation.y,
        z: bone.userData.initialRotation.z
    }, duration);
}

// Action Animations
const actionAnimations = {
    wave_hand: async () => {
        console.log('Waving hand');
        const hand = bones.rightHand || bones.rightLowerArm || bones.rightUpperArm;
        if (!hand) return;

        // Wave motion
        for (let i = 0; i < 3; i++) {
            await animateBone(hand, { x: 0, y: 0, z: -1.2 }, 200);
            await animateBone(hand, { x: 0, y: 0, z: -0.8 }, 200);
        }
        await resetBone(hand, 400);
    },

    raise_hand: async () => {
        console.log('Raising hand');
        const arm = bones.rightUpperArm;
        if (!arm) return;

        await animateBone(arm, { x: 0, y: 0, z: -2.5 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await resetBone(arm, 500);
    },

    both_hands_up: async () => {
        console.log('Both hands up');
        const leftArm = bones.leftUpperArm;
        const rightArm = bones.rightUpperArm;

        await Promise.all([
            leftArm ? animateBone(leftArm, { x: 0, y: 0, z: 2.5 }, 500) : null,
            rightArm ? animateBone(rightArm, { x: 0, y: 0, z: -2.5 }, 500) : null
        ]);

        await new Promise(resolve => setTimeout(resolve, 1000));

        await Promise.all([
            leftArm ? resetBone(leftArm, 500) : null,
            rightArm ? resetBone(rightArm, 500) : null
        ]);
    },

    point: async () => {
        console.log('Pointing');
        const arm = bones.rightUpperArm;
        const hand = bones.rightHand;

        if (arm) await animateBone(arm, { x: 0, y: 0.5, z: -1.5 }, 500);
        if (hand) await animateBone(hand, { x: 0, y: 0, z: -0.3 }, 300);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (arm) await resetBone(arm, 500);
        if (hand) await resetBone(hand, 300);
    },

    cover_mouth: async () => {
        console.log('Covering mouth');
        const arm = bones.rightUpperArm;
        const lowerArm = bones.rightLowerArm;

        if (arm) await animateBone(arm, { x: 0.3, y: 0.5, z: -1.8 }, 500);
        if (lowerArm) await animateBone(lowerArm, { x: -0.5, y: 0, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (arm) await resetBone(arm, 500);
        if (lowerArm) await resetBone(lowerArm, 500);
    },

    hand_on_chest: async () => {
        console.log('Hand on chest');
        const arm = bones.rightUpperArm;

        if (arm) await animateBone(arm, { x: 0.2, y: 0.3, z: -1.2 }, 600);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (arm) await resetBone(arm, 600);
    },

    thumbs_up: async () => {
        console.log('Thumbs up');
        const arm = bones.rightUpperArm;
        const hand = bones.rightHand;

        if (arm) await animateBone(arm, { x: 0, y: 0.2, z: -1.5 }, 500);
        if (hand) await animateBone(hand, { x: 0, y: 0, z: 0.3 }, 300);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (arm) await resetBone(arm, 500);
        if (hand) await resetBone(hand, 300);
    },

    peace_sign: async () => {
        console.log('Peace sign');
        const arm = bones.rightUpperArm;
        const hand = bones.rightHand;

        if (arm) await animateBone(arm, { x: 0.3, y: 0.5, z: -2.0 }, 500);
        if (hand) await animateBone(hand, { x: 0, y: 0.3, z: 0 }, 300);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (arm) await resetBone(arm, 500);
        if (hand) await resetBone(hand, 300);
    },

    clap: async () => {
        console.log('Clapping');
        const leftArm = bones.leftUpperArm;
        const rightArm = bones.rightUpperArm;

        // Clap 3 times
        for (let i = 0; i < 3; i++) {
            await Promise.all([
                leftArm ? animateBone(leftArm, { x: 0, y: 0.5, z: 1.2 }, 200) : null,
                rightArm ? animateBone(rightArm, { x: 0, y: 0.5, z: -1.2 }, 200) : null
            ]);
            await Promise.all([
                leftArm ? animateBone(leftArm, { x: 0, y: 0, z: 0.8 }, 150) : null,
                rightArm ? animateBone(rightArm, { x: 0, y: 0, z: -0.8 }, 150) : null
            ]);
        }

        await Promise.all([
            leftArm ? resetBone(leftArm, 400) : null,
            rightArm ? resetBone(rightArm, 400) : null
        ]);
    },

    blow_kiss: async () => {
        console.log('Blowing kiss');
        const arm = bones.rightUpperArm;
        const hand = bones.rightHand;

        // Hand to mouth
        if (arm) await animateBone(arm, { x: 0.2, y: 0.5, z: -1.8 }, 500);
        if (hand) await animateBone(hand, { x: 0, y: 0, z: -0.3 }, 300);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Blow kiss forward
        if (arm) await animateBone(arm, { x: 0, y: 0.3, z: -1.5 }, 400);
        if (hand) await animateBone(hand, { x: 0, y: 0, z: 0.2 }, 300);
        await new Promise(resolve => setTimeout(resolve, 800));

        if (arm) await resetBone(arm, 500);
        if (hand) await resetBone(hand, 300);
    },

    blink: async () => {
        console.log('Blinking');
        performBlink();
        await new Promise(resolve => setTimeout(resolve, 200));
    },

    close_eyes: async () => {
        console.log('Closing eyes');
        animateEyes(0.1, 300);
        await new Promise(resolve => setTimeout(resolve, 2000));
        animateEyes(1, 300);
    },

    wink: async () => {
        console.log('Winking');
        if (bones.rightEye) {
            animateScale(bones.rightEye, { y: 0.1 }, 150);
            await new Promise(resolve => setTimeout(resolve, 400));
            animateScale(bones.rightEye, { y: 1 }, 150);
        }
    },

    look_left: async () => {
        console.log('Looking left');
        const head = bones.head;
        if (head) await animateBone(head, { x: 0, y: 0.5, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (head) await resetBone(head, 500);
    },

    look_right: async () => {
        console.log('Looking right');
        const head = bones.head;
        if (head) await animateBone(head, { x: 0, y: -0.5, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (head) await resetBone(head, 500);
    },

    look_up: async () => {
        console.log('Looking up');
        const head = bones.head;
        if (head) await animateBone(head, { x: 0.3, y: 0, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (head) await resetBone(head, 500);
    },

    look_down: async () => {
        console.log('Looking down');
        const head = bones.head;
        if (head) await animateBone(head, { x: -0.3, y: 0, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (head) await resetBone(head, 500);
    },

    nod: async () => {
        console.log('Nodding');
        const head = bones.head;
        if (!head) return;

        for (let i = 0; i < 3; i++) {
            await animateBone(head, { x: 0.3, y: 0, z: 0 }, 200);
            await animateBone(head, { x: -0.1, y: 0, z: 0 }, 200);
        }
        await resetBone(head, 300);
    },

    shake_head: async () => {
        console.log('Shaking head');
        const head = bones.head;
        if (!head) return;

        for (let i = 0; i < 3; i++) {
            await animateBone(head, { x: 0, y: 0.4, z: 0 }, 200);
            await animateBone(head, { x: 0, y: -0.4, z: 0 }, 200);
        }
        await resetBone(head, 300);
    },

    tilt_head: async () => {
        console.log('Tilting head');
        const head = bones.head;
        if (head) await animateBone(head, { x: 0.2, y: 0, z: 0.3 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (head) await resetBone(head, 500);
    },

    jump: async () => {
        console.log('Jumping');
        if (!currentVRM) return;

        const scene = currentVRM.scene;
        const startY = scene.position.y;

        // Jump up
        const jumpAnimation = () => {
            return new Promise((resolve) => {
                const jumpHeight = 0.3;
                const duration = 500;
                const startTime = Date.now();

                function animate() {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);

                    // Parabolic jump
                    const jumpProgress = Math.sin(progress * Math.PI);
                    scene.position.y = startY + jumpProgress * jumpHeight;

                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        scene.position.y = startY;
                        resolve();
                    }
                }

                animate();
            });
        };

        await jumpAnimation();
    },

    spin: async () => {
        console.log('Spinning');
        if (!currentVRM) return;

        const scene = currentVRM.scene;
        const startRotation = scene.rotation.y;
        const duration = 1000;
        const startTime = Date.now();

        return new Promise((resolve) => {
            function animate() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                scene.rotation.y = startRotation + (Math.PI * 2 * progress);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    scene.rotation.y = startRotation;
                    resolve();
                }
            }

            animate();
        });
    },

    lean_forward: async () => {
        console.log('Leaning forward');
        if (!currentVRM) return;

        const scene = currentVRM.scene;
        await animateBone(scene, { x: 0.2, y: 0, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await animateBone(scene, { x: 0, y: 0, z: 0 }, 500);
    },

    lean_back: async () => {
        console.log('Leaning back');
        if (!currentVRM) return;

        const scene = currentVRM.scene;
        await animateBone(scene, { x: -0.2, y: 0, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await animateBone(scene, { x: 0, y: 0, z: 0 }, 500);
    },

    idle: async () => {
        console.log('Returning to idle');
        // Reset all bones to initial positions
        const resetPromises = Object.values(bones).map(bone => resetBone(bone, 500));
        await Promise.all(resetPromises);
    }
};

// Play multiple actions
async function playActions(actions) {
    if (!actions || actions.length === 0) return;

    isAnimating = true;

    for (const action of actions) {
        const actionName = action.toLowerCase().trim();
        if (actionAnimations[actionName]) {
            try {
                await actionAnimations[actionName]();
            } catch (error) {
                console.error(`Error playing action ${actionName}:`, error);
            }
        } else {
            console.warn(`Unknown action: ${actionName}`);
        }
    }

    isAnimating = false;
}

// Play emotion animation
function playEmotion(emotion) {
    currentEmotion = emotion;

    const emotionIndicator = document.getElementById('emotion-indicator');
    emotionIndicator.textContent = `Emotion: ${emotion}`;
    emotionIndicator.style.display = 'block';

    setTimeout(() => {
        emotionIndicator.style.display = 'none';
    }, 3000);

    console.log(`Emotion: ${emotion}`);
}

// Chat functionality
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const resetBtn = document.getElementById('reset-btn');

function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessage(message, true);
    chatInput.value = '';

    // Show typing indicator
    showTypingIndicator();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });

        const data = await response.json();

        removeTypingIndicator();

        if (data.error) {
            addMessage('Sorry, I encountered an error. Please try again!', false);
        } else {
            addMessage(data.response, false);
            playEmotion(data.emotion);

            // Play actions if any
            if (data.actions && data.actions.length > 0) {
                console.log('Playing actions:', data.actions);
                playActions(data.actions);
            }
        }
    } catch (error) {
        removeTypingIndicator();
        addMessage('Sorry, I could not connect to the server!', false);
        console.error('Error:', error);
    }
}

async function resetConversation() {
    try {
        await fetch('/api/reset', { method: 'POST' });
        chatMessages.innerHTML = '';
        addMessage('Hi! I\'m your AI waifu companion! I can move my body now! How can I make you smile today?', false);
        playEmotion('happy');
        playActions(['wave_hand']);
    } catch (error) {
        console.error('Error resetting conversation:', error);
    }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
resetBtn.addEventListener('click', resetConversation);

// Initialize
initScene();
loadVRMModel();

// Initial greeting
setTimeout(() => {
    addMessage('Hi! I\'m your AI waifu companion! I can move my body now! How can I make you smile today?', false);
    playEmotion('happy');
    playActions(['wave_hand']);
}, 1000);
