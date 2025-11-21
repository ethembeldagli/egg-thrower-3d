// Import GLTFLoader
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 3D Models
let chickenModel = null;
let stickmanModel = null;
let chefModel = null;
let modelsLoaded = false;
const loader = new GLTFLoader();

// Game State
let joystickInput = { x: 0, y: 0 }; // Store normalized joystick input
let lastHealthDrain = Date.now();

const gameState = {
    health: 100,
    maxHealth: 100,
    energy: 200,
    maxEnergy: 200,
    ep: 0,
    level: 1,
    currentWeapon: 0,
    weapons: [
        { name: 'Hand', level: 1, epRequired: 0, type: 'manual', eggsPerShot: 1, unlocked: true },
        { name: 'Cardboard Launcher', level: 2, epRequired: 100, type: 'auto', eggsPerShot: 1, fireRate: 0.5, unlocked: false },
        { name: 'Plastic Launcher', level: 3, epRequired: 500, type: 'auto', eggsPerShot: 2, fireRate: 0.3, unlocked: false },
        { name: 'Metal Launcher', level: 4, epRequired: 3000, type: 'auto', eggsPerShot: 5, fireRate: 0.1, unlocked: false },
        { name: 'Egg RPG', level: 6, epRequired: 10000, type: 'manual', eggsPerShot: 200, unlocked: false },
        { name: 'Egg Nuke', level: 7, epRequired: 60000, type: 'manual', eggsPerShot: 1000, unlocked: false }
    ],
    isFirstPerson: true,
    gameStarted: false,
    isShooting: false,
    lastShootTime: 0,
    lastEnergyDrain: Date.now(),
    isDead: false
};

// Three.js Setup
let scene, camera, renderer, player;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
const clock = new THREE.Clock();

// Game Objects
const eggs = [];
const npcs = [];
const chefs = [];
const foodItems = [];

// Input
let mouseX = 0, mouseY = 0;
let isPointerLocked = false;
let cameraRotation = { yaw: 0, pitch: 0 }; // Camera euler angles
const MOUSE_SENSITIVITY = 0.005;
const TOUCH_SENSITIVITY = 0.007;

// Touch look controls
let touchLookActive = false;
let lastTouchX = 0;
let lastTouchY = 0;

// Load 3D Models
function loadModels() {
    return new Promise((resolve) => {
        let loadedCount = 0;
        const totalModels = 3;
        
        const updateProgress = () => {
            loadedCount++;
            const progress = Math.round((loadedCount / totalModels) * 100);
            document.getElementById('loadingProgress').textContent = progress + '%';
            if (loadedCount === totalModels) {
                modelsLoaded = true;
                document.getElementById('loadingIndicator').style.display = 'none';
                resolve();
            }
        };
        
        // Load chicken model
        loader.load(
            'https://cdn.jsdelivr.net/gh/ethembeldagli/egg-thrower-3d@main/chicken.glb',
            (gltf) => {
                chickenModel = gltf.scene;
                chickenModel.scale.set(0.5, 0.5, 0.5);
                console.log('Chicken model loaded');
                updateProgress();
            },
            undefined,
            (error) => {
                console.error('Error loading chicken model:', error);
                updateProgress(); // Continue even if failed
            }
        );
        
        // Load stickman model
        loader.load(
            'https://cdn.jsdelivr.net/gh/ethembeldagli/egg-thrower-3d@main/stickman.glb',
            (gltf) => {
                stickmanModel = gltf.scene;
                stickmanModel.scale.set(0.8, 0.8, 0.8);
                console.log('Stickman model loaded');
                updateProgress();
            },
            undefined,
            (error) => {
                console.error('Error loading stickman model:', error);
                updateProgress();
            }
        );
        
        // Load chef model
        loader.load(
            'https://cdn.jsdelivr.net/gh/ethembeldagli/egg-thrower-3d@main/chef_character.glb',
            (gltf) => {
                chefModel = gltf.scene;
                chefModel.scale.set(0.9, 0.9, 0.9);
                console.log('Chef model loaded');
                updateProgress();
            },
            undefined,
            (error) => {
                console.error('Error loading chef model:', error);
                updateProgress();
            }
        );
    });
}

