import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from 'https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@2.1.0/lib/three-vrm.module.min.js';

// Scene Setup
let scene, camera, renderer, controls;
let currentVRM = null;
let mixer = null;
let clock = new THREE.Clock();
let currentEmotion = 'neutral';

// Animation state
let isAnimating = false;
let bones = {};
let skeleton = null;
let eyeBlinkInterval = null;

// Store initial bone states
let initialBoneStates = new Map();

// Initialize Three.js scene
function initScene() {
    const canvas = document.getElementById('character-canvas');
    const container = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();
    scene.background = null;

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
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
        // Try multiple VRM sources
        const modelUrls = [
            'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
            'https://pixiv.github.io/three-vrm/packages/three-vrm/examples/models/three-vrm-girl.vrm'
        ];

        document.getElementById('loading').textContent = 'Loading your waifu...';

        let gltf = null;
        for (const url of modelUrls) {
            try {
                console.log('Trying to load:', url);
                gltf = await loader.loadAsync(url);
                break;
            } catch (e) {
                console.log('Failed to load from', url);
            }
        }

        if (!gltf) {
            throw new Error('Could not load any VRM model');
        }

        const vrm = gltf.userData.vrm;

        if (vrm) {
            // Rotate model to face camera (VRM0 format)
            if (vrm.meta?.metaVersion === '0') {
                VRMUtils.rotateVRM0(vrm);
            }

            scene.add(vrm.scene);
            currentVRM = vrm;

            // Get bone references for animation
            setupVRMBones();

            // Setup animations
            setupAnimations();

            document.getElementById('loading').style.display = 'none';
            console.log('VRM model loaded successfully!');
            console.log('Available bones:', Object.keys(bones));
            console.log('VRM has expressions:', vrm.expressionManager ? 'Yes' : 'No');
        }
    } catch (error) {
        console.error('Error loading VRM model:', error);
        document.getElementById('loading').textContent =
            'Loading custom character...';
        loadCustomRiggedCharacter();
    }
}

// Setup VRM bones properly using humanoid interface
function setupVRMBones() {
    if (!currentVRM || !currentVRM.humanoid) {
        console.log('No humanoid bones available');
        return;
    }

    const humanoid = currentVRM.humanoid;

    // Get all humanoid bones using proper VRM API
    const boneNames = {
        hips: 'hips',
        spine: 'spine',
        chest: 'chest',
        neck: 'neck',
        head: 'head',
        leftShoulder: 'leftShoulder',
        leftUpperArm: 'leftUpperArm',
        leftLowerArm: 'leftLowerArm',
        leftHand: 'leftHand',
        rightShoulder: 'rightShoulder',
        rightUpperArm: 'rightUpperArm',
        rightLowerArm: 'rightLowerArm',
        rightHand: 'rightHand',
        leftUpperLeg: 'leftUpperLeg',
        leftLowerLeg: 'leftLowerLeg',
        leftFoot: 'leftFoot',
        rightUpperLeg: 'rightUpperLeg',
        rightLowerLeg: 'rightLowerLeg',
        rightFoot: 'rightFoot',
        leftEye: 'leftEye',
        rightEye: 'rightEye'
    };

    Object.entries(boneNames).forEach(([key, boneName]) => {
        const boneNode = humanoid.getNormalizedBoneNode(boneName);
        if (boneNode) {
            bones[key] = boneNode;
            // Store initial state
            if (!initialBoneStates.has(key)) {
                initialBoneStates.set(key, {
                    position: boneNode.position.clone(),
                    rotation: boneNode.rotation.clone(),
                    quaternion: boneNode.quaternion.clone()
                });
            }
        }
    });

    console.log('VRM bones setup complete:', Object.keys(bones).length, 'bones found');
}

