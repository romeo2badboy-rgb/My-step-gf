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
let isAnimating = false;

// Bone references
let bones = {};
let skeleton = null;
let skinnedMesh = null;

// Animation clips
let animationClips = {};

// Initialize Three.js scene
function initScene() {
    const canvas = document.getElementById('character-canvas');
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(
        40,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.4, 3);

    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(2, 3, 2);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-2, 2, -2);
    scene.add(directionalLight2);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 6;
    controls.update();

    window.addEventListener('resize', onWindowResize);
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

    if (currentVRM) {
        currentVRM.update(deltaTime);
    }

    if (mixer) {
        mixer.update(deltaTime);
    }

    controls.update();
    renderer.render(scene, camera);
}

// Load VRM Model
async function loadVRMModel() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    try {
        document.getElementById('loading').textContent = 'Loading your waifu...';

        const modelUrls = [
            'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
            'https://pixiv.github.io/three-vrm/packages/three-vrm/examples/models/three-vrm-girl.vrm'
        ];

        let gltf = null;
        for (const url of modelUrls) {
            try {
                console.log('Trying to load VRM:', url);
                gltf = await loader.loadAsync(url);
                break;
            } catch (e) {
                console.log('Failed, trying next...');
            }
        }

        if (!gltf) throw new Error('Could not load VRM');

        const vrm = gltf.userData.vrm;

        if (vrm) {
            if (vrm.meta?.metaVersion === '0') {
                VRMUtils.rotateVRM0(vrm);
            }

            scene.add(vrm.scene);
            currentVRM = vrm;

            setupVRMBones();
            setupVRMAnimations();

            document.getElementById('loading').style.display = 'none';
            console.log('✓ VRM loaded with', Object.keys(bones).length, 'bones');
        }
    } catch (error) {
        console.error('VRM loading failed:', error);
        document.getElementById('loading').textContent = 'Creating custom character...';
        loadCustomCharacter();
    }
}

function setupVRMBones() {
    if (!currentVRM || !currentVRM.humanoid) return;

    const humanoid = currentVRM.humanoid;
    const boneNames = ['hips', 'spine', 'chest', 'neck', 'head',
        'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
        'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
        'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
        'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];

    boneNames.forEach(name => {
        const bone = humanoid.getNormalizedBoneNode(name);
        if (bone) bones[name] = bone;
    });

    // Create mixer for VRM animations
    mixer = new THREE.AnimationMixer(currentVRM.scene);
}

function setupVRMAnimations() {
    // Create animation clips for VRM
    createVRMWaveAnimation();
    createVRMNodAnimation();
    createVRMJumpAnimation();
    console.log('✓ Animations created:', Object.keys(animationClips).length);
}

function createVRMWaveAnimation() {
    if (!bones.rightUpperArm) return;

    const duration = 2.5;
    const times = [0, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 2.0, 2.5];

    // Store initial quaternion
    const initialQuat = bones.rightUpperArm.quaternion.clone();

    // Create rotation quaternions
    const armUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
    const wave1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, -Math.PI / 2));
    const wave2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, -Math.PI / 2));

    const values = [];
    [
        initialQuat,  // 0s - start
        armUp,        // 0.3s - raise arm
        wave1,        // 0.5s - wave
        wave2,        // 0.7s
        wave1,        // 0.9s
        wave2,        // 1.1s
        wave1,        // 1.3s
        armUp,        // 1.5s - stop waving
        armUp,        // 2.0s - hold
        initialQuat   // 2.5s - return
    ].forEach(q => {
        values.push(q.x, q.y, q.z, q.w);
    });

    const track = new THREE.QuaternionKeyframeTrack(
        bones.rightUpperArm.name + '.quaternion',
        times,
        values
    );

    animationClips.wave_hand = new THREE.AnimationClip('wave_hand', duration, [track]);
}

