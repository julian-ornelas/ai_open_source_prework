// Game client for MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = new Image();
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.playerId = null;
        this.myPlayer = null;
        this.allPlayers = {};
        this.avatars = {};
        this.avatarImages = {}; // Cached avatar images
        this.username = null;
        this.isLoggedIn = false;
        
        // Viewport system
        this.viewport = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
        
        // WebSocket connection
        this.ws = null;
        this.connected = false;
        this.lastPingTime = 0;
        this.pingInterval = null;
        
        // UI elements
        this.playerListContent = null;
        this.pingValue = null;
        
        
        // Zoom
        this.zoom = 1.0;
        
        // Input state
        this.keysPressed = {};
        this.movementKeys = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        this.movementInterval = null;
        this.movementSpeed = 50; // milliseconds between move commands (faster)
        
        this.init();
    }
    
    init() {
        // Set canvas size to fill the browser window
        this.resizeCanvas();
        
        // Load the world map image
        this.worldImage.onload = () => {
            this.draw();
        };
        
        this.worldImage.src = 'world.jpg';
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.updateViewport();
            this.draw();
        });
        
        // Initialize UI
        this.initializeUI();
        
        // Set up login screen
        this.setupLoginScreen();
    }
    
    initializeUI() {
        this.playerListContent = document.getElementById('playerListContent');
        this.pingValue = document.getElementById('pingValue');
    }
    
    setupLoginScreen() {
        const usernameInput = document.getElementById('usernameInput');
        const joinButton = document.getElementById('joinButton');
        const loginError = document.getElementById('loginError');
        
        // Focus on input when page loads
        usernameInput.focus();
        
        // Handle Enter key in input
        usernameInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                this.attemptLogin();
            }
        });
        
        // Handle join button click
        joinButton.addEventListener('click', () => {
            this.attemptLogin();
        });
        
        // Store references for later use
        this.usernameInput = usernameInput;
        this.joinButton = joinButton;
        this.loginError = loginError;
    }
    
    attemptLogin() {
        const username = this.usernameInput.value.trim();
        
        // Clear previous error
        this.loginError.textContent = '';
        
        // Validate username
        if (!username) {
            this.loginError.textContent = 'Please enter a username';
            return;
        }
        
        if (username.length < 2) {
            this.loginError.textContent = 'Username must be at least 2 characters';
            return;
        }
        
        if (username.length > 20) {
            this.loginError.textContent = 'Username must be 20 characters or less';
            return;
        }
        
        // Disable form during connection
        this.joinButton.disabled = true;
        this.joinButton.textContent = 'Connecting...';
        this.usernameInput.disabled = true;
        
        // Store username and connect
        this.username = username;
        this.connectToServer();
    }
    
    hideLoginScreen() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('ui').style.display = 'block';
        this.isLoggedIn = true;
        
        // Set up game controls now that we're logged in
        this.setupInputHandling();
        this.setupMouseZoom();
    }
    
    showLoginError(errorMessage) {
        this.loginError.textContent = errorMessage;
        this.joinButton.disabled = false;
        this.joinButton.textContent = 'Join Game';
        this.usernameInput.disabled = false;
    }
    
    setupMouseZoom() {
        this.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            
            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.5, Math.min(3.0, this.zoom * zoomFactor));
            
            if (newZoom !== this.zoom) {
                this.zoom = newZoom;
                this.updateViewport();
                this.draw();
            }
        });
    }
    
    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.connected = true;
                this.joinGame();
                this.startPing();
            };
            
            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.connected = false;
                this.stopPing();
                
                if (!this.isLoggedIn) {
                    this.showLoginError('Connection failed. Please try again.');
                } else {
                    // Attempt to reconnect after 3 seconds if already logged in
                    setTimeout(() => {
                        if (!this.connected) {
                            this.connectToServer();
                        }
                    }, 3000);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (!this.isLoggedIn) {
                    this.showLoginError('Connection error. Please try again.');
                }
            };
            
        } catch (error) {
            console.error('Failed to connect to server:', error);
            if (!this.isLoggedIn) {
                this.showLoginError('Failed to connect to server. Please try again.');
            }
        }
    }
    
    joinGame() {
        if (!this.connected || !this.username) return;
        
        const joinMessage = {
            action: 'join_game',
            username: this.username
        };
        
        this.ws.send(JSON.stringify(joinMessage));
    }
    
    startPing() {
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.lastPingTime = Date.now();
                // Send a move command to test latency (since server might not support ping)
                this.ws.send(JSON.stringify({ action: 'move', direction: 'up' }));
                // Send stop immediately to not actually move
                setTimeout(() => {
                    if (this.connected) {
                        this.ws.send(JSON.stringify({ action: 'stop' }));
                    }
                }, 1);
            }
        }, 5000); // Ping every 5 seconds
    }
    
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    
    
    updatePlayerList() {
        if (!this.playerListContent) return;
        
        this.playerListContent.innerHTML = '';
        
        for (const playerId in this.allPlayers) {
            const player = this.allPlayers[playerId];
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            
            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            
            const name = document.createElement('div');
            name.className = 'player-name';
            name.textContent = player.username;
            
            const status = document.createElement('div');
            status.className = 'player-status';
            // Check if player is actually moving by comparing with previous position
            const isActuallyMoving = this.isPlayerActuallyMoving(player);
            status.textContent = isActuallyMoving ? 'Moving' : 'Idle';
            
            playerItem.appendChild(avatar);
            playerItem.appendChild(name);
            playerItem.appendChild(status);
            this.playerListContent.appendChild(playerItem);
        }
    }
    
    isPlayerActuallyMoving(player) {
        // Special handling for our own player
        if (player.id === this.playerId || this.allPlayers[this.playerId] === player) {
            // For our own player, check if we have any movement keys pressed
            const hasMovementKeys = Object.keys(this.keysPressed).some(key => 
                this.movementKeys[key]
            );
            return hasMovementKeys;
        }
        
        // For other players, use server data
        if (player.isMoving === false) {
            return false;
        }
        
        if (player.isMoving === true) {
            return true;
        }
        
        // Default to not moving if status is unclear
        return false;
    }
    
    setupInputHandling() {
        // Handle keydown events
        document.addEventListener('keydown', (event) => {
            if (this.movementKeys[event.code]) {
                event.preventDefault(); // Prevent page scrolling
                
                if (!this.keysPressed[event.code]) {
                    this.keysPressed[event.code] = true;
                    this.startContinuousMovement();
                    this.updatePlayerList(); // Update status when starting to move
                }
            }
        });
        
        // Handle keyup events
        document.addEventListener('keyup', (event) => {
            if (this.movementKeys[event.code]) {
                event.preventDefault();
                
                if (this.keysPressed[event.code]) {
                    delete this.keysPressed[event.code];
                    this.checkMovementState();
                    this.updatePlayerList(); // Update status when stopping movement
                }
            }
        });
        
        // Handle window focus/blur to clean up key states
        window.addEventListener('blur', () => {
            this.keysPressed = {};
            this.stopContinuousMovement();
            this.sendStopCommand();
            this.updatePlayerList(); // Update status when window loses focus
        });
        
        window.addEventListener('focus', () => {
            this.keysPressed = {};
            this.updatePlayerList(); // Update status when window regains focus
        });
    }
    
    sendMoveCommand(direction) {
        if (!this.connected) return;
        
        const moveMessage = {
            action: 'move',
            direction: direction
        };
        
        this.ws.send(JSON.stringify(moveMessage));
    }
    
    sendStopCommand() {
        if (!this.connected) return;
        
        const stopMessage = {
            action: 'stop'
        };
        
        this.ws.send(JSON.stringify(stopMessage));
    }
    
    checkMovementState() {
        // If no movement keys are pressed, send stop command
        const hasMovementKeys = Object.keys(this.keysPressed).some(key => 
            this.movementKeys[key]
        );
        
        if (!hasMovementKeys) {
            this.stopContinuousMovement();
            this.sendStopCommand();
        } else {
            this.startContinuousMovement();
        }
    }
    
    startContinuousMovement() {
        // Clear any existing movement interval
        this.stopContinuousMovement();
        
        // Start sending move commands repeatedly
        this.movementInterval = setInterval(() => {
            this.sendCurrentMovement();
        }, this.movementSpeed);
    }
    
    stopContinuousMovement() {
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
    }
    
    sendCurrentMovement() {
        if (!this.connected) return;
        
        // Get all currently pressed movement keys
        const pressedKeys = Object.keys(this.keysPressed).filter(key => 
            this.movementKeys[key]
        );
        
        if (pressedKeys.length === 0) {
            return;
        } else if (pressedKeys.length === 1) {
            // Single direction movement
            this.sendMoveCommand(this.movementKeys[pressedKeys[0]]);
        } else {
            // Multiple keys pressed - handle diagonal movement
            this.sendDiagonalMovement(pressedKeys);
        }
    }
    
    sendDiagonalMovement(pressedKeys) {
        // Convert keys to directions
        const directions = pressedKeys.map(key => this.movementKeys[key]);
        
        // Determine diagonal direction based on pressed keys
        let diagonalDirection = null;
        
        if (directions.includes('up') && directions.includes('left')) {
            diagonalDirection = 'up-left';
        } else if (directions.includes('up') && directions.includes('right')) {
            diagonalDirection = 'up-right';
        } else if (directions.includes('down') && directions.includes('left')) {
            diagonalDirection = 'down-left';
        } else if (directions.includes('down') && directions.includes('right')) {
            diagonalDirection = 'down-right';
        }
        
        if (diagonalDirection) {
            // Send diagonal movement command
            const moveMessage = {
                action: 'move',
                direction: diagonalDirection
            };
            this.ws.send(JSON.stringify(moveMessage));
        } else {
            // Fallback to first direction if no valid diagonal
            this.sendMoveCommand(directions[0]);
        }
    }
    
    handleMessage(message) {
        console.log('Received message:', message);
        
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.playerId = message.playerId;
                    this.allPlayers = message.players;
                    this.avatars = message.avatars;
                    this.myPlayer = message.players[this.playerId];
                    this.cacheAvatarImages();
                    this.updateViewport();
                    this.updatePlayerList();
                    this.hideLoginScreen();
                    this.draw();
                } else {
                    console.error('Join game failed:', message.error);
                    this.showLoginError(message.error || 'Failed to join game');
                }
                break;
                
            case 'player_joined':
                this.allPlayers[message.player.playerId] = message.player;
                this.avatars[message.avatar.name] = message.avatar;
                this.cacheAvatarImage(message.avatar);
                this.updatePlayerList();
                this.draw();
                break;
                
            case 'players_moved':
                Object.assign(this.allPlayers, message.players);
                // Update viewport if our player moved
                if (message.players[this.playerId]) {
                    this.myPlayer = message.players[this.playerId]; // Update our player reference
                    this.updateViewport();
                    
                    // Measure latency from movement response
                    if (this.lastPingTime > 0) {
                        const ping = Date.now() - this.lastPingTime;
                        if (this.pingValue) {
                            this.pingValue.textContent = ping;
                        }
                        this.lastPingTime = 0; // Reset to avoid multiple measurements
                    }
                }
                this.updatePlayerList();
                this.draw();
                break;
                
            case 'player_left':
                delete this.allPlayers[message.playerId];
                this.updatePlayerList();
                this.draw();
                break;
                
                
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    cacheAvatarImages() {
        for (const avatarName in this.avatars) {
            this.cacheAvatarImage(this.avatars[avatarName]);
        }
    }
    
    cacheAvatarImage(avatar) {
        if (this.avatarImages[avatar.name]) return;
        
        this.avatarImages[avatar.name] = {};
        
        // Cache all direction frames
        for (const direction in avatar.frames) {
            this.avatarImages[avatar.name][direction] = [];
            
            avatar.frames[direction].forEach((base64Data, index) => {
                const img = new Image();
                img.onload = () => {
                    this.draw(); // Redraw when new avatar loads
                };
                img.src = base64Data;
                this.avatarImages[avatar.name][direction][index] = img;
            });
        }
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.updateViewport();
    }
    
    updateViewport() {
        this.viewport.width = this.canvas.width / this.zoom;
        this.viewport.height = this.canvas.height / this.zoom;
        
        if (this.myPlayer) {
            // Center the viewport on the player
            this.viewport.x = this.myPlayer.x - this.viewport.width / 2;
            this.viewport.y = this.myPlayer.y - this.viewport.height / 2;
            
            // Clamp viewport to world bounds, but allow centering when zoomed out
            const maxX = Math.max(0, this.worldWidth - this.viewport.width);
            const maxY = Math.max(0, this.worldHeight - this.viewport.height);
            
            // If viewport is larger than world, center it
            if (this.viewport.width >= this.worldWidth) {
                this.viewport.x = (this.worldWidth - this.viewport.width) / 2;
            } else {
                this.viewport.x = Math.max(0, Math.min(this.viewport.x, maxX));
            }
            
            if (this.viewport.height >= this.worldHeight) {
                this.viewport.y = (this.worldHeight - this.viewport.height) / 2;
            } else {
                this.viewport.y = Math.max(0, Math.min(this.viewport.y, maxY));
            }
        }
    }
    
    
    draw() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw world map
        this.drawWorld();
        
        // Draw players
        this.drawPlayers();
    }
    
    drawWorld() {
        if (!this.worldImage.complete) return;
        
        // Calculate which portion of the world to draw
        const sourceX = this.viewport.x;
        const sourceY = this.viewport.y;
        const sourceWidth = Math.min(this.viewport.width, this.worldWidth - sourceX);
        const sourceHeight = Math.min(this.viewport.height, this.worldHeight - sourceY);
        
        // Draw the visible portion of the world map with zoom
        this.ctx.drawImage(
            this.worldImage,
            sourceX, sourceY, sourceWidth, sourceHeight,  // Source rectangle
            0, 0, sourceWidth * this.zoom, sourceHeight * this.zoom  // Destination rectangle with zoom
        );
    }
    
    drawPlayers() {
        for (const playerId in this.allPlayers) {
            const player = this.allPlayers[playerId];
            
            // Check if player is visible in viewport
            if (this.isPlayerVisible(player)) {
                this.drawPlayer(player);
            }
        }
    }
    
    isPlayerVisible(player) {
        return player.x >= this.viewport.x && 
               player.x <= this.viewport.x + this.viewport.width &&
               player.y >= this.viewport.y && 
               player.y <= this.viewport.y + this.viewport.height;
    }
    
    drawPlayer(player) {
        // Convert world coordinates to canvas coordinates with zoom
        const canvasX = (player.x - this.viewport.x) * this.zoom;
        const canvasY = (player.y - this.viewport.y) * this.zoom;
        
        // Get avatar image
        const avatar = this.avatars[player.avatar];
        if (!avatar || !this.avatarImages[player.avatar]) return;
        
        const direction = player.facing;
        const frameIndex = player.animationFrame || 0;
        
        let avatarImg = this.avatarImages[player.avatar][direction]?.[frameIndex];
        
        // Fallback to south direction if direction not found
        if (!avatarImg) {
            avatarImg = this.avatarImages[player.avatar]['south']?.[frameIndex];
        }
        
        if (!avatarImg) return;
        
        // Calculate avatar size (preserve aspect ratio) with zoom
        const avatarSize = 32 * this.zoom; // Base size with zoom
        const aspectRatio = avatarImg.width / avatarImg.height;
        let drawWidth = avatarSize;
        let drawHeight = avatarSize / aspectRatio;
        
        // Center the avatar on the player position
        const drawX = canvasX - drawWidth / 2;
        const drawY = canvasY - drawHeight;
        
        // Save context for transformations
        this.ctx.save();
        
        // Handle west direction with horizontal flip
        if (direction === 'west') {
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(avatarImg, -drawX - drawWidth, drawY, drawWidth, drawHeight);
        } else {
            this.ctx.drawImage(avatarImg, drawX, drawY, drawWidth, drawHeight);
        }
        
        // Restore context
        this.ctx.restore();
        
        // Draw username label
        this.drawPlayerLabel(player, canvasX, canvasY - drawHeight - 5);
    }
    
    drawPlayerLabel(player, x, y) {
        this.ctx.save();
        
        // Set text style with zoom
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2 * this.zoom;
        this.ctx.font = `${12 * this.zoom}px Arial`;
        this.ctx.textAlign = 'center';
        
        // Draw text with outline
        this.ctx.strokeText(player.username, x, y);
        this.ctx.fillText(player.username, x, y);
        
        this.ctx.restore();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