// Load custom rigged character with proper skeletal system
function loadCustomRiggedCharacter() {
    const characterGroup = new THREE.Group();

    // Create skeleton system
    const rootBone = new THREE.Bone();
    rootBone.position.set(0, 0, 0);
    rootBone.name = 'root';

    const hipsBone = new THREE.Bone();
    hipsBone.position.set(0, 0.8, 0);
    hipsBone.name = 'hips';
    rootBone.add(hipsBone);

    const spineBone = new THREE.Bone();
    spineBone.position.set(0, 0.2, 0);
    spineBone.name = 'spine';
    hipsBone.add(spineBone);

    const chestBone = new THREE.Bone();
    chestBone.position.set(0, 0.15, 0);
    chestBone.name = 'chest';
    spineBone.add(chestBone);

    const neckBone = new THREE.Bone();
    neckBone.position.set(0, 0.25, 0);
    neckBone.name = 'neck';
    chestBone.add(neckBone);

    const headBone = new THREE.Bone();
    headBone.position.set(0, 0.1, 0);
    headBone.name = 'head';
    neckBone.add(headBone);

    // LEFT ARM CHAIN
    const leftShoulderBone = new THREE.Bone();
    leftShoulderBone.position.set(-0.1, 0.2, 0);
    leftShoulderBone.name = 'leftShoulder';
    chestBone.add(leftShoulderBone);

    const leftUpperArmBone = new THREE.Bone();
    leftUpperArmBone.position.set(-0.15, 0, 0);
    leftUpperArmBone.name = 'leftUpperArm';
    leftShoulderBone.add(leftUpperArmBone);

    const leftLowerArmBone = new THREE.Bone();
    leftLowerArmBone.position.set(-0.25, 0, 0);
    leftLowerArmBone.name = 'leftLowerArm';
    leftUpperArmBone.add(leftLowerArmBone);

    const leftHandBone = new THREE.Bone();
    leftHandBone.position.set(-0.2, 0, 0);
    leftHandBone.name = 'leftHand';
    leftLowerArmBone.add(leftHandBone);

    // RIGHT ARM CHAIN
    const rightShoulderBone = new THREE.Bone();
    rightShoulderBone.position.set(0.1, 0.2, 0);
    rightShoulderBone.name = 'rightShoulder';
    chestBone.add(rightShoulderBone);

    const rightUpperArmBone = new THREE.Bone();
    rightUpperArmBone.position.set(0.15, 0, 0);
    rightUpperArmBone.name = 'rightUpperArm';
    rightShoulderBone.add(rightUpperArmBone);

    const rightLowerArmBone = new THREE.Bone();
    rightLowerArmBone.position.set(0.25, 0, 0);
    rightLowerArmBone.name = 'rightLowerArm';
    rightUpperArmBone.add(rightLowerArmBone);

    const rightHandBone = new THREE.Bone();
    rightHandBone.position.set(0.2, 0, 0);
    rightHandBone.name = 'rightHand';
    rightLowerArmBone.add(rightHandBone);

    // LEFT LEG CHAIN
    const leftUpperLegBone = new THREE.Bone();
    leftUpperLegBone.position.set(-0.1, -0.1, 0);
    leftUpperLegBone.name = 'leftUpperLeg';
    hipsBone.add(leftUpperLegBone);

    const leftLowerLegBone = new THREE.Bone();
    leftLowerLegBone.position.set(0, -0.4, 0);
    leftLowerLegBone.name = 'leftLowerLeg';
    leftUpperLegBone.add(leftLowerLegBone);

    const leftFootBone = new THREE.Bone();
    leftFootBone.position.set(0, -0.3, 0);
    leftFootBone.name = 'leftFoot';
    leftLowerLegBone.add(leftFootBone);

    // RIGHT LEG CHAIN
    const rightUpperLegBone = new THREE.Bone();
    rightUpperLegBone.position.set(0.1, -0.1, 0);
    rightUpperLegBone.name = 'rightUpperLeg';
    hipsBone.add(rightUpperLegBone);

    const rightLowerLegBone = new THREE.Bone();
    rightLowerLegBone.position.set(0, -0.4, 0);
    rightLowerLegBone.name = 'rightLowerLeg';
    rightUpperLegBone.add(rightLowerLegBone);

    const rightFootBone = new THREE.Bone();
    rightFootBone.position.set(0, -0.3, 0);
    rightFootBone.name = 'rightFoot';
    rightLowerLegBone.add(rightFootBone);

    // Create skeleton
    const boneArray = [
        rootBone, hipsBone, spineBone, chestBone, neckBone, headBone,
        leftShoulderBone, leftUpperArmBone, leftLowerArmBone, leftHandBone,
        rightShoulderBone, rightUpperArmBone, rightLowerArmBone, rightHandBone,
        leftUpperLegBone, leftLowerLegBone, leftFootBone,
        rightUpperLegBone, rightLowerLegBone, rightFootBone
    ];

    skeleton = new THREE.Skeleton(boneArray);

    // Create skinned mesh for body
    const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.6, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff69b4,
        skinning: true
    });

    // Add skinning data
    const skinIndices = [];
    const skinWeights = [];
    const position = bodyGeometry.attributes.position;

    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);

        // Weight distribution based on height
        if (y > 0.2) {
            // Upper body - chest bone
            skinIndices.push(3, 2, 0, 0);
            skinWeights.push(0.7, 0.3, 0, 0);
        } else if (y > -0.1) {
            // Mid body - spine bone
            skinIndices.push(2, 1, 3, 0);
            skinWeights.push(0.6, 0.3, 0.1, 0);
        } else {
            // Lower body - hips bone
            skinIndices.push(1, 2, 0, 0);
            skinWeights.push(0.8, 0.2, 0, 0);
        }
    }

    bodyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    bodyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const bodyMesh = new THREE.SkinnedMesh(bodyGeometry, bodyMaterial);
    bodyMesh.add(rootBone);
    bodyMesh.bind(skeleton);
    characterGroup.add(bodyMesh);

    // Create head mesh
    const headGeometry = new THREE.SphereGeometry(0.15, 32, 32);
    const skinMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        roughness: 0.6
    });
    const headMesh = new THREE.Mesh(headGeometry, skinMaterial);
    headMesh.position.set(0, 0.15, 0);
    headBone.add(headMesh);

    // Create eyes as separate objects (not scaled)
    const eyeGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

    const leftEyeMesh = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEyeMesh.position.set(-0.05, 0.18, 0.13);
    leftEyeMesh.name = 'leftEye';
    headBone.add(leftEyeMesh);

    const rightEyeMesh = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEyeMesh.position.set(0.05, 0.18, 0.13);
    rightEyeMesh.name = 'rightEye';
    headBone.add(rightEyeMesh);

    // Create eyelids for blinking
    const eyelidGeometry = new THREE.SphereGeometry(0.032, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const eyelidMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        side: THREE.DoubleSide
    });

    const leftEyelid = new THREE.Mesh(eyelidGeometry, eyelidMaterial);
    leftEyelid.position.copy(leftEyeMesh.position);
    leftEyelid.rotation.x = Math.PI;
    leftEyelid.visible = false;
    leftEyelid.name = 'leftEyelid';
    headBone.add(leftEyelid);

    const rightEyelid = new THREE.Mesh(eyelidGeometry, eyelidMaterial);
    rightEyelid.position.copy(rightEyeMesh.position);
    rightEyelid.rotation.x = Math.PI;
    rightEyelid.visible = false;
    rightEyelid.name = 'rightEyelid';
    headBone.add(rightEyelid);

    // Create arm meshes
    const createArmMesh = (upperArmBone, lowerArmBone, handBone) => {
        const armMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });

        const upperArmGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8);
        const upperArmMesh = new THREE.Mesh(upperArmGeo, armMaterial);
        upperArmMesh.position.set(-0.125, 0, 0);
        upperArmMesh.rotation.z = Math.PI / 2;
        upperArmBone.add(upperArmMesh);

        const lowerArmGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.2, 8);
        const lowerArmMesh = new THREE.Mesh(lowerArmGeo, armMaterial);
        lowerArmMesh.position.set(-0.1, 0, 0);
        lowerArmMesh.rotation.z = Math.PI / 2;
        lowerArmBone.add(lowerArmMesh);

        const handGeo = new THREE.SphereGeometry(0.04, 16, 16);
        const handMesh = new THREE.Mesh(handGeo, armMaterial);
        handMesh.position.set(-0.05, 0, 0);
        handBone.add(handMesh);
    };

    createArmMesh(leftUpperArmBone, leftLowerArmBone, leftHandBone);
    createArmMesh(rightUpperArmBone, rightLowerArmBone, rightHandBone);

    // Create leg meshes
    const createLegMesh = (upperLegBone, lowerLegBone, footBone) => {
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });

        const upperLegGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.4, 8);
        const upperLegMesh = new THREE.Mesh(upperLegGeo, legMaterial);
        upperLegMesh.position.set(0, -0.2, 0);
        upperLegBone.add(upperLegMesh);

        const lowerLegGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.3, 8);
        const lowerLegMesh = new THREE.Mesh(lowerLegGeo, legMaterial);
        lowerLegMesh.position.set(0, -0.15, 0);
        lowerLegBone.add(lowerLegMesh);

        const footGeo = new THREE.BoxGeometry(0.08, 0.05, 0.12);
        const footMesh = new THREE.Mesh(footGeo, legMaterial);
        footMesh.position.set(0, -0.025, 0.03);
        footBone.add(footMesh);
    };

    createLegMesh(leftUpperLegBone, leftLowerLegBone, leftFootBone);
    createLegMesh(rightUpperLegBone, rightLowerLegBone, rightFootBone);

    scene.add(characterGroup);

    // Store bone references
    bones = {
        root: rootBone,
        hips: hipsBone,
        spine: spineBone,
        chest: chestBone,
        neck: neckBone,
        head: headBone,
        leftShoulder: leftShoulderBone,
        leftUpperArm: leftUpperArmBone,
        leftLowerArm: leftLowerArmBone,
        leftHand: leftHandBone,
        rightShoulder: rightShoulderBone,
        rightUpperArm: rightUpperArmBone,
        rightLowerArm: rightLowerArmBone,
        rightHand: rightHandBone,
        leftUpperLeg: leftUpperLegBone,
        leftLowerLeg: leftLowerLegBone,
        leftFoot: leftFootBone,
        rightUpperLeg: rightUpperLegBone,
        rightLowerLeg: rightLowerLegBone,
        rightFoot: rightFootBone,
        leftEye: leftEyeMesh,
        rightEye: rightEyeMesh,
        leftEyelid: leftEyelid,
        rightEyelid: rightEyelid
    };

    // Store initial states
    Object.entries(bones).forEach(([key, bone]) => {
        if (bone) {
            initialBoneStates.set(key, {
                position: bone.position.clone(),
                rotation: bone.rotation.clone(),
                quaternion: bone.quaternion.clone()
            });
        }
    });

    currentVRM = {
        scene: characterGroup,
        humanoid: null,
        expressionManager: null,
        update: (deltaTime) => {}
    };

    setupAnimations();
    document.getElementById('loading').style.display = 'none';
    console.log('Custom rigged character loaded with', Object.keys(bones).length, 'bones');
}