function createVRMNodAnimation() {
    if (!bones.head) return;

    const duration = 1.5;
    const times = [0, 0.3, 0.6, 0.9, 1.2, 1.5];

    const initialQuat = bones.head.quaternion.clone();
    const nodDown = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0));
    const nodUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0));

    const values = [];
    [initialQuat, nodDown, nodUp, nodDown, nodUp, initialQuat].forEach(q => {
        values.push(q.x, q.y, q.z, q.w);
    });

    const track = new THREE.QuaternionKeyframeTrack(
        bones.head.name + '.quaternion',
        times,
        values
    );

    animationClips.nod = new THREE.AnimationClip('nod', duration, [track]);
}

function createVRMJumpAnimation() {
    if (!bones.hips) return;

    const duration = 0.8;
    const times = [0, 0.2, 0.4, 0.6, 0.8];
    const values = [0, 0, 0,  0, 0.3, 0,  0, 0.5, 0,  0, 0.3, 0,  0, 0, 0];

    const track = new THREE.VectorKeyframeTrack(
        bones.hips.name + '.position',
        times,
        values
    );

    animationClips.jump = new THREE.AnimationClip('jump', duration, [track]);
}

// Load custom rigged character with PROPER T-POSE
function loadCustomCharacter() {
    const characterGroup = new THREE.Group();

    // Create skeleton in T-POSE (arms out to sides)
    const rootBone = new THREE.Bone();
    rootBone.name = 'root';
    rootBone.position.set(0, 0, 0);

    const hipsBone = new THREE.Bone();
    hipsBone.name = 'hips';
    hipsBone.position.set(0, 1.0, 0);
    rootBone.add(hipsBone);

    const spineBone = new THREE.Bone();
    spineBone.name = 'spine';
    spineBone.position.set(0, 0.15, 0);
    hipsBone.add(spineBone);

    const chestBone = new THREE.Bone();
    chestBone.name = 'chest';
    chestBone.position.set(0, 0.15, 0);
    spineBone.add(chestBone);

    const neckBone = new THREE.Bone();
    neckBone.name = 'neck';
    neckBone.position.set(0, 0.2, 0);
    chestBone.add(neckBone);

    const headBone = new THREE.Bone();
    headBone.name = 'head';
    headBone.position.set(0, 0.1, 0);
    neckBone.add(headBone);

    // RIGHT ARM - T-POSE (extending to the RIGHT)
    const rightShoulderBone = new THREE.Bone();
    rightShoulderBone.name = 'rightShoulder';
    rightShoulderBone.position.set(0.15, 0.15, 0);
    chestBone.add(rightShoulderBone);

    const rightUpperArmBone = new THREE.Bone();
    rightUpperArmBone.name = 'rightUpperArm';
    rightUpperArmBone.position.set(0.05, 0, 0); // extends RIGHT
    rightShoulderBone.add(rightUpperArmBone);

    const rightLowerArmBone = new THREE.Bone();
    rightLowerArmBone.name = 'rightLowerArm';
    rightLowerArmBone.position.set(0.25, 0, 0); // extends RIGHT
    rightUpperArmBone.add(rightLowerArmBone);

    const rightHandBone = new THREE.Bone();
    rightHandBone.name = 'rightHand';
    rightHandBone.position.set(0.2, 0, 0); // extends RIGHT
    rightLowerArmBone.add(rightHandBone);

    // LEFT ARM - T-POSE (extending to the LEFT)
    const leftShoulderBone = new THREE.Bone();
    leftShoulderBone.name = 'leftShoulder';
    leftShoulderBone.position.set(-0.15, 0.15, 0);
    chestBone.add(leftShoulderBone);

    const leftUpperArmBone = new THREE.Bone();
    leftUpperArmBone.name = 'leftUpperArm';
    leftUpperArmBone.position.set(-0.05, 0, 0); // extends LEFT
    leftShoulderBone.add(leftUpperArmBone);

    const leftLowerArmBone = new THREE.Bone();
    leftLowerArmBone.name = 'leftLowerArm';
    leftLowerArmBone.position.set(-0.25, 0, 0); // extends LEFT
    leftUpperArmBone.add(leftLowerArmBone);

    const leftHandBone = new THREE.Bone();
    leftHandBone.name = 'leftHand';
    leftHandBone.position.set(-0.2, 0, 0); // extends LEFT
    leftLowerArmBone.add(leftHandBone);

    // LEGS
    const rightUpperLegBone = new THREE.Bone();
    rightUpperLegBone.name = 'rightUpperLeg';
    rightUpperLegBone.position.set(0.1, 0, 0);
    hipsBone.add(rightUpperLegBone);

    const rightLowerLegBone = new THREE.Bone();
    rightLowerLegBone.name = 'rightLowerLeg';
    rightLowerLegBone.position.set(0, -0.4, 0);
    rightUpperLegBone.add(rightLowerLegBone);

    const rightFootBone = new THREE.Bone();
    rightFootBone.name = 'rightFoot';
    rightFootBone.position.set(0, -0.4, 0);
    rightLowerLegBone.add(rightFootBone);

    const leftUpperLegBone = new THREE.Bone();
    leftUpperLegBone.name = 'leftUpperLeg';
    leftUpperLegBone.position.set(-0.1, 0, 0);
    hipsBone.add(leftUpperLegBone);

    const leftLowerLegBone = new THREE.Bone();
    leftLowerLegBone.name = 'leftLowerLeg';
    leftLowerLegBone.position.set(0, -0.4, 0);
    leftUpperLegBone.add(leftLowerLegBone);

    const leftFootBone = new THREE.Bone();
    leftFootBone.name = 'leftFoot';
    leftFootBone.position.set(0, -0.4, 0);
    leftLowerLegBone.add(leftFootBone);

    const boneArray = [
        rootBone, hipsBone, spineBone, chestBone, neckBone, headBone,
        rightShoulderBone, rightUpperArmBone, rightLowerArmBone, rightHandBone,
        leftShoulderBone, leftUpperArmBone, leftLowerArmBone, leftHandBone,
        rightUpperLegBone, rightLowerLegBone, rightFootBone,
        leftUpperLegBone, leftLowerLegBone, leftFootBone
    ];

    skeleton = new THREE.Skeleton(boneArray);

    // Store bone references
    bones = {
        root: rootBone,
        hips: hipsBone,
        spine: spineBone,
        chest: chestBone,
        neck: neckBone,
        head: headBone,
        rightShoulder: rightShoulderBone,
        rightUpperArm: rightUpperArmBone,
        rightLowerArm: rightLowerArmBone,
        rightHand: rightHandBone,
        leftShoulder: leftShoulderBone,
        leftUpperArm: leftUpperArmBone,
        leftLowerArm: leftLowerArmBone,
        leftHand: leftHandBone,
        rightUpperLeg: rightUpperLegBone,
        rightLowerLeg: rightLowerLegBone,
        rightFoot: rightFootBone,
        leftUpperLeg: leftUpperLegBone,
        leftLowerLeg: leftLowerLegBone,
        leftFoot: leftFootBone
    };

    // Create skinned body mesh
    const bodyGeometry = new THREE.CylinderGeometry(0.18, 0.22, 0.6, 16, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff69b4,
        skinning: true
    });

    const position = bodyGeometry.attributes.position;
    const skinIndices = [];
    const skinWeights = [];

    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);

        if (y > 0.2) {
            skinIndices.push(3, 2, 0, 0);
            skinWeights.push(0.8, 0.2, 0, 0);
        } else if (y > -0.1) {
            skinIndices.push(2, 1, 3, 0);
            skinWeights.push(0.7, 0.2, 0.1, 0);
        } else {
            skinIndices.push(1, 2, 0, 0);
            skinWeights.push(0.9, 0.1, 0, 0);
        }
    }

    bodyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    bodyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    skinnedMesh = new THREE.SkinnedMesh(bodyGeometry, bodyMaterial);
    skinnedMesh.add(rootBone);
    skinnedMesh.bind(skeleton);
    characterGroup.add(skinnedMesh);

    // Add head
    const headGeo = new THREE.SphereGeometry(0.15, 32, 32);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.set(0, 0.15, 0);
    headBone.add(headMesh);

    // Add eyes
    const eyeGeo = new THREE.SphereGeometry(0.03, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });

    const leftEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    leftEyeMesh.position.set(-0.05, 0.18, 0.13);
    headBone.add(leftEyeMesh);

    const rightEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    rightEyeMesh.position.set(0.05, 0.18, 0.13);
    headBone.add(rightEyeMesh);

    // Eyelids
    const eyelidGeo = new THREE.SphereGeometry(0.032, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const eyelidMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, side: THREE.DoubleSide });

    const leftEyelid = new THREE.Mesh(eyelidGeo, eyelidMat);
    leftEyelid.position.copy(leftEyeMesh.position);
    leftEyelid.rotation.x = Math.PI;
    leftEyelid.visible = false;
    leftEyelid.name = 'leftEyelid';
    headBone.add(leftEyelid);

    const rightEyelid = new THREE.Mesh(eyelidGeo, eyelidMat);
    rightEyelid.position.copy(rightEyeMesh.position);
    rightEyelid.rotation.x = Math.PI;
    rightEyelid.visible = false;
    rightEyelid.name = 'rightEyelid';
    headBone.add(rightEyelid);

    bones.leftEye = leftEyeMesh;
    bones.rightEye = rightEyeMesh;
    bones.leftEyelid = leftEyelid;
    bones.rightEyelid = rightEyelid;

    // Add arm meshes
    const createArmVisual = (upperArm, lowerArm, hand, side) => {
        const armMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });

        const upperArmGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8);
        const upperArmMesh = new THREE.Mesh(upperArmGeo, armMat);
        upperArmMesh.rotation.z = side === 'right' ? -Math.PI / 2 : Math.PI / 2;
        upperArmMesh.position.x = side === 'right' ? 0.125 : -0.125;
        upperArm.add(upperArmMesh);

        const lowerArmGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.2, 8);
        const lowerArmMesh = new THREE.Mesh(lowerArmGeo, armMat);
        lowerArmMesh.rotation.z = side === 'right' ? -Math.PI / 2 : Math.PI / 2;
        lowerArmMesh.position.x = side === 'right' ? 0.1 : -0.1;
        lowerArm.add(lowerArmMesh);

        const handGeo = new THREE.SphereGeometry(0.04, 16, 16);
        const handMesh = new THREE.Mesh(handGeo, armMat);
        handMesh.position.x = side === 'right' ? 0.05 : -0.05;
        hand.add(handMesh);
    };

    createArmVisual(rightUpperArmBone, rightLowerArmBone, rightHandBone, 'right');
    createArmVisual(leftUpperArmBone, leftLowerArmBone, leftHandBone, 'left');

    // Add leg meshes
    const createLegVisual = (upperLeg, lowerLeg, foot) => {
        const legMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });

        const upperLegGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.4, 8);
        const upperLegMesh = new THREE.Mesh(upperLegGeo, legMat);
        upperLegMesh.position.y = -0.2;
        upperLeg.add(upperLegMesh);

        const lowerLegGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.4, 8);
        const lowerLegMesh = new THREE.Mesh(lowerLegGeo, legMat);
        lowerLegMesh.position.y = -0.2;
        lowerLeg.add(lowerLegMesh);

        const footGeo = new THREE.BoxGeometry(0.08, 0.05, 0.12);
        const footMesh = new THREE.Mesh(footGeo, legMat);
        footMesh.position.set(0, -0.025, 0.03);
        foot.add(footMesh);
    };

    createLegVisual(rightUpperLegBone, rightLowerLegBone, rightFootBone);
    createLegVisual(leftUpperLegBone, leftLowerLegBone, leftFootBone);

    scene.add(characterGroup);

    currentVRM = {
        scene: characterGroup,
        humanoid: null,
        expressionManager: null,
        update: () => {}
    };

    // Create animation mixer
    mixer = new THREE.AnimationMixer(characterGroup);

    // Create animations with keyframes
    createCustomAnimations();

    // Start breathing
    startBreathing();

    document.getElementById('loading').style.display = 'none';
    console.log('✓ Custom character loaded with', Object.keys(bones).length, 'bones');
    console.log('✓ Animations created:', Object.keys(animationClips).length);
}