// Initialize Game
function init() {
    // Load models first
    loadModels().then(() => {
        console.log('All models loaded, game ready!');
    });
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Blue sky
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 0);
    camera.rotation.order = 'YXZ'; // Proper euler rotation order for FPS controls

    // Renderer
    const canvas = document.getElementById('gameCanvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);

    // Ground (Green grass)
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4CAF50 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create player (chicken)
    createPlayer();

    // Create buildings
    createBuildings();

    // Spawn NPCs (white people)
    for (let i = 0; i < 10; i++) {
        spawnNPC();
    }

    // Spawn ONLY 1 chef initially
    const firstChef = createChef();
    firstChef.position.set(20, 0.9, -20);
    scene.add(firstChef);
    chefs.push(firstChef);

    // No food items - energy only refills at doner shop

    // Setup hotbar
    setupHotbar();

    // Event Listeners
    setupEventListeners();

    // Tutorial
    setupTutorial();

    // Start game loop
    animate();
}

function createPlayer() {
    player = new THREE.Group();
    
    if (chickenModel) {
        const model = chickenModel.clone();
        player.add(model);
    } else {
        // Fallback: Chicken body (yellow/orange)
        const bodyGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFFA500 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        player.add(body);

        // Beak
        const beakGeometry = new THREE.ConeGeometry(0.1, 0.2, 4);
        const beakMaterial = new THREE.MeshLambertMaterial({ color: 0xFF8800 });
        const beak = new THREE.Mesh(beakGeometry, beakMaterial);
        beak.rotation.z = Math.PI / 2;
        beak.position.set(0.3, 0, 0);
        player.add(beak);
    }

    player.position.set(0, 1.7, 0);
    scene.add(player);
}

function createBuildings() {
    // Döner shop (larger red building)
    const shopGeometry = new THREE.BoxGeometry(8, 6, 8);
    const shopMaterial = new THREE.MeshLambertMaterial({ color: 0xCC0000 });
    const shop = new THREE.Mesh(shopGeometry, shopMaterial);
    shop.position.set(20, 3, 20);
    shop.castShadow = true;
    shop.receiveShadow = true;
    shop.userData.type = 'donerShop';
    scene.add(shop);

    // Shop sign
    const signGeometry = new THREE.BoxGeometry(6, 1, 0.2);
    const signMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(20, 6.5, 16);
    scene.add(sign);

    // Other buildings
    const buildingPositions = [
        { x: -25, z: -25, w: 6, h: 8, d: 6, color: 0x888888 },
        { x: 30, z: -20, w: 5, h: 10, d: 5, color: 0x999999 },
        { x: -20, z: 25, w: 7, h: 7, d: 7, color: 0x777777 },
        { x: 40, z: 40, w: 4, h: 12, d: 4, color: 0xAAAAAA }
    ];

    buildingPositions.forEach(pos => {
        const geometry = new THREE.BoxGeometry(pos.w, pos.h, pos.d);
        const material = new THREE.MeshLambertMaterial({ color: pos.color });
        const building = new THREE.Mesh(geometry, material);
        building.position.set(pos.x, pos.h / 2, pos.z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
    });
}

function spawnNPC() {
    const npc = new THREE.Group();
    
    if (stickmanModel) {
        const model = stickmanModel.clone();
        npc.add(model);
    } else {
        // Fallback: White body
        const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        npc.add(body);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.y = 0.8;
        head.castShadow = true;
        npc.add(head);
    }

    // Random position
    npc.position.set(
        (Math.random() - 0.5) * 80,
        0.8,
        (Math.random() - 0.5) * 80
    );

    npc.userData = {
        type: 'npc',
        velocity: new THREE.Vector3(),
        direction: Math.random() * Math.PI * 2,
        changeDirectionTime: Date.now() + Math.random() * 3000,
        fleeing: false,
        fleeUntil: 0
    };

    scene.add(npc);
    npcs.push(npc);
}



function createChef() {
    const chef = new THREE.Group();
    
    if (chefModel) {
        const model = chefModel.clone();
        chef.add(model);
    } else {
        // Fallback: Red body
        const bodyGeometry = new THREE.CapsuleGeometry(0.35, 1.2, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        chef.add(body);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFFAAAA });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 0.9;
        head.castShadow = true;
        chef.add(head);

        // White chef hat
        const hatGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.4, 8);
        const hatMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        const hat = new THREE.Mesh(hatGeometry, hatMaterial);
        hat.position.y = 1.3;
        hat.castShadow = true;
        chef.add(hat);
    }

    chef.userData = {
        type: 'chef',
        health: 4,
        lastAttackTime: 0,
        isDead: false,
        hitCount: 0
    };

    return chef;
}