// Setup animations
function setupAnimations() {
    // Breathing animation
    let breatheTime = 0;

    function breatheAnimation() {
        breatheTime += 0.016;

        if (bones.chest) {
            const breatheAmount = Math.sin(breatheTime * 2) * 0.02;
            bones.chest.scale.set(1, 1 + breatheAmount, 1);
        }

        requestAnimationFrame(breatheAnimation);
    }

    breatheAnimation();

    // Start idle blinking
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
    }, 3000 + Math.random() * 2000);
}

function performBlink() {
    blinkEyes(150);
}

// Proper eye blinking using eyelids or VRM expressions
function blinkEyes(duration = 150) {
    if (currentVRM && currentVRM.expressionManager) {
        // Use VRM expression for blinking
        currentVRM.expressionManager.setValue(VRMExpressionPresetName.Blink, 1.0);
        setTimeout(() => {
            currentVRM.expressionManager.setValue(VRMExpressionPresetName.Blink, 0.0);
        }, duration);
    } else if (bones.leftEyelid && bones.rightEyelid) {
        // Use eyelids for custom character
        bones.leftEyelid.visible = true;
        bones.rightEyelid.visible = true;
        bones.leftEye.visible = false;
        bones.rightEye.visible = false;

        setTimeout(() => {
            bones.leftEyelid.visible = false;
            bones.rightEyelid.visible = false;
            bones.leftEye.visible = true;
            bones.rightEye.visible = true;
        }, duration);
    }
}

