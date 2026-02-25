export class NetworkManager {
  constructor() {
    this.socket = null;
    this.onWelcome = null;
    this.onState = null;
    this.onFire = null;
    this.onHit = null;
    this.onKill = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onFull = null;
    this.onRoomList = null;
    this.onRoomError = null;
    this.onRanking = null;
    this.onMineDrop = null;
    this.onMineExplode = null;
    this._lastInputSent = 0;
  }

  connect() {
    this.socket = io();

    this.socket.on('welcome', (data) => this.onWelcome?.(data));
    this.socket.on('state', (data) => this.onState?.(data));
    this.socket.on('fire', (data) => this.onFire?.(data));
    this.socket.on('hit', (data) => this.onHit?.(data));
    this.socket.on('kill', (data) => this.onKill?.(data));
    this.socket.on('playerJoined', (data) => this.onPlayerJoined?.(data));
    this.socket.on('playerLeft', (data) => this.onPlayerLeft?.(data));
    this.socket.on('roomList', (data) => this.onRoomList?.(data));
    this.socket.on('roomError', (msg) => this.onRoomError?.(msg));
    this.socket.on('ranking', (data) => this.onRanking?.(data));
  }

  createRoom(roomName, callback) {
    if (this.socket) this.socket.emit('createRoom', { roomName }, callback);
  }

  joinRoom(roomName, name) {
    if (this.socket) this.socket.emit('joinRoom', { roomName, name });
  }

  leaveRoom() {
    if (this.socket) this.socket.emit('leaveRoom');
  }

  getRooms() {
    if (this.socket) this.socket.emit('getRooms');
  }

  getRanking() {
    if (this.socket) this.socket.emit('getRanking');
  }

  sendInput(inputState) {
    const now = Date.now();
    if (now - this._lastInputSent < 50) return;
    this._lastInputSent = now;
    if (this.socket) this.socket.volatile.emit('input', inputState);
  }
}