function createCustomAnimations() {
    // WAVE HAND - proper animation!
    if (bones.rightUpperArm) {
        const duration = 2.5;
        const times = [0, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.8, 2.5];

        // Wave using Z-axis rotation (arm goes DOWN and UP)
        const restQuat = new THREE.Quaternion();
        const armUpQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2.5)); // arm up
        const wave1Quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, Math.PI / 2.5)); // wave
        const wave2Quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.4, Math.PI / 2.5)); // wave

        const values = [];
        [restQuat, armUpQuat, wave1Quat, wave2Quat, wave1Quat, wave2Quat, wave1Quat, armUpQuat, restQuat].forEach(q => {
            values.push(q.x, q.y, q.z, q.w);
        });

        const track = new THREE.QuaternionKeyframeTrack(
            'rightUpperArm.quaternion',
            times,
            values
        );

        animationClips.wave_hand = new THREE.AnimationClip('wave_hand', duration, [track]);
    }

    // RAISE HAND
    if (bones.rightUpperArm) {
        const duration = 2.0;
        const times = [0, 0.5, 1.5, 2.0];

        const restQuat = new THREE.Quaternion();
        const armUpQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI)); // straight up

        const values = [];
        [restQuat, armUpQuat, armUpQuat, restQuat].forEach(q => {
            values.push(q.x, q.y, q.z, q.w);
        });

        const track = new THREE.QuaternionKeyframeTrack(
            'rightUpperArm.quaternion',
            times,
            values
        );

        animationClips.raise_hand = new THREE.AnimationClip('raise_hand', duration, [track]);
    }

    // BOTH HANDS UP
    if (bones.leftUpperArm && bones.rightUpperArm) {
        const duration = 2.0;
        const times = [0, 0.5, 1.5, 2.0];

        const restQuat = new THREE.Quaternion();
        const armUpQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI));

        const values = [];
        [restQuat, armUpQuat, armUpQuat, restQuat].forEach(q => {
            values.push(q.x, q.y, q.z, q.w);
        });

        const trackLeft = new THREE.QuaternionKeyframeTrack('leftUpperArm.quaternion', times, values);
        const trackRight = new THREE.QuaternionKeyframeTrack('rightUpperArm.quaternion', times, values);

        animationClips.both_hands_up = new THREE.AnimationClip('both_hands_up', duration, [trackLeft, trackRight]);
    }

    // CLAP
    if (bones.leftUpperArm && bones.rightUpperArm) {
        const duration = 2.0;
        const times = [0, 0.3, 0.5, 0.65, 0.8, 0.95, 1.1, 1.25, 1.5, 2.0];

        const restQuat = new THREE.Quaternion();
        const clapPosLeft = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.8, Math.PI / 3));
        const clapPosRight = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.8, Math.PI / 3));
        const clapTogetherLeft = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, Math.PI / 3));
        const clapTogetherRight = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.3, Math.PI / 3));

        const valuesLeft = [];
        const valuesRight = [];

        [restQuat, clapPosLeft, clapTogetherLeft, clapPosLeft, clapTogetherLeft, clapPosLeft, clapTogetherLeft, clapPosLeft, clapPosLeft, restQuat].forEach(q => {
            valuesLeft.push(q.x, q.y, q.z, q.w);
        });

        [restQuat, clapPosRight, clapTogetherRight, clapPosRight, clapTogetherRight, clapPosRight, clapTogetherRight, clapPosRight, clapPosRight, restQuat].forEach(q => {
            valuesRight.push(q.x, q.y, q.z, q.w);
        });

        const trackLeft = new THREE.QuaternionKeyframeTrack('leftUpperArm.quaternion', times, valuesLeft);
        const trackRight = new THREE.QuaternionKeyframeTrack('rightUpperArm.quaternion', times, valuesRight);

        animationClips.clap = new THREE.AnimationClip('clap', duration, [trackLeft, trackRight]);
    }

    // NOD HEAD
    if (bones.head) {
        const duration = 1.5;
        const times = [0, 0.3, 0.6, 0.9, 1.2, 1.5];

        const restQuat = new THREE.Quaternion();
        const nodDown = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0));
        const nodUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0));

        const values = [];
        [restQuat, nodDown, nodUp, nodDown, nodUp, restQuat].forEach(q => {
            values.push(q.x, q.y, q.z, q.w);
        });

        const track = new THREE.QuaternionKeyframeTrack('head.quaternion', times, values);
        animationClips.nod = new THREE.AnimationClip('nod', duration, [track]);
    }

    // SHAKE HEAD
    if (bones.head) {
        const duration = 1.5;
        const times = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];

        const restQuat = new THREE.Quaternion();
        const shakeLeft = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0));
        const shakeRight = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.5, 0));

        const values = [];
        [restQuat, shakeLeft, restQuat, shakeRight, restQuat, shakeLeft, restQuat].forEach(q => {
            values.push(q.x, q.y, q.z, q.w);
        });

        const track = new THREE.QuaternionKeyframeTrack('head.quaternion', times, values);
        animationClips.shake_head = new THREE.AnimationClip('shake_head', duration, [track]);
    }

    // JUMP
    if (bones.hips) {
        const duration = 0.8;
        const times = [0, 0.2, 0.4, 0.6, 0.8];
        const values = [0, 0, 0,  0, 0.3, 0,  0, 0.5, 0,  0, 0.3, 0,  0, 0, 0];

        const track = new THREE.VectorKeyframeTrack('hips.position', times, values);
        animationClips.jump = new THREE.AnimationClip('jump', duration, [track]);
    }

    // LOOK LEFT
    if (bones.head) {
        const duration = 2.5;
        const times = [0, 0.5, 2.0, 2.5];

        const restQuat = new THREE.Quaternion();
        const lookLeft = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, 0));

        const values = [];
        [restQuat, lookLeft, lookLeft, restQuat].forEach(q => {
            values.push(q.x, q.y, q.z, q.w);
        });

        const track = new THREE.QuaternionKeyframeTrack('head.quaternion', times, values);
        animationClips.look_left = new THREE.AnimationClip('look_left', duration, [track]);
    }

    // LOOK RIGHT
    if (bones.head) {
        const duration = 2.5;
        const times = [0, 0.5, 2.0, 2.5];

        const restQuat = new THREE.Quaternion();
        const lookRight = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.7, 0));

        const values = [];
        [restQuat, lookRight, lookRight, restQuat].forEach(q => {
            values.push(q.x, q.y, q.z, q.w);
        });

        const track = new THREE.QuaternionKeyframeTrack('head.quaternion', times, values);
        animationClips.look_right = new THREE.AnimationClip('look_right', duration, [track]);
    }

    // POINT
    if (bones.rightUpperArm && bones.rightLowerArm) {
        const duration = 2.5;
        const times = [0, 0.5, 2.0, 2.5];

        const restQuat = new THREE.Quaternion();
        const pointArmQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.5, Math.PI / 4));

        const valuesArm = [];
        [restQuat, pointArmQuat, pointArmQuat, restQuat].forEach(q => {
            valuesArm.push(q.x, q.y, q.z, q.w);
        });

        const trackArm = new THREE.QuaternionKeyframeTrack('rightUpperArm.quaternion', times, valuesArm);
        animationClips.point = new THREE.AnimationClip('point', duration, [trackArm]);
    }
}