function closeEyes() {
    if (currentVRM && currentVRM.expressionManager) {
        currentVRM.expressionManager.setValue(VRMExpressionPresetName.Blink, 1.0);
    } else if (bones.leftEyelid && bones.rightEyelid) {
        bones.leftEyelid.visible = true;
        bones.rightEyelid.visible = true;
        bones.leftEye.visible = false;
        bones.rightEye.visible = false;
    }
}

function openEyes() {
    if (currentVRM && currentVRM.expressionManager) {
        currentVRM.expressionManager.setValue(VRMExpressionPresetName.Blink, 0.0);
    } else if (bones.leftEyelid && bones.rightEyelid) {
        bones.leftEyelid.visible = false;
        bones.rightEyelid.visible = false;
        bones.leftEye.visible = true;
        bones.rightEye.visible = true;
    }
}

// Animation helper - rotate bone smoothly
function animateBoneRotation(bone, targetRotation, duration = 500) {
    if (!bone) return Promise.resolve();

    return new Promise((resolve) => {
        const startRotation = bone.rotation.clone();
        const target = new THREE.Euler(
            targetRotation.x !== undefined ? targetRotation.x : startRotation.x,
            targetRotation.y !== undefined ? targetRotation.y : startRotation.y,
            targetRotation.z !== undefined ? targetRotation.z : startRotation.z
        );

        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic

            bone.rotation.x = startRotation.x + (target.x - startRotation.x) * eased;
            bone.rotation.y = startRotation.y + (target.y - startRotation.y) * eased;
            bone.rotation.z = startRotation.z + (target.z - startRotation.z) * eased;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        animate();
    });
}

