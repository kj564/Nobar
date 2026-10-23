"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Copy, LogOut, MessageCircle, Send, X } from "lucide-react";

type WatchPartyProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSeek: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
};

type ChatMessage = {
  text: string;
  userId: string;
  timestamp: number;
  isMe: boolean;
};

export function WatchParty({ videoRef, onSeek, onPlay, onPause }: WatchPartyProps) {
  const [active, setActive] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [userCount, setUserCount] = useState(1);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const socketRef = useRef<any>(null);
  const lastSyncRef = useRef(0);

  // Connect socket
  useEffect(() => {
    if (!active) return;

    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.5/socket.io.min.js";
    script.onload = () => {
      const socket = (window as any).io("/?XTransformPort=3032", {
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("sync_state", (data: any) => {
        // Ignore our own events (within 500ms)
        if (Date.now() - lastSyncRef.current < 500) return;

        const v = videoRef.current;
        if (!v) return;

        // Sync currentTime if drift > 0.5s
        if (Math.abs(v.currentTime - data.currentTime) > 0.5) {
          onSeek(data.currentTime);
        }

        // Sync play/pause
        if (data.playing && v.paused) {
          onPlay();
        } else if (!data.playing && !v.paused) {
          onPause();
        }
      });

      socket.on("user_joined", () => {
        setUserCount((c) => c + 1);
        setMessages((prev) => [...prev, { text: "Someone joined the room", userId: "", timestamp: Date.now(), isMe: false }]);
      });

      socket.on("user_left", () => {
        setUserCount((c) => Math.max(1, c - 1));
      });

      socket.on("chat_message", (data: any) => {
        setMessages((prev) => [...prev, { text: data.text, userId: data.userId, timestamp: data.timestamp, isMe: false }]);
      });
    };
    document.head.appendChild(script);

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("leave_room");
        socketRef.current.disconnect();
      }
      script.remove();
    };
  }, [active]);

  // Broadcast state changes
  const broadcastState = useCallback((playing: boolean, currentTime: number) => {
    if (!socketRef.current) return;
    lastSyncRef.current = Date.now();
    socketRef.current.emit("sync_state", { playing, currentTime });
  }, []);

  // Expose broadcastState to parent via ref-like callback
  useEffect(() => {
    (window as any).__watchPartySync = broadcastState;
  }, [broadcastState]);

  const createRoom = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("create_room", (data: any) => {
      setRoomId(data.roomId);
      setIsHost(true);
      setUserCount(1);
      setActive(true);
    });
  };

  const joinRoom = () => {
    if (!socketRef.current || !joinInput.trim()) return;
    socketRef.current.emit("join_room", joinInput.trim(), (data: any) => {
      if (data.error) {
        alert(data.error);
        return;
      }
      setRoomId(data.roomId);
      setIsHost(data.isHost);
      setUserCount(data.userCount);
      setActive(true);
      if (data.state) {
        const v = videoRef.current;
        if (v) {
          if (Math.abs(v.currentTime - data.state.currentTime) > 0.5) {
            onSeek(data.state.currentTime);
          }
          if (data.state.playing) onPlay();
        }
      }
    });
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit("leave_room");
    }
    setActive(false);
    setRoomId("");
    setJoinInput("");
    setUserCount(1);
    setMessages([]);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
  };

  const sendChat = () => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit("chat_message", { text: chatInput.trim() });
    setMessages((prev) => [...prev, { text: chatInput.trim(), userId: "me", timestamp: Date.now(), isMe: true }]);
    setChatInput("");
  };

  if (!active && !joinInput) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={createRoom}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500/20 text-brand-500 hover:bg-brand-500/30 transition text-sm font-semibold border border-brand-500/30"
        >
          <Users className="w-4 h-4" />
          Nobar Bareng
        </button>
        <button
          onClick={() => setActive(true)}
          className="text-xs text-gray-500 hover:text-gray-300 transition underline"
        >
          Join room
        </button>
      </div>
    );
  }

  if (!active) {
    // Join room UI
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value)}
          placeholder="Room ID"
          maxLength={6}
          className="w-24 px-3 py-2 rounded-lg bg-ink-800 border border-white/10 text-white text-sm uppercase focus:outline-none focus:border-brand-500/50"
        />
        <button
          onClick={joinRoom}
          className="px-3 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition"
        >
          Join
        </button>
        <button
          onClick={() => { setJoinInput(""); }}
          className="text-gray-500 hover:text-white transition p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Active room UI
  return (
    <div className="flex items-center gap-3">
      {/* Room badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-500/10 border border-brand-500/20">
        <Users className="w-4 h-4 text-brand-500" />
        <button onClick={copyRoomId} className="font-mono text-sm text-brand-500 font-bold hover:underline" title="Click to copy">
          {roomId}
        </button>
        <span className="text-xs text-gray-400">· {userCount} {userCount === 1 ? "user" : "users"}</span>
      </div>

      {/* Chat toggle */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="p-2 rounded-lg bg-ink-800 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition"
      >
        <MessageCircle className="w-4 h-4" />
      </button>

      {/* Leave */}
      <button
        onClick={leaveRoom}
        className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition"
      >
        <LogOut className="w-4 h-4" />
      </button>

      {/* Chat panel */}
      {showChat && (
        <div className="absolute bottom-16 right-4 w-72 bg-ink-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl z-30">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-ink-800">
            <span className="text-sm font-semibold">Chat · {roomId}</span>
            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="h-48 overflow-y-auto p-2 space-y-2 scroll-row">
            {messages.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">No messages yet</p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`text-xs ${msg.isMe ? "text-right" : "text-left"}`}>
                  <span className={`inline-block px-2 py-1 rounded ${msg.isMe ? "bg-brand-500/20 text-brand-500" : "bg-white/5 text-gray-300"}`}>
                    {msg.text}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-2 p-2 border-t border-white/5">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
              placeholder="Message..."
              className="flex-1 bg-ink-800 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-500/50"
            />
            <button onClick={sendChat} className="text-brand-500 hover:text-brand-400 transition p-1">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
