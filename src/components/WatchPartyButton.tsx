"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Copy, LogOut, MessageCircle, Send, X } from "lucide-react";

type WatchPartyButtonProps = {
  videoId: string;
};

type ChatMessage = {
  text: string;
  userId: string;
  timestamp: number;
  isMe: boolean;
};

// This is the action button (in hero section) that opens the watch party
export function WatchPartyButton({ videoId }: WatchPartyButtonProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [active, setActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const socketRef = useRef<any>(null);
  const lastSyncRef = useRef(0);

  // Load socket.io script
  useEffect(() => {
    if (document.querySelector("#socket-io-script")) return;
    const script = document.createElement("script");
    script.id = "socket-io-script";
    script.src = "https://cdn.socket.io/4.7.5/socket.io.min.js";
    document.head.appendChild(script);
  }, []);

  const connectSocket = () => {
    return new Promise<void>((resolve) => {
      if (socketRef.current) return resolve();
      const checkInterval = setInterval(() => {
        if ((window as any).io) {
          clearInterval(checkInterval);
          const socket = (window as any).io("/?XTransformPort=3032", {
            transports: ["websocket"],
          });
          socketRef.current = socket;

          socket.on("sync_state", (data: any) => {
            if (Date.now() - lastSyncRef.current < 500) return;
            const v = document.querySelector("video");
            if (!v) return;
            if (Math.abs(v.currentTime - data.currentTime) > 0.5) {
              v.currentTime = data.currentTime;
            }
            if (data.playing && v.paused) v.play();
            else if (!data.playing && !v.paused) v.pause();
          });

          socket.on("user_joined", () => {
            setUserCount((c) => c + 1);
          });
          socket.on("user_left", () => {
            setUserCount((c) => Math.max(1, c - 1));
          });
          socket.on("chat_message", (data: any) => {
            setMessages((prev) => [...prev, { text: data.text, userId: data.userId, timestamp: data.timestamp, isMe: false }]);
          });

          resolve();
        }
      }, 100);
    });
  };

  // Broadcast state changes
  useEffect(() => {
    if (!active) return;
    (window as any).__watchPartySync = (playing: boolean, currentTime: number) => {
      if (!socketRef.current) return;
      lastSyncRef.current = Date.now();
      socketRef.current.emit("sync_state", { playing, currentTime });
    };
    return () => { (window as any).__watchPartySync = null; };
  }, [active]);

  const createRoom = async () => {
    await connectSocket();
    socketRef.current.emit("create_room", (data: any) => {
      setRoomId(data.roomId);
      setIsHost(true);
      setUserCount(1);
      setActive(true);
      setShowPanel(true);
    });
  };

  const joinRoom = async () => {
    if (!joinInput.trim()) return;
    await connectSocket();
    socketRef.current.emit("join_room", joinInput.trim(), (data: any) => {
      if (data.error) { alert(data.error); return; }
      setRoomId(data.roomId);
      setIsHost(data.isHost);
      setUserCount(data.userCount);
      setActive(true);
      setShowPanel(true);
      if (data.state) {
        const v = document.querySelector("video");
        if (v) {
          if (Math.abs(v.currentTime - data.state.currentTime) > 0.5) v.currentTime = data.state.currentTime;
          if (data.state.playing) v.play();
        }
      }
    });
  };

  const leaveRoom = () => {
    if (socketRef.current) socketRef.current.emit("leave_room");
    setActive(false);
    setRoomId("");
    setJoinInput("");
    setShowPanel(false);
    setUserCount(1);
    setMessages([]);
  };

  const copyRoomId = () => { navigator.clipboard.writeText(roomId); };

  const sendChat = () => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit("chat_message", { text: chatInput.trim() });
    setMessages((prev) => [...prev, { text: chatInput.trim(), userId: "me", timestamp: Date.now(), isMe: true }]);
    setChatInput("");
  };

  // If active — show room badge + chat
  if (active) {
    return (
      <div className="flex items-center gap-2">
        {/* Room badge */}
        <button
          onClick={copyRoomId}
          className="bg-brand-500/20 text-brand-500 font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-brand-500/30 hover:bg-brand-500/30"
          title="Click to copy room ID"
        >
          <Users className="w-4 h-4" />
          <span className="font-mono">{roomId}</span>
          <span className="text-xs opacity-70">· {userCount}</span>
        </button>

        {/* Chat toggle */}
        <button
          onClick={() => setShowChat(!showChat)}
          className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Chat</span>
        </button>

        {/* Leave */}
        <button
          onClick={leaveRoom}
          className="bg-white/10 backdrop-blur hover:bg-red-500/20 text-white hover:text-red-400 font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10 hover:border-red-500/30"
        >
          <LogOut className="w-4 h-4" />
        </button>

        {/* Chat panel */}
        {showChat && (
          <div className="fixed bottom-4 right-4 w-80 bg-ink-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-ink-800">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-500" />
                Room {roomId} · {userCount} users
              </span>
              <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-56 overflow-y-auto p-3 space-y-2 scroll-row">
              {messages.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-8">No messages yet</p>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`text-xs ${msg.isMe ? "text-right" : "text-left"}`}>
                    <span className={`inline-block px-3 py-1.5 rounded-lg ${msg.isMe ? "bg-brand-500/20 text-brand-500" : "bg-white/5 text-gray-300"}`}>
                      {msg.text}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 p-3 border-t border-white/5">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                placeholder="Type a message..."
                className="flex-1 bg-ink-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500/50"
              />
              <button onClick={sendChat} className="text-brand-500 hover:text-brand-400 p-2">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // If join input visible
  if (showPanel) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") joinRoom(); }}
          placeholder="ROOM ID"
          maxLength={6}
          className="w-28 bg-white/10 backdrop-blur border border-white/10 text-white text-sm font-mono uppercase px-3 py-2.5 rounded-lg focus:outline-none focus:border-brand-500/50"
        />
        <button
          onClick={joinRoom}
          className="bg-brand-500 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg transition"
        >
          Join
        </button>
        <button
          onClick={() => setShowPanel(false)}
          className="text-gray-400 hover:text-white p-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Default — two buttons
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={createRoom}
        className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10"
      >
        <Users className="w-4 h-4" />
        <span className="hidden sm:inline">Start Watch Party</span>
        <span className="sm:hidden">Party</span>
      </button>
      <button
        onClick={() => setShowPanel(true)}
        className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10"
      >
        <span className="text-xs">Join</span>
      </button>
    </div>
  );
}
