"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Users,
  X,
  Play,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Film,
  LogOut,
  MessageCircle,
  Send,
  Hash,
  Lock,
  Tv,
} from "lucide-react";

// NOBAR — Nonton Bareng
// Custom UI for VideoTogether watch party.
//
// Architecture:
// - VideoTogether (VT) script runs in background (loaded but panel HIDDEN)
// - VT panel (shadow DOM #VideoTogetherWrapper) is display:none always
// - This component renders NOBAR's own UI panel (slide-up from bottom-right)
// - NOBAR UI controls VT by manipulating shadow DOM elements directly:
//   • Set #videoTogetherRoomNameInput value + dispatch input event
//   • Click #videoTogetherCreateButton or #videoTogetherJoinButton
//   • Read #memberCount + #videoTogetherStatusText for state sync
// - State synced via MutationObserver on VT shadow DOM

type VideoState = "checking" | "native" | "embed";
type PartyState = "idle" | "host" | "member";
type ChatMessage = { text: string; isMe: boolean; ts: number };

export function WatchPartyButton() {
  const [loaded, setLoaded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [videoState, setVideoState] = useState<VideoState>("checking");
  const [partyState, setPartyState] = useState<PartyState>("idle");
  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joinRoomInput, setJoinRoomInput] = useState("");
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  const videoStateRef = useRef<VideoState>("checking");

  // ── Load VT script + hide native panel ──
  useEffect(() => {
    if (document.getElementById("vt-script")) {
      setLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "vt-script";
    script.src =
      "https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@latest/release/vt.en-us.website.js";
    script.async = true;
    script.onload = () => {
      console.log("[NOBAR] VideoTogether engine loaded");
      setLoaded(true);
      hideVtPanel();
      startStateSync();
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove — VT persists across navigations
    };
  }, []);

  // ── Detect video state (native vs embed) ──
  useEffect(() => {
    const hasNativeVideo = () => {
      const videos = document.querySelectorAll("video");
      for (const v of videos) {
        if (v.src && !v.src.startsWith("about:")) return true;
        const source = v.querySelector("source[src]");
        if (source) return true;
      }
      return false;
    };

    const hasEmbedIframe = () => {
      const iframes = document.querySelectorAll(
        'iframe[title*="Player"], iframe[src*="/api/embed"], iframe[src*="videm"], iframe[src*="vidlink"], iframe[src*="2embed"]'
      );
      return iframes.length > 0;
    };

    const evaluate = () => {
      let next: VideoState = "checking";
      if (hasNativeVideo()) {
        next = "native";
      } else if (hasEmbedIframe()) {
        // Same-origin /api/embed iframes ARE syncable by VT (no extension needed)!
        // VT can inject into same-origin iframes.
        next = "native"; // treat same-origin embed as native-compatible
      } else {
        next = "checking";
      }
      if (next !== videoStateRef.current) {
        videoStateRef.current = next;
        setVideoState(next);
      }
    };

    evaluate();
    const observer = new MutationObserver(() => evaluate());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    const settleTimer = window.setTimeout(() => {
      if (videoStateRef.current === "checking") {
        videoStateRef.current = "native"; // optimistic — /api/embed makes it work
        setVideoState("native");
      }
    }, 12000);

    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimer);
    };
  }, []);

  // ── Hide VT's native floating panel (keep engine running) ──
  const hideVtPanel = () => {
    const hide = () => {
      const wrapper = document.getElementById("VideoTogetherWrapper");
      const sr = (wrapper as any)?.shadowRoot as ShadowRoot | null;
      if (sr) {
        const panel = sr.getElementById("videoTogetherFlyPannel");
        if (panel) {
          panel.style.display = "none";
        }
        // Also inject CSS to keep it hidden even when VT tries to show it
        if (!sr.getElementById("nobar-vt-hide")) {
          const style = document.createElement("style");
          style.id = "nobar-vt-hide";
          style.textContent = `#videoTogetherFlyPannel { display: none !important; }`;
          sr.appendChild(style);
        }
      }
    };
    hide();
    // VT may re-show panel on state change — keep hiding
    const interval = setInterval(hide, 1000);
    return () => clearInterval(interval);
  };

  // ── Sync NOBAR UI with VT state (member count, status, role, room name) ──
  const startStateSync = () => {
    const sync = () => {
      const wrapper = document.getElementById("VideoTogetherWrapper");
      const sr = (wrapper as any)?.shadowRoot as ShadowRoot | null;
      if (!sr) return;

      // Read member count
      const memberEl = sr.getElementById("memberCount");
      if (memberEl) {
        const count = parseInt(memberEl.textContent?.replace(/\D/g, "") || "0", 10);
        if (!isNaN(count)) setMemberCount(count);
      }

      // Read status text
      const statusEl = sr.getElementById("videoTogetherStatusText");
      if (statusEl) {
        setStatusText(statusEl.textContent || "");
      }

      // Read role (Host/Member) — detect party state from VT
      const roleEl = sr.getElementById("videoTogetherRoleText");
      if (roleEl) {
        const role = (roleEl.textContent || "").toLowerCase();
        if (role.includes("host") || role.includes("master")) {
          if (partyState !== "host") setPartyState("host");
        } else if (role.includes("member") || role.includes("join")) {
          if (partyState !== "member") setPartyState("member");
        }
      }

      // Read room name from input (VT stores active room name in the input)
      const roomNameInput = sr.getElementById("videoTogetherRoomNameInput") as HTMLInputElement;
      if (roomNameInput && roomNameInput.value && roomNameInput.value !== "Room") {
        const name = roomNameInput.value.trim();
        if (name && name !== roomId) {
          setRoomId(name);
        }
      }
    };

    sync();
    const interval = setInterval(sync, 500);
    return () => clearInterval(interval);
  };

  // ── Create room via VT shadow DOM ──
  // VT reads this.inputRoomName.value on create button click.
  // We must set the value RIGHT BEFORE clicking create (VT resets it
  // to "Room" on panel init via InLobby). Setting value + dispatching
  // input event + then clicking create in same tick works.
  const createRoom = useCallback(async () => {
    try {
      const wrapper = document.getElementById("VideoTogetherWrapper");
      const sr = (wrapper as any)?.shadowRoot as ShadowRoot | null;
      if (!sr) {
        console.error("[NOBAR] No VT shadow root");
        return;
      }

      const name = roomId || generateRoomId();
      setRoomId(name);
      console.log("[NOBAR] Creating room:", name);

      const nameInput = sr.getElementById("videoTogetherRoomNameInput") as HTMLInputElement;
      if (!nameInput) {
        console.error("[NOBAR] No room name input in VT shadow DOM");
        return;
      }

      // Set value using native setter (React-controlled inputs need this)
      nameInput.value = name;
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      nameInput.dispatchEvent(new Event("change", { bubbles: true }));

      if (roomPassword) {
        const pwdInput = sr.getElementById("videoTogetherRoomPdIpt") as HTMLInputElement;
        if (pwdInput) {
          pwdInput.value = roomPassword;
          pwdInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      // Click create button — re-set value right before click (VT may reset)
      await new Promise((r) => setTimeout(r, 50));
      nameInput.value = name;
      const createBtn = sr.getElementById("videoTogetherCreateButton") as HTMLButtonElement;
      if (createBtn) {
        createBtn.click();
        setPartyState("host");
        console.log("[NOBAR] Create button clicked");
      }
    } catch (err) {
      console.error("[NOBAR] createRoom error:", err);
    }
  }, [roomId, roomPassword]);

  // ── Join room via VT shadow DOM ──
  const joinRoom = useCallback(async () => {
    if (!joinRoomInput.trim()) return;
    const wrapper = document.getElementById("VideoTogetherWrapper");
    const sr = (wrapper as any)?.shadowRoot as ShadowRoot | null;
    if (!sr) return;

    const name = joinRoomInput.trim();
    setRoomId(name);

    const nameInput = sr.getElementById("videoTogetherRoomNameInput") as HTMLInputElement;
    if (nameInput) {
      const nativeInputSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeInputSetter?.call(nameInput, name);
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      nameInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (joinPasswordInput) {
      const pwdInput = sr.getElementById("videoTogetherRoomPdIpt") as HTMLInputElement;
      if (pwdInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeSetter?.call(pwdInput, joinPasswordInput);
        pwdInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    await new Promise((r) => setTimeout(r, 50));
    const joinBtn = sr.getElementById("videoTogetherJoinButton") as HTMLButtonElement;
    if (joinBtn) {
      if (nameInput) nameInput.value = name;
      joinBtn.click();
      setPartyState("member");
    }
  }, [joinRoomInput, joinPasswordInput]);

  // ── Leave room via VT shadow DOM ──
  // VT has #videoTogetherExitButton (vt-btn-dangerous) that calls
  // window.videoTogetherExtension.exitRoom() on click.
  const leaveRoom = useCallback(() => {
    const wrapper = document.getElementById("VideoTogetherWrapper");
    const sr = (wrapper as any)?.shadowRoot as ShadowRoot | null;
    if (!sr) return;

    const exitBtn = sr.getElementById("videoTogetherExitButton") as HTMLButtonElement;
    if (exitBtn) {
      exitBtn.click();
    }

    setPartyState("idle");
    setRoomId("");
    setJoinRoomInput("");
    setJoinPasswordInput("");
    setRoomPassword("");
    setMessages([]);
    setShowChat(false);
  }, []);

  // ── Send chat ──
  const sendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    const wrapper = document.getElementById("VideoTogetherWrapper");
    const sr = (wrapper as any)?.shadowRoot as ShadowRoot | null;
    if (!sr) return;

    const chatInputEl = sr.getElementById("textMessageInput") as HTMLInputElement;
    if (chatInputEl) {
      chatInputEl.value = chatInput.trim();
      chatInputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const sendBtn = sr.getElementById("textMessageSend") as HTMLButtonElement;
    if (sendBtn) sendBtn.click();

    setMessages((prev) => [
      ...prev,
      { text: chatInput.trim(), isMe: true, ts: Date.now() },
    ]);
    setChatInput("");
  }, [chatInput]);

  // ── Copy room link ──
  const copyInvite = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const generateRoomId = () => {
    return "nobar-" + Math.random().toString(36).slice(2, 8);
  };

  const handleClick = () => {
    if (!loaded) return;
    setPanelOpen(true);
  };

  const buttonClass =
    videoState === "native"
      ? "group relative inline-flex items-center gap-2 bg-brand-500/15 hover:bg-brand-500/25 backdrop-blur text-brand-400 hover:text-brand-300 font-semibold h-11 px-5 rounded-full transition-all border border-brand-500/30 hover:border-brand-500/50 disabled:opacity-50 disabled:cursor-wait overflow-hidden"
      : "group relative inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold h-11 px-5 rounded-full transition-all border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-wait overflow-hidden";

  const statusDot = (
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        partyState !== "idle"
          ? "bg-brand-400"
          : videoState === "native"
            ? "bg-brand-400/50"
            : "bg-gray-400 animate-pulse"
      }`}
    />
  );

  return (
    <>
      {/* ── Trigger button (in hero action row) ── */}
      <button
        onClick={handleClick}
        disabled={!loaded}
        aria-label="Mulai NOBAR"
        title={partyState !== "idle" ? `NOBAR aktif — ${memberCount} member` : "Mulai NOBAR"}
        className={buttonClass}
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <Users className="w-4 h-4 relative z-10 flex-shrink-0" />
        <span className="relative z-10 hidden sm:inline">NOBAR</span>
        <span className="relative z-10 flex items-center gap-1 flex-shrink-0">
          {statusDot}
          {partyState !== "idle" && memberCount > 0 && (
            <span className="text-[10px] font-bold text-brand-400">{memberCount}</span>
          )}
        </span>
      </button>

      {/* ── Custom NOBAR panel (slide-up, bottom-right) ── */}
      {panelOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-end p-4 pointer-events-none">
          {/* Backdrop (click to close) — only catches clicks, no visual overlay */}
          <div
            className="absolute inset-0 pointer-events-auto"
            onClick={() => setPanelOpen(false)}
          />

          {/* Panel */}
          <div className="relative pointer-events-auto w-full max-w-sm bg-ink-900/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-brand-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 grid place-items-center">
                  <Users className="w-4 h-4 text-brand-400" />
                </div>
                <div>
                  <h3 className="font-display text-base font-extrabold text-white leading-tight">
                    NOBAR
                  </h3>
                  <p className="text-[11px] text-gray-400">Nonton bareng — sync film</p>
                </div>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto scroll-row">
              {/* Status badge */}
              {partyState !== "idle" && (
                <div className="flex items-center justify-between bg-brand-500/10 border border-brand-500/20 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                    <span className="text-xs font-semibold text-brand-400">
                      {partyState === "host" ? "Host" : "Member"} · {memberCount} online
                    </span>
                  </div>
                  {roomId && (
                    <button
                      onClick={copyInvite}
                      className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Tersalin" : "Salin link"}
                    </button>
                  )}
                </div>
              )}

              {/* Room ID display (if in room) */}
              {roomId && partyState !== "idle" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                  <Hash className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-sm font-mono text-white flex-1 truncate">{roomId}</span>
                </div>
              )}

              {/* Create room form (idle state) */}
              {partyState === "idle" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Hash className="w-3 h-3" /> Room ID
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        placeholder={generateRoomId()}
                        className="flex-1 bg-ink-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition"
                      />
                      <button
                        onClick={() => setRoomId(generateRoomId())}
                        className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs transition"
                        aria-label="Generate"
                        title="Generate random ID"
                      >
                        🎲
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> Password (opsional)
                    </label>
                    <input
                      type="text"
                      value={roomPassword}
                      onChange={(e) => setRoomPassword(e.target.value)}
                      placeholder="Kosongkan untuk room publik"
                      className="w-full bg-ink-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition"
                    />
                  </div>

                  <button
                    onClick={createRoom}
                    disabled={!roomId && !roomPassword}
                    className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-full flex items-center justify-center gap-2 transition shadow-lg shadow-brand-500/20"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    Buat Room
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">atau</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  {/* Join room */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Users className="w-3 h-3" /> Join Room
                    </label>
                    <input
                      type="text"
                      value={joinRoomInput}
                      onChange={(e) => setJoinRoomInput(e.target.value)}
                      placeholder="Room ID teman"
                      className="w-full bg-ink-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition mb-2"
                    />
                    <input
                      type="text"
                      value={joinPasswordInput}
                      onChange={(e) => setJoinPasswordInput(e.target.value)}
                      placeholder="Password (jika ada)"
                      className="w-full bg-ink-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition mb-2"
                    />
                    <button
                      onClick={joinRoom}
                      disabled={!joinRoomInput.trim()}
                      className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 hover:border-white/20 text-white font-semibold py-2.5 rounded-full transition"
                    >
                      Gabung Room
                    </button>
                  </div>
                </div>
              )}

              {/* Active room — chat + controls */}
              {partyState !== "idle" && (
                <div className="space-y-3">
                  {/* Chat toggle */}
                  <button
                    onClick={() => setShowChat(!showChat)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
                  >
                    <span className="flex items-center gap-2 text-sm text-white">
                      <MessageCircle className="w-4 h-4 text-brand-400" />
                      Chat
                    </span>
                    <span className="text-xs text-gray-400">{messages.length} pesan</span>
                  </button>

                  {/* Chat panel */}
                  {showChat && (
                    <div className="border border-white/10 rounded-lg overflow-hidden">
                      <div className="h-40 overflow-y-auto p-2 space-y-1.5 scroll-row bg-ink-950/50">
                        {messages.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center py-6">
                            Belum ada pesan. Mulai chat!
                          </p>
                        ) : (
                          messages.map((msg, i) => (
                            <div
                              key={i}
                              className={`text-xs ${
                                msg.isMe ? "text-right" : "text-left"
                              }`}
                            >
                              <span
                                className={`inline-block px-2 py-1 rounded-lg max-w-[80%] ${
                                  msg.isMe
                                    ? "bg-brand-500/20 text-brand-400"
                                    : "bg-white/5 text-gray-300"
                                }`}
                              >
                                {msg.text}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex items-center gap-2 p-2 border-t border-white/5 bg-ink-900">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") sendChat();
                          }}
                          placeholder="Ketik pesan…"
                          className="flex-1 bg-ink-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
                        />
                        <button
                          onClick={sendChat}
                          className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 transition"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Leave button */}
                  <button
                    onClick={leaveRoom}
                    className="w-full bg-accent-500/10 hover:bg-accent-500/20 border border-accent-500/25 hover:border-accent-500/40 text-accent-400 font-semibold py-2.5 rounded-full flex items-center justify-center gap-2 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    Keluar dari Room
                  </button>
                </div>
              )}

              {/* Status text from VT */}
              {statusText && (
                <p className="text-[10px] text-gray-500 text-center">{statusText}</p>
              )}

              {/* Info note */}
              {partyState === "idle" && (
                <div className="flex items-start gap-2 text-[10px] text-gray-500 bg-white/[0.02] rounded-lg p-2.5">
                  <AlertCircle className="w-3 h-3 flex-none mt-0.5" />
                  <p>
                    NOBAR sync video otomatis (play/pause/seek). Panel VideoTogether asli
                    disembunyikan — semua kontrol ada di sini.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