function killChef(chef) {
    chef.userData.health = 0;
    chef.userData.isDead = true;
    chef.visible = false;
    gameState.ep += 3; // Award 3 EP for kill
    
    // Respawn after 10 seconds
    setTimeout(() => {
        respawnChef(chef);
    }, 10000);
}

function respawnChef(chef) {
    chef.userData.health = 4; // 4 eggs to kill
    chef.userData.isDead = false;
    chef.userData.hitCount = 0;
    chef.position.set(
        Math.random() * 80 - 40,
        0.9,
        Math.random() * 80 - 40
    );
    chef.visible = true;
    console.log('Chef respawned');
}



function shootEgg() {
    const weapon = gameState.weapons[gameState.currentWeapon];
    if (!weapon.unlocked) return;

    const now = Date.now();
    if (weapon.type === 'auto') {
        const cooldown = weapon.fireRate * 1000;
        if (now - gameState.lastShootTime < cooldown) return;
    }

    gameState.lastShootTime = now;

    for (let i = 0; i < weapon.eggsPerShot; i++) {
        const eggGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const eggMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFACD });
        const egg = new THREE.Mesh(eggGeometry, eggMaterial);
        
        egg.position.copy(camera.position);
        egg.castShadow = true;

        const spreadX = (Math.random() - 0.5) * 0.2;
        const spreadY = (Math.random() - 0.5) * 0.2;
        
        const velocity = new THREE.Vector3();
        camera.getWorldDirection(velocity);
        velocity.x += spreadX;
        velocity.y += spreadY;
        velocity.normalize().multiplyScalar(30);
        
        egg.userData = {
            velocity: velocity,
            lifetime: 3000,
            spawnTime: now
        };
        
        scene.add(egg);
        eggs.push(egg);
    }
}

function setupHotbar() {
    const hotbar = document.getElementById('hotbar');
    hotbar.innerHTML = '';
    
    for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        if (i === gameState.currentWeapon) slot.classList.add('active');
        
        const slotNumber = document.createElement('div');
        slotNumber.className = 'slot-number';
        slotNumber.textContent = i + 1;
        slot.appendChild(slotNumber);
        
        if (i < gameState.weapons.length) {
            const weapon = gameState.weapons[i];
            if (!weapon.unlocked) slot.classList.add('locked');
            
            const icon = document.createElement('div');
            icon.className = 'slot-icon';
            icon.textContent = weapon.unlocked ? '🥚' : '🔒';
            slot.appendChild(icon);
            
            const name = document.createElement('div');
            name.className = 'slot-name';
            name.textContent = weapon.name;
            slot.appendChild(name);
        }
        
        hotbar.appendChild(slot);
    }
}

function updateHUD() {
    document.getElementById('healthText').textContent = Math.max(0, Math.round(gameState.health));
    document.getElementById('healthBar').style.width = (gameState.health / gameState.maxHealth * 100) + '%';
    
    document.getElementById('energyText').textContent = Math.max(0, Math.round(gameState.energy));
    document.getElementById('energyBar').style.width = (gameState.energy / gameState.maxEnergy * 100) + '%';
    
    document.getElementById('levelText').textContent = gameState.level;
    document.getElementById('epText').textContent = gameState.ep;
    document.getElementById('weaponName').textContent = gameState.weapons[gameState.currentWeapon].name;
    
    setupHotbar();
}

function levelUp() {
    gameState.level++;
    gameState.maxHealth += 25;
    gameState.health = Math.min(gameState.health + 25, gameState.maxHealth);
    
    // Spawn new chef
    const newChef = createChef();
    newChef.position.set(
        Math.random() * 80 - 40,
        0.9,
        Math.random() * 80 - 40
    );
    scene.add(newChef);
    chefs.push(newChef);
    console.log('Level up! New chef spawned. Total chefs:', chefs.length);
}