function startBreathing() {
    let time = 0;

    function breathe() {
        time += 0.016;

        if (bones.chest) {
            const breathAmount = Math.sin(time * 2) * 0.015 + 1;
            bones.chest.scale.set(1, breathAmount, 1);
        }

        requestAnimationFrame(breathe);
    }

    breathe();
}

// Play animation by name
async function playAnimation(actionName) {
    if (!mixer || !animationClips[actionName]) {
        console.warn('Animation not found:', actionName);
        return;
    }

    return new Promise((resolve) => {
        mixer.stopAllAction();

        const clip = animationClips[actionName];
        const action = mixer.clipAction(clip);

        action.reset();
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;

        mixer.addEventListener('finished', function onFinished() {
            mixer.removeEventListener('finished', onFinished);
            resolve();
        });

        action.play();
        console.log('▶ Playing:', actionName);
    });
}

// Eye animations
function blinkEyes() {
    if (currentVRM && currentVRM.expressionManager) {
        currentVRM.expressionManager.setValue(VRMExpressionPresetName.Blink, 1.0);
        setTimeout(() => {
            currentVRM.expressionManager.setValue(VRMExpressionPresetName.Blink, 0.0);
        }, 150);
    } else if (bones.leftEyelid && bones.rightEyelid) {
        bones.leftEyelid.visible = true;
        bones.rightEyelid.visible = true;
        bones.leftEye.visible = false;
        bones.rightEye.visible = false;

        setTimeout(() => {
            bones.leftEyelid.visible = false;
            bones.rightEyelid.visible = false;
            bones.leftEye.visible = true;
            bones.rightEye.visible = true;
        }, 150);
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

// Auto blink
setInterval(() => {
    if (!isAnimating) blinkEyes();
}, 3000 + Math.random() * 2000);

// Action handlers
const actionAnimations = {
    wave_hand: async () => await playAnimation('wave_hand'),
    raise_hand: async () => await playAnimation('raise_hand'),
    both_hands_up: async () => await playAnimation('both_hands_up'),
    clap: async () => await playAnimation('clap'),
    nod: async () => await playAnimation('nod'),
    shake_head: async () => await playAnimation('shake_head'),
    look_left: async () => await playAnimation('look_left'),
    look_right: async () => await playAnimation('look_right'),
    point: async () => await playAnimation('point'),
    jump: async () => await playAnimation('jump'),

    blink: async () => {
        blinkEyes();
        await new Promise(r => setTimeout(r, 200));
    },

    close_eyes: async () => {
        closeEyes();
        await new Promise(r => setTimeout(r, 2000));
        openEyes();
    },

    wink: async () => {
        if (bones.rightEyelid) {
            bones.rightEyelid.visible = true;
            bones.rightEye.visible = false;
            await new Promise(r => setTimeout(r, 400));
            bones.rightEyelid.visible = false;
            bones.rightEye.visible = true;
        }
    }
};

async function playActions(actions) {
    if (!actions || actions.length === 0) return;

    isAnimating = true;

    for (const action of actions) {
        const actionName = action.toLowerCase().trim();
        if (actionAnimations[actionName]) {
            try {
                await actionAnimations[actionName]();
            } catch (error) {
                console.error('Error playing action:', actionName, error);
            }
        } else {
            console.warn('Unknown action:', actionName);
        }
    }

    isAnimating = false;
}

function playEmotion(emotion) {
    currentEmotion = emotion;
    const indicator = document.getElementById('emotion-indicator');
    indicator.textContent = emotion;
    indicator.style.display = 'block';
    setTimeout(() => indicator.style.display = 'none', 3000);
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
    if (typingIndicator) typingIndicator.remove();
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();
        removeTypingIndicator();

        if (data.error) {
            addMessage('Sorry, I encountered an error!', false);
        } else {
            addMessage(data.response, false);
            playEmotion(data.emotion);

            if (data.actions && data.actions.length > 0) {
                console.log('▶ Actions:', data.actions);
                playActions(data.actions);
            }
        }
    } catch (error) {
        removeTypingIndicator();
        addMessage('Could not connect to server!', false);
        console.error('Error:', error);
    }
}

async function resetConversation() {
    try {
        await fetch('/api/reset', { method: 'POST' });
        chatMessages.innerHTML = '';
        addMessage('Hi! I have PROPER skeletal rigging now! My arms and body move naturally! Try asking me to wave or clap!', false);
        playEmotion('happy');
        playActions(['wave_hand']);
    } catch (error) {
        console.error('Error resetting:', error);
    }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
resetBtn.addEventListener('click', resetConversation);

// Initialize
initScene();
loadVRMModel();

setTimeout(() => {
    addMessage('Hi! I have PROPER skeletal rigging now! My arms and body move naturally! Try asking me to wave or clap!', false);
    playEmotion('happy');
    playActions(['wave_hand']);
}, 1000);
