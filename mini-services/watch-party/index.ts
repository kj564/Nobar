// Nobar Watch Party — WebSocket sync server
// Port 3032
// Gateway: io("/?XTransformPort=3032")
//
// Events:
//   Client → Server: create_room, join_room, leave_room, sync_state
//   Server → Client: room_created, room_joined, user_joined, user_left, sync_state

import { Server } from "socket.io";

const PORT = 3032;

type Room = {
  id: string;
  hostId: string;
  users: Set<string>;
  // Last known state
  state: {
    playing: boolean;
    currentTime: number;
    updatedAt: number;
  };
};

const rooms = new Map<string, Room>();
const userRooms = new Map<string, string>();

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function cleanupEmptyRooms() {
  for (const [id, room] of rooms) {
    if (room.users.size === 0) {
      rooms.delete(id);
    }
  }
}

const io = new Server(PORT, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`[watch-party] User connected: ${socket.id}`);

  // Create room
  socket.on("create_room", (callback?: (data: any) => void) => {
    // Leave previous room if any
    const prevRoom = userRooms.get(socket.id);
    if (prevRoom) leaveRoom(socket, prevRoom);

    const roomId = generateRoomId();
    const room: Room = {
      id: roomId,
      hostId: socket.id,
      users: new Set([socket.id]),
      state: { playing: false, currentTime: 0, updatedAt: Date.now() },
    };
    rooms.set(roomId, room);
    userRooms.set(socket.id, roomId);
    socket.join(roomId);

    console.log(`[watch-party] Room created: ${roomId} by ${socket.id}`);
    if (callback) callback({ roomId, isHost: true });
  });

  // Join room
  socket.on("join_room", (roomId: string, callback?: (data: any) => void) => {
    const upperId = roomId.toUpperCase().trim();
    const room = rooms.get(upperId);

    if (!room) {
      if (callback) callback({ error: "Room not found" });
      return;
    }

    // Leave previous room
    const prevRoom = userRooms.get(socket.id);
    if (prevRoom) leaveRoom(socket, prevRoom);

    room.users.add(socket.id);
    userRooms.set(socket.id, upperId);
    socket.join(upperId);

    // Notify others
    socket.to(upperId).emit("user_joined", { userId: socket.id });

    // Send current state to new user
    const isHost = room.hostId === socket.id;
    console.log(`[watch-party] User ${socket.id} joined room ${upperId} (${room.users.size} users)`);

    if (callback) {
      callback({
        roomId: upperId,
        isHost,
        userCount: room.users.size,
        state: room.state,
      });
    }
  });

  // Leave room
  socket.on("leave_room", () => {
    const roomId = userRooms.get(socket.id);
    if (roomId) leaveRoom(socket, roomId);
  });

  // Sync state (play/pause/seek)
  socket.on("sync_state", (data: { playing: boolean; currentTime: number }) => {
    const roomId = userRooms.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    // Only host can sync (or anyone if no host restriction)
    room.state = {
      playing: data.playing,
      currentTime: data.currentTime,
      updatedAt: Date.now(),
    };

    // Broadcast to others in room
    socket.to(roomId).emit("sync_state", {
      playing: data.playing,
      currentTime: data.currentTime,
      userId: socket.id,
      timestamp: Date.now(),
    });
  });

  // Chat message
  socket.on("chat_message", (data: { text: string }) => {
    const roomId = userRooms.get(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit("chat_message", {
      text: data.text,
      userId: socket.id,
      timestamp: Date.now(),
    });
  });

  // Get room info
  socket.on("get_room_info", (callback?: (data: any) => void) => {
    const roomId = userRooms.get(socket.id);
    if (!roomId || !callback) return;
    const room = rooms.get(roomId);
    if (!room) return;
    callback({
      roomId,
      userCount: room.users.size,
      isHost: room.hostId === socket.id,
      state: room.state,
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const roomId = userRooms.get(socket.id);
    if (roomId) leaveRoom(socket, roomId);
    console.log(`[watch-party] User disconnected: ${socket.id}`);
  });
});

function leaveRoom(socket: any, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.users.delete(socket.id);
  socket.leave(roomId);
  userRooms.delete(socket.id);

  // Notify others
  socket.to(roomId).emit("user_left", { userId: socket.id });

  // If host left, assign new host or delete room
  if (room.hostId === socket.id) {
    if (room.users.size > 0) {
      room.hostId = Array.from(room.users)[0];
    } else {
      rooms.delete(roomId);
    }
  }

  cleanupEmptyRooms();
}

console.log(`[watch-party] Server running on port ${PORT}`);