function checkWeaponUnlocks() {
    let unlocked = false;
    gameState.weapons.forEach((weapon, index) => {
        if (!weapon.unlocked && gameState.ep >= weapon.epRequired) {
            weapon.unlocked = true;
            gameState.currentWeapon = index;
            levelUp();
            unlocked = true;
        }
    });
    if (unlocked) updateHUD();
}

function gameOver(cause) {
    gameState.isDead = true;
    const overlay = document.getElementById('gameOverOverlay');
    const reason = document.getElementById('deathReason');
    
    if (cause === 'energy') {
        reason.textContent = 'You ran out of energy and starved!';
    } else if (cause === 'chef') {
        reason.textContent = 'You were defeated by the chefs!';
    }
    
    overlay.style.display = 'flex';
    document.getElementById('restartButton').onclick = () => location.reload();
}

function updateNPCs(delta) {
    npcs.forEach(npc => {
        const now = Date.now();
        
        if (npc.userData.fleeing && now < npc.userData.fleeUntil) {
            // Run away from player
            const direction = new THREE.Vector3();
            direction.subVectors(npc.position, player.position).normalize();
            npc.position.x += direction.x * delta * 5;
            npc.position.z += direction.z * delta * 5;
        } else {
            npc.userData.fleeing = false;
            
            // Random walking
            if (now > npc.userData.changeDirectionTime) {
                npc.userData.direction = Math.random() * Math.PI * 2;
                npc.userData.changeDirectionTime = now + 2000 + Math.random() * 3000;
            }
            
            const speed = 2;
            npc.position.x += Math.cos(npc.userData.direction) * speed * delta;
            npc.position.z += Math.sin(npc.userData.direction) * speed * delta;
        }
        
        // Keep in bounds
        npc.position.x = Math.max(-90, Math.min(90, npc.position.x));
        npc.position.z = Math.max(-90, Math.min(90, npc.position.z));
        
        // Rotate to face movement
        npc.rotation.y = npc.userData.direction;
    });
}

function updateChefs(delta) {
    chefs.forEach((chef, index) => {
        if (chef.userData.isDead) return;
        
        // Chase player - VERY SLOW (1.5 speed)
        const direction = new THREE.Vector3();
        direction.subVectors(player.position, chef.position).normalize();
        
        const speed = 1.5;
        chef.position.x += direction.x * speed * delta;
        chef.position.z += direction.z * speed * delta;
        
        chef.rotation.y = Math.atan2(direction.x, direction.z);
        
        // Attack player if close
        const distance = chef.position.distanceTo(player.position);
        if (distance < 2) {
            const now = Date.now();
            if (now - chef.userData.lastAttackTime > 2000) {
                gameState.health -= 25;
                chef.userData.lastAttackTime = now;
                updateHUD();
                
                if (gameState.health <= 0) {
                    gameOver('chef');
                }
            }
        }
    });
}

function updateEggs(delta) {
    const now = Date.now();
    
    for (let i = eggs.length - 1; i >= 0; i--) {
        const egg = eggs[i];
        
        // Move egg
        egg.position.add(egg.userData.velocity.clone().multiplyScalar(delta));
        egg.userData.velocity.y -= 9.8 * delta; // Gravity
        
        // Remove if too old or hit ground
        if (now - egg.userData.spawnTime > egg.userData.lifetime || egg.position.y < 0) {
            scene.remove(egg);
            eggs.splice(i, 1);
            continue;
        }
        
        // Check collision with NPCs
        npcs.forEach(npc => {
            if (egg.position.distanceTo(npc.position) < 0.8) {
                gameState.ep += 1;
                npc.userData.fleeing = true;
                npc.userData.fleeUntil = now + 5000;
                scene.remove(egg);
                eggs.splice(i, 1);
                checkWeaponUnlocks();
                updateHUD();
            }
        });
        
        // Check collision with chefs
        chefs.forEach((chef, chefIndex) => {
            if (chef.userData.isDead) return;
            
            if (egg.position.distanceTo(chef.position) < 0.9) {
                chef.userData.hitCount++;
                
                // Kill chef after 4 hits
                if (chef.userData.hitCount >= 4) {
                    killChef(chef);
                    checkWeaponUnlocks();
                }
                
                scene.remove(egg);
                eggs.splice(i, 1);
                updateHUD();
            }
        });
    }
}

