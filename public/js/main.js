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
let idleAnimation = null;
let emotionAnimations = {};

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

            // Setup animations
            setupAnimations();

            document.getElementById('loading').style.display = 'none';
            console.log('VRM model loaded successfully!');
        }
    } catch (error) {
        console.error('Error loading VRM model:', error);
        document.getElementById('loading').textContent =
            'Could not load model. Using fallback character...';
        loadFallbackModel();
    }
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
    characterGroup.add(head);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.1, 1.55, 0.25);
    characterGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.1, 1.55, 0.25);
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

    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8);

    const leftArm = new THREE.Mesh(armGeometry, skinMaterial);
    leftArm.position.set(-0.35, 0.8, 0);
    leftArm.rotation.z = 0.3;
    characterGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, skinMaterial);
    rightArm.position.set(0.35, 0.8, 0);
    rightArm.rotation.z = -0.3;
    characterGroup.add(rightArm);

    scene.add(characterGroup);
    currentVRM = { scene: characterGroup, head: head, leftEye: leftEye, rightEye: rightEye };

    document.getElementById('loading').style.display = 'none';
    console.log('Fallback character loaded');
}

// Setup basic idle animation
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

    // Different animation behaviors based on emotion
    if (currentVRM && currentVRM.scene) {
        const targetRotation = getEmotionRotation(emotion);
        animateToRotation(currentVRM.scene, targetRotation);
    }

    console.log(`Playing emotion: ${emotion}`);
}

function getEmotionRotation(emotion) {
    const rotations = {
        neutral: { x: 0, y: 0, z: 0 },
        happy: { x: 0.1, y: 0.1, z: 0 },
        excited: { x: 0.15, y: 0.15, z: 0.05 },
        shy: { x: 0.2, y: -0.2, z: 0.1 },
        thinking: { x: 0.1, y: -0.3, z: 0 },
        surprised: { x: 0.2, y: 0, z: 0 },
        sad: { x: -0.2, y: -0.1, z: 0 },
        loving: { x: 0.15, y: 0, z: 0.1 }
    };

    return rotations[emotion] || rotations.neutral;
}

function animateToRotation(object, targetRotation, duration = 1000) {
    const startRotation = {
        x: object.rotation.x,
        y: object.rotation.y,
        z: object.rotation.z
    };

    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function
        const eased = 1 - Math.pow(1 - progress, 3);

        object.rotation.x = startRotation.x + (targetRotation.x - startRotation.x) * eased;
        object.rotation.y = startRotation.y + (targetRotation.y - startRotation.y) * eased;
        object.rotation.z = startRotation.z + (targetRotation.z - startRotation.z) * eased;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Return to neutral after 2 seconds
            setTimeout(() => {
                animateToRotation(object, { x: 0, y: 0, z: 0 }, 1500);
            }, 2000);
        }
    }

    animate();
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
        addMessage('Hi! I\'m your AI waifu companion! How can I make you smile today?', false);
        playEmotion('happy');
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
    addMessage('Hi! I\'m your AI waifu companion! How can I make you smile today?', false);
    playEmotion('happy');
}, 1000);