function resetBone(boneName, duration = 500) {
    const bone = bones[boneName];
    if (!bone) return Promise.resolve();

    const initialState = initialBoneStates.get(boneName);
    if (!initialState) return Promise.resolve();

    return animateBoneRotation(bone, {
        x: initialState.rotation.x,
        y: initialState.rotation.y,
        z: initialState.rotation.z
    }, duration);
}

// Action Animations
const actionAnimations = {
    wave_hand: async () => {
        console.log('Waving hand');

        // Raise arm
        await animateBoneRotation(bones.rightUpperArm, { x: 0, y: 0, z: -Math.PI / 2 }, 400);
        await animateBoneRotation(bones.rightLowerArm, { x: 0, y: 0, z: -Math.PI / 4 }, 300);

        // Wave motion
        for (let i = 0; i < 3; i++) {
            await animateBoneRotation(bones.rightLowerArm, { z: -Math.PI / 6 }, 200);
            await animateBoneRotation(bones.rightLowerArm, { z: -Math.PI / 3 }, 200);
        }

        // Lower arm
        await resetBone('rightLowerArm', 300);
        await resetBone('rightUpperArm', 400);
    },

    raise_hand: async () => {
        console.log('Raising hand');
        await animateBoneRotation(bones.rightUpperArm, { x: 0, y: 0, z: -Math.PI }, 500);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await resetBone('rightUpperArm', 500);
    },

    both_hands_up: async () => {
        console.log('Both hands up');
        await Promise.all([
            animateBoneRotation(bones.leftUpperArm, { x: 0, y: 0, z: Math.PI }, 500),
            animateBoneRotation(bones.rightUpperArm, { x: 0, y: 0, z: -Math.PI }, 500)
        ]);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await Promise.all([
            resetBone('leftUpperArm', 500),
            resetBone('rightUpperArm', 500)
        ]);
    },

    point: async () => {
        console.log('Pointing');
        await animateBoneRotation(bones.rightUpperArm, { x: 0, y: 0.3, z: -Math.PI / 3 }, 500);
        await animateBoneRotation(bones.rightLowerArm, { x: 0, y: 0, z: 0 }, 300);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await resetBone('rightLowerArm', 300);
        await resetBone('rightUpperArm', 500);
    },

    clap: async () => {
        console.log('Clapping');
        // Bring arms to clapping position
        await Promise.all([
            animateBoneRotation(bones.leftUpperArm, { x: 0, y: 0.5, z: Math.PI / 3 }, 300),
            animateBoneRotation(bones.rightUpperArm, { x: 0, y: -0.5, z: -Math.PI / 3 }, 300)
        ]);

        // Clap motion
        for (let i = 0; i < 5; i++) {
            await Promise.all([
                animateBoneRotation(bones.leftUpperArm, { y: 0.3 }, 100),
                animateBoneRotation(bones.rightUpperArm, { y: -0.3 }, 100)
            ]);
            await Promise.all([
                animateBoneRotation(bones.leftUpperArm, { y: 0.5 }, 100),
                animateBoneRotation(bones.rightUpperArm, { y: -0.5 }, 100)
            ]);
        }

        await Promise.all([
            resetBone('leftUpperArm', 400),
            resetBone('rightUpperArm', 400)
        ]);
    },

    blow_kiss: async () => {
        console.log('Blowing kiss');
        // Hand to mouth
        await animateBoneRotation(bones.rightUpperArm, { x: 0.3, y: -0.3, z: -Math.PI / 2 }, 500);
        await animateBoneRotation(bones.rightLowerArm, { x: -0.5, y: 0, z: 0 }, 300);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Extend arm forward
        await animateBoneRotation(bones.rightUpperArm, { x: 0, y: 0.3, z: -Math.PI / 3 }, 400);
        await animateBoneRotation(bones.rightLowerArm, { x: 0, y: 0, z: 0 }, 300);
        await new Promise(resolve => setTimeout(resolve, 800));

        await resetBone('rightLowerArm', 300);
        await resetBone('rightUpperArm', 500);
    },

    blink: async () => {
        console.log('Blinking');
        blinkEyes(150);
        await new Promise(resolve => setTimeout(resolve, 200));
    },

    close_eyes: async () => {
        console.log('Closing eyes');
        closeEyes();
        await new Promise(resolve => setTimeout(resolve, 2000));
        openEyes();
    },

    wink: async () => {
        console.log('Winking');
        if (currentVRM && currentVRM.expressionManager) {
            currentVRM.expressionManager.setValue('blinkLeft', 1.0);
            await new Promise(resolve => setTimeout(resolve, 400));
            currentVRM.expressionManager.setValue('blinkLeft', 0.0);
        } else if (bones.rightEyelid) {
            bones.rightEyelid.visible = true;
            bones.rightEye.visible = false;
            await new Promise(resolve => setTimeout(resolve, 400));
            bones.rightEyelid.visible = false;
            bones.rightEye.visible = true;
        }
    },

    nod: async () => {
        console.log('Nodding');
        for (let i = 0; i < 3; i++) {
            await animateBoneRotation(bones.head, { x: 0.3, y: 0, z: 0 }, 200);
            await animateBoneRotation(bones.head, { x: -0.1, y: 0, z: 0 }, 200);
        }
        await resetBone('head', 300);
    },

    shake_head: async () => {
        console.log('Shaking head');
        for (let i = 0; i < 3; i++) {
            await animateBoneRotation(bones.head, { x: 0, y: 0.4, z: 0 }, 200);
            await animateBoneRotation(bones.head, { x: 0, y: -0.4, z: 0 }, 200);
        }
        await resetBone('head', 300);
    },

    look_left: async () => {
        console.log('Looking left');
        await animateBoneRotation(bones.head, { x: 0, y: 0.6, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await resetBone('head', 500);
    },

    look_right: async () => {
        console.log('Looking right');
        await animateBoneRotation(bones.head, { x: 0, y: -0.6, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await resetBone('head', 500);
    },

    look_up: async () => {
        console.log('Looking up');
        await animateBoneRotation(bones.head, { x: 0.4, y: 0, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await resetBone('head', 500);
    },

    look_down: async () => {
        console.log('Looking down');
        await animateBoneRotation(bones.head, { x: -0.4, y: 0, z: 0 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await resetBone('head', 500);
    },

    tilt_head: async () => {
        console.log('Tilting head');
        await animateBoneRotation(bones.head, { x: 0.2, y: 0, z: 0.4 }, 500);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await resetBone('head', 500);
    },

    jump: async () => {
        console.log('Jumping');
        if (!currentVRM) return;

        const jumpHeight = 0.3;
        const duration = 600;
        const rootPos = bones.root ? bones.root.position : currentVRM.scene.position;
        const startY = rootPos.y;
        const startTime = Date.now();

        return new Promise((resolve) => {
            function animate() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const jumpProgress = Math.sin(progress * Math.PI);

                rootPos.y = startY + jumpProgress * jumpHeight;

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    rootPos.y = startY;
                    resolve();
                }
            }
            animate();
        });
    },

    walk_forward: async () => {
        console.log('Walking forward');
        const steps = 4;
        for (let i = 0; i < steps; i++) {
            // Left leg forward
            await Promise.all([
                animateBoneRotation(bones.leftUpperLeg, { x: 0.5, y: 0, z: 0 }, 200),
                animateBoneRotation(bones.rightUpperLeg, { x: -0.3, y: 0, z: 0 }, 200),
                animateBoneRotation(bones.leftUpperArm, { x: -0.3, y: 0, z: 0 }, 200),
                animateBoneRotation(bones.rightUpperArm, { x: 0.3, y: 0, z: 0 }, 200)
            ]);

            // Right leg forward
            await Promise.all([
                animateBoneRotation(bones.leftUpperLeg, { x: -0.3, y: 0, z: 0 }, 200),
                animateBoneRotation(bones.rightUpperLeg, { x: 0.5, y: 0, z: 0 }, 200),
                animateBoneRotation(bones.leftUpperArm, { x: 0.3, y: 0, z: 0 }, 200),
                animateBoneRotation(bones.rightUpperArm, { x: -0.3, y: 0, z: 0 }, 200)
            ]);
        }

        await Promise.all([
            resetBone('leftUpperLeg', 300),
            resetBone('rightUpperLeg', 300),
            resetBone('leftUpperArm', 300),
            resetBone('rightUpperArm', 300)
        ]);
    },

    spin: async () => {
        console.log('Spinning');
        const spinBone = bones.hips || bones.root;
        if (!spinBone) return;

        const startRotation = spinBone.rotation.y;
        const duration = 1000;
        const startTime = Date.now();

        return new Promise((resolve) => {
            function animate() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                spinBone.rotation.y = startRotation + (Math.PI * 2 * progress);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    spinBone.rotation.y = startRotation;
                    resolve();
                }
            }
            animate();
        });
    },

    idle: async () => {
        console.log('Returning to idle');
        const resetPromises = Object.keys(bones)
            .filter(key => !key.includes('eye') && !key.includes('eyelid'))
            .map(key => resetBone(key, 500));
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

// Play emotion
function playEmotion(emotion) {
    currentEmotion = emotion;

    const emotionIndicator = document.getElementById('emotion-indicator');
    emotionIndicator.textContent = `${emotion}`;
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

    addMessage(message, true);
    chatInput.value = '';
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
        addMessage('Hi! I can move my entire body now - arms, legs, hands, and eyes! Ask me to do something!', false);
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
    addMessage('Hi! I can move my entire body now - arms, legs, hands, and eyes! Ask me to do something!', false);
    playEmotion('happy');
    playActions(['wave_hand']);
}, 1000);