function updatePlayer(delta) {
    // Energy drain
    const now = Date.now();
    if (now - gameState.lastEnergyDrain > 1000) {
        const isMoving = moveForward || moveBackward || moveLeft || moveRight;
        if (isMoving) {
            gameState.energy -= 10 / 60; // 10 per minute
            if (gameState.energy < 0) gameState.energy = 0;
            updateHUD();
        }
        gameState.lastEnergyDrain = now;
    }
    
    // HP drain if energy is 0
    if (gameState.energy <= 0) {
        const deltaTime = (now - lastHealthDrain) / 1000;
        if (deltaTime >= 0.2) {
            gameState.health -= 5 * deltaTime;
            lastHealthDrain = now;
            updateHUD();
            if (gameState.health <= 0) {
                gameOver('energy');
            }
        }
    } else {
        lastHealthDrain = now;
    }
    
    // Camera-relative movement - FIXED (not inverted)
    // Get camera forward direction (horizontal plane only)
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0; // Keep movement horizontal
    cameraDirection.normalize();
    
    // Get camera right direction (perpendicular to forward)
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(cameraDirection, camera.up).normalize();
    
    // Calculate input from keyboard/joystick
    let inputForward = Number(moveForward) - Number(moveBackward);
    let inputRight = Number(moveRight) - Number(moveLeft);
    
    // Add joystick input
    if (Math.abs(joystickInput.y) > 0.1) {
        inputForward += -joystickInput.y; // Joystick up = forward (positive camera direction)
    }
    if (Math.abs(joystickInput.x) > 0.1) {
        inputRight += joystickInput.x;
    }
    
    // Create movement vector relative to camera
    const movementDirection = new THREE.Vector3();
    
    if (Math.abs(inputForward) > 0) {
        // Forward/backward movement in camera direction (NOT INVERTED)
        const forwardMovement = cameraDirection.clone().multiplyScalar(inputForward);
        movementDirection.add(forwardMovement);
    }
    
    if (Math.abs(inputRight) > 0) {
        // Left/right strafing perpendicular to camera
        const rightMovement = cameraRight.clone().multiplyScalar(inputRight);
        movementDirection.add(rightMovement);
    }
    
    // Normalize and apply speed
    if (movementDirection.length() > 0) {
        movementDirection.normalize();
        const speed = gameState.energy > 0 ? 5.5 : 2.0; // Normal walking speed
        
        player.position.x += movementDirection.x * speed * delta;
        player.position.z += movementDirection.z * speed * delta;
    }
    
    // Rotate player to face movement direction (or camera direction)
    player.rotation.y = cameraRotation.yaw;
    
    // Check doner shop proximity for energy refill
    const shopPosition = new THREE.Vector3(20, 3, 20);
    const distanceToShop = player.position.distanceTo(shopPosition);
    
    if (distanceToShop < 6) {
        // Refill energy at shop (200 + 500 bonus)
        if (gameState.energy < gameState.maxEnergy) {
            gameState.energy = gameState.maxEnergy + 500;
            updateHUD();
            console.log('Energy refilled at doner shop!');
        }
    }
    
    // Auto-shoot for auto weapons
    const weapon = gameState.weapons[gameState.currentWeapon];
    if (weapon.type === 'auto' && gameState.isShooting) {
        shootEgg();
    }
}

function updateCamera() {
    // Apply camera rotation from user input
    camera.rotation.y = cameraRotation.yaw;
    camera.rotation.x = cameraRotation.pitch;
    
    if (gameState.isFirstPerson) {
        // First person: camera at player position + eye height
        camera.position.copy(player.position);
        camera.position.y = 1.7;
        player.visible = false;
    } else {
        // Third person: camera orbits behind player
        const distance = 5;
        const offset = new THREE.Vector3(
            Math.sin(cameraRotation.yaw) * distance,
            2,
            Math.cos(cameraRotation.yaw) * distance
        );
        camera.position.copy(player.position).add(offset);
        player.visible = true;
    }
}

function setupEventListeners() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (!gameState.gameStarted) return;
        
        switch(e.code) {
            case 'KeyW': case 'ArrowUp': moveForward = true; break;
            case 'KeyS': case 'ArrowDown': moveBackward = true; break;
            case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
            case 'KeyD': case 'ArrowRight': moveRight = true; break;
            case 'Space': 
                e.preventDefault();
                gameState.isShooting = true; 
                shootEgg(); 
                break;
            case 'KeyV': gameState.isFirstPerson = !gameState.isFirstPerson; break;
            case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
            case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
                const num = parseInt(e.code.replace('Digit', '')) - 1;
                if (num < gameState.weapons.length && gameState.weapons[num].unlocked) {
                    gameState.currentWeapon = num;
                    updateHUD();
                }
                break;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        switch(e.code) {
            case 'KeyW': case 'ArrowUp': moveForward = false; break;
            case 'KeyS': case 'ArrowDown': moveBackward = false; break;
            case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
            case 'KeyD': case 'ArrowRight': moveRight = false; break;
            case 'Space': 
                gameState.isShooting = false; 
                break;
        }
    });
    
    // Mouse
    document.addEventListener('mousedown', (e) => {
        if (!gameState.gameStarted) return;
        
        if (!isPointerLocked) {
            renderer.domElement.requestPointerLock();
        } else {
            // Left click shoots
            if (e.button === 0) {
                gameState.isShooting = true;
                shootEgg();
            }
        }
    });
    
    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            gameState.isShooting = false;
        }
    });
    
    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === renderer.domElement;
        console.log('Pointer lock changed:', isPointerLocked);
        
        // Hide click instruction when pointer is locked
        const clickInstruction = document.getElementById('clickInstruction');
        if (isPointerLocked) {
            clickInstruction.style.display = 'none';
        } else if (gameState.gameStarted) {
            // Show instruction again if pointer lock is released
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
            if (!isMobile) {
                clickInstruction.style.display = 'block';
            }
        }
    });
    
    document.addEventListener('pointerlockerror', () => {
        console.error('Pointer lock error');
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!gameState.gameStarted || !isPointerLocked) return;
        
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;
        
        // Update camera rotation using euler angles
        cameraRotation.yaw -= movementX * MOUSE_SENSITIVITY;
        cameraRotation.pitch -= movementY * MOUSE_SENSITIVITY;
        
        // Clamp vertical rotation to prevent flipping
        cameraRotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotation.pitch));
        
        // Apply rotation to camera
        camera.rotation.y = cameraRotation.yaw;
        camera.rotation.x = cameraRotation.pitch;
        
        // Debug logging (can be removed for production)
        // console.log('Camera rotation:', cameraRotation.yaw.toFixed(2), cameraRotation.pitch.toFixed(2));
    });
    
    // Touch controls
    setupTouchControls();
    
    // Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function setupTouchControls() {
    const shootButton = document.getElementById('shootButton');
    const viewToggle = document.getElementById('viewToggle');
    
    // Touch look controls (right side of screen)
    let touchLookId = null;
    
    document.addEventListener('touchstart', (e) => {
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            // Right half of screen is for camera look
            if (touch.clientX > window.innerWidth / 2) {
                touchLookId = touch.identifier;
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
                touchLookActive = true;
                break;
            }
        }
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!touchLookActive || !gameState.gameStarted) return;
        
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            if (touch.identifier === touchLookId) {
                e.preventDefault();
                
                const deltaX = touch.clientX - lastTouchX;
                const deltaY = touch.clientY - lastTouchY;
                
                // Update camera rotation
                cameraRotation.yaw -= deltaX * TOUCH_SENSITIVITY;
                cameraRotation.pitch -= deltaY * TOUCH_SENSITIVITY;
                
                // Clamp vertical rotation
                cameraRotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotation.pitch));
                
                // Apply to camera
                camera.rotation.y = cameraRotation.yaw;
                camera.rotation.x = cameraRotation.pitch;
                
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
                break;
            }
        }
    });
    
    document.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchLookId) {
                touchLookActive = false;
                touchLookId = null;
                break;
            }
        }
    });
    
    shootButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        gameState.isShooting = true;
        shootEgg();
    });
    
    shootButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        gameState.isShooting = false;
    });
    
    viewToggle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        gameState.isFirstPerson = !gameState.isFirstPerson;
    });
    
    // Joystick with proper touch tracking
    const joystick = document.getElementById('joystick');
    const stick = joystick.querySelector('.joystick-stick');
    let joystickTouchId = null;
    let joystickCenter = { x: 0, y: 0 };
    
    joystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (joystickTouchId !== null) return; // Already tracking a touch
        
        const touch = e.touches[0];
        joystickTouchId = touch.identifier;
        
        const rect = joystick.getBoundingClientRect();
        joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        
        stick.classList.add('active');
        console.log('Joystick activated');
    });
    
    document.addEventListener('touchmove', (e) => {
        if (joystickTouchId === null) return;
        
        // Find the touch that corresponds to our joystick
        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            if (touch.identifier === joystickTouchId) {
                // Only prevent default if this is the left side (joystick)
                if (touch.clientX < window.innerWidth / 2) {
                    e.preventDefault();
                }
                
                const dx = touch.clientX - joystickCenter.x;
                const dy = touch.clientY - joystickCenter.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const maxDistance = 40;
                
                // Limit stick movement
                const limitedDx = distance > maxDistance ? (dx / distance) * maxDistance : dx;
                const limitedDy = distance > maxDistance ? (dy / distance) * maxDistance : dy;
                
                stick.style.transform = `translate(calc(-50% + ${limitedDx}px), calc(-50% + ${limitedDy}px))`;
                
                // Update movement based on joystick position
                const strength = Math.min(1, distance / maxDistance);
                const deadZone = 5;
                
                if (distance > deadZone) {
                    // Store normalized joystick input for camera-relative movement
                    joystickInput.x = (dx / maxDistance) * strength;
                    joystickInput.y = (dy / maxDistance) * strength;
                    
                    // Also set boolean flags for compatibility
                    moveForward = -dy > deadZone && strength > 0.2;
                    moveBackward = dy > deadZone && strength > 0.2;
                    moveLeft = -dx > deadZone && strength > 0.2;
                    moveRight = dx > deadZone && strength > 0.2;
                } else {
                    joystickInput.x = 0;
                    joystickInput.y = 0;
                    moveForward = moveBackward = moveLeft = moveRight = false;
                }
                
                break;
            }
        }
    });
    
    document.addEventListener('touchend', (e) => {
        // Check if our joystick touch ended
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                joystickTouchId = null;
                stick.style.transform = 'translate(-50%, -50%)';
                stick.classList.remove('active');
                joystickInput.x = 0;
                joystickInput.y = 0;
                moveForward = moveBackward = moveLeft = moveRight = false;
                console.log('Joystick released');
                break;
            }
        }
    });
    
    document.addEventListener('touchcancel', (e) => {
        // Handle touch cancellation
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                joystickTouchId = null;
                stick.style.transform = 'translate(-50%, -50%)';
                stick.classList.remove('active');
                joystickInput.x = 0;
                joystickInput.y = 0;
                moveForward = moveBackward = moveLeft = moveRight = false;
                break;
            }
        }
    });
}

function setupTutorial() {
    const tutorialOverlay = document.getElementById('tutorialOverlay');
    const startButton = document.getElementById('startButton');
    const clickInstruction = document.getElementById('clickInstruction');
    
    function startGame() {
        tutorialOverlay.style.display = 'none';
        gameState.gameStarted = true;
        
        // Show click instruction if not on mobile
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
        if (!isMobile) {
            clickInstruction.style.display = 'block';
        }
        
        console.log('Game started - click to enable camera controls');
        
        // Request pointer lock on first click
        const requestLock = () => {
            renderer.domElement.requestPointerLock();
            clickInstruction.style.display = 'none';
            console.log('Requesting pointer lock...');
        };
        
        // Add click listener to canvas
        renderer.domElement.addEventListener('click', requestLock, { once: true });
    }
    
    startButton.addEventListener('click', startGame);
    
    document.addEventListener('keydown', (e) => {
        if (!gameState.gameStarted && (e.code === 'Enter' || e.code === 'Escape')) {
            startGame();
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    if (!gameState.gameStarted || gameState.isDead) {
        renderer.render(scene, camera);
        return;
    }
    
    const delta = clock.getDelta();
    
    updatePlayer(delta);
    updateNPCs(delta);
    updateChefs(delta);
    updateEggs(delta);
    updateCamera();
    
    renderer.render(scene, camera);
}

// Start the game
init();