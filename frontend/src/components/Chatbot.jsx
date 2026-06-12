import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  IconButton,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  Avatar,
  Fab,
  CircularProgress,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import CloseIcon from "@mui/icons-material/Close";
import { Link as RouterLink } from "react-router-dom";

const STORAGE_KEY = "zameen_chat_history_v2";
const OPEN_KEY = "zameen_chat_open_v2";
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const HF_MODEL = import.meta.env.VITE_HF_CHAT_MODEL || "";


async function getBotReply(messages) {
  const payload = {
    messages: messages.map((m) => ({
      role: m.from === "user" ? "user" : "assistant",
      content: m.text,
    })),
    model: HF_MODEL || undefined,
  };

  try {
    const resp = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    return {
      text: (data.response || "Sorry, I couldn't generate a response.").trim(),
      properties: data.properties || [],
    };
  } catch (e) {
    return {
      text: "Connection error: unable to reach assistant.",
      properties: [],
    };
  }
}

export default function Chatbot({ fullPage = false }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [llmLoaded, setLlmLoaded] = useState(false);
  const [llmChecking, setLlmChecking] = useState(true);
  const listRef = useRef(null);
  const sendDebounceRef = useRef(false);


  const renderMessages = () => {
    return (
      <>
        {messages.length === 0 && (
          <ListItem>
            <ListItemText
              primary="Ask me about prices, listings, or locations."
              secondary="(Powered by RAG + Hugging Face)"
            />
          </ListItem>
        )}

        {messages.map((m, idx) => {
          const isUser = m.from === "user";
          const bubbleBg = isUser ? "linear-gradient(135deg, #0f766e, #14b8a6)" : "#f8fafc";
          const bubbleColor = isUser ? "white" : "#0f172a";
          const bubbleMaxWidth = fullPage ? "80%" : "70%";

          return (
            <ListItem
              key={idx}
              sx={{
                display: "flex",
                flexDirection: isUser ? "row-reverse" : "row",
                alignItems: "flex-start",
              }}
            >
              <Avatar sx={{ mx: 1 }}>{isUser ? "U" : "B"}</Avatar>
              <Box
                sx={{
                  maxWidth: bubbleMaxWidth,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                }}
              >
                <Box
                  sx={{
                    background: bubbleBg,
                    color: bubbleColor,
                    px: 2,
                    py: 1,
                    borderRadius: 3,
                    width: "100%",
                    border: isUser ? "none" : "1px solid rgba(15,118,110,0.18)",
                    transition: "transform .22s ease",
                  }}
                >
                  <Typography sx={{ fontSize: "0.95rem", whiteSpace: "pre-line" }}>
                    {m.text}
                  </Typography>
                </Box>
                {!isUser && Array.isArray(m.properties) && m.properties.length > 0 && (
                  <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                    {m.properties
                      .filter((p) => p?.id)
                      .map((p, i) => {
                        const href = p.detail_url || `/property/${p.id}`;
                        return (
                      <Typography key={p.id || href || i} sx={{ fontSize: "0.85rem", lineHeight: 1.35 }}>
                        <RouterLink className="chat-link" to={href}>
                          • View details of property {p.id}
                        </RouterLink>
                      </Typography>
                        );
                      })}
                  </Box>
                )}
              </Box>
            </ListItem>
          );
        })}
      </>
    );
  };

  // Load saved chat + open state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch (e) {}

    try {
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch (e) {}
    setHydrated(true);
  }, []);

  // Check backend/LLM readiness (poll until healthy)
  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const resp = await fetch(`${API}/health`);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.status === "ok") {
            if (!mounted) return;
            setLlmLoaded(true);
            setLlmChecking(false);
            return;
          }
        }
      } catch (e) {
        // ignore and retry
      }

      if (!mounted) return;
      setTimeout(check, 2000);
    }

    check();

    return () => {
      mounted = false;
    };
  }, []);

  // Persist messages
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {}
  }, [messages, hydrated]);

  // Persist open state
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch (e) {}
  }, [open, hydrated]);

  // Auto-scroll when messages change
  useEffect(() => {
    try {
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 60);
    } catch (e) {}
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    if (!llmLoaded) return;

    // Quick debounce to avoid double-click / double-enter
    if (sendDebounceRef.current) return;
    sendDebounceRef.current = true;
    setTimeout(() => (sendDebounceRef.current = false), 600);

    // prevent sending exact duplicate of last user message
    const lastUser = [...messages].reverse().find((m) => m.from === "user");
    if (lastUser && lastUser.text.trim() === input.trim()) {
      setInput("");
      return;
    }

    const userMsg = {
      from: "user",
      text: input.trim(),
      time: Date.now(),
    };

    setInput("");

    // set loading early to prevent fast additional sends
    setLoading(true);

    // Build new history once, then update state and call botReply.
    // This avoids putting side-effects inside the state updater, which
    // React may invoke more than once in StrictMode (leading to 2 replies).
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    botReply(newHistory);
  }

  async function botReply(history) {
    let botPayload = { text: "", properties: [] };
    try {
      botPayload = await getBotReply(history);
    } catch (e) {
      botPayload = {
        text: "Connection error: unable to reach assistant.",
        properties: [],
      };
    }

    const botMsg = {
      from: "bot",
      text: botPayload.text,
      properties: botPayload.properties || [],
      time: Date.now(),
    };

    // Prevent adding duplicate assistant messages
    setMessages((prev) => {
      const lastAssistant = [...prev].reverse().find((m) => m.from === "bot");
      if (
        lastAssistant &&
        lastAssistant.text &&
        botMsg.text &&
        lastAssistant.text.trim() === botMsg.text.trim()
      ) {
        return prev;
      }
      return [...prev, botMsg];
    });

    setLoading(false);
  }

  return (
    <Box
      className={fullPage ? "" : "chatbot-root"}
      sx={
        fullPage
          ? {
              position: "relative",
              right: "auto",
              bottom: "auto",
              width: "100%",
            }
          : undefined
      }
    >
      {/* Chat Panel (floating or full page) */}
      {open && !fullPage && (
        <Paper
          elevation={10}
          sx={{
            position: "fixed",
            bottom: "90px",
            right: "20px",
            width: "360px",
            height: "520px",
            display: "flex",
            flexDirection: "column",
            borderRadius: "16px",
            overflow: "hidden",
            zIndex: 10000,
          }}
        >
          <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", background: 'linear-gradient(90deg, #0f766e, #14b8a6, #0ea5a3)' }}>
            <Typography sx={{ flex: 1, color: "white", fontWeight: 600 }}>Zameen Assistant</Typography>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseIcon sx={{ color: "white" }} />
            </IconButton>
          </Box>

          <List ref={listRef} sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 1 }}>
            {renderMessages()}

            {loading && (
              <ListItem sx={{ display: "flex", alignItems: "center" }}>
                <Avatar sx={{ mx: 1 }}>B</Avatar>
                <Box sx={{ bgcolor: "#f0f0f0", px: 2, py: 1.2, borderRadius: 3, display: "flex", gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography sx={{ fontSize: "0.85rem" }}>Typing…</Typography>
                </Box>
              </ListItem>
            )}
          </List>

          <Box sx={{ display: "flex", gap: 1, p: 2, borderTop: "1px solid #eee" }}>
            <TextField size="small" fullWidth placeholder={llmLoaded ? "Type a message..." : "Loading assistant..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} disabled={!llmLoaded} />
            <Button 
              variant="contained" 
              onClick={sendMessage} 
              disabled={loading || !llmLoaded}
              sx={{
                background: 'linear-gradient(90deg, #0f766e, #14b8a6)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #0b5d56, #0f766e)',
                },
                '&:disabled': {
                  background: '#ccc',
                },
              }}
            >
              Send
            </Button>
          </Box>
        </Paper>
      )}

      {/* Full page mode */}
      {fullPage && (
        <Paper elevation={2} sx={{ width: "100%", minHeight: "70vh", display: "flex", flexDirection: "column", borderRadius: 2, overflow: "hidden" }}>
          <Box sx={{ px: 3, py: 2, display: "flex", alignItems: "center", background: 'linear-gradient(90deg, #0f766e, #14b8a6, #0ea5a3)' }}>
            <Typography sx={{ flex: 1, color: "white", fontWeight: 700, fontSize: "1.1rem" }}>Zameen Assistant</Typography>
            <Button 
              color="inherit" 
              onClick={() => { setMessages([]); try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }}
              sx={{
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              Clear
            </Button>
          </Box>

          <List ref={listRef} sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
            {renderMessages()}

            {loading && (
              <ListItem sx={{ display: "flex", alignItems: "center" }}>
                <Avatar sx={{ mx: 1 }}>B</Avatar>
                <Box sx={{ bgcolor: "#f0f0f0", px: 2, py: 1.2, borderRadius: 3, display: "flex", gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography sx={{ fontSize: "0.95rem" }}>Typing…</Typography>
                </Box>
              </ListItem>
            )}
          </List>

          <Box sx={{ display: "flex", gap: 1, p: 2, borderTop: "1px solid #eee" }}>
            <TextField size="small" fullWidth placeholder={llmLoaded ? "Type a message..." : "Loading assistant..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} disabled={!llmLoaded} />
            <Button 
              variant="contained" 
              onClick={sendMessage} 
              disabled={loading || !llmLoaded}
              sx={{
                background: 'linear-gradient(90deg, #0f766e, #14b8a6)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #0b5d56, #0f766e)',
                },
                '&:disabled': {
                  background: '#ccc',
                },
              }}
            >
              Send
            </Button>
          </Box>

          {/* Loading overlay when assistant not ready */}
          {(!llmLoaded || llmChecking) && (
            <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(255,255,255,0.8)", zIndex: 1200 }}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <CircularProgress />
                <Typography>Loading assistant — please wait</Typography>
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* Floating Action Button (only when not fullPage) */}
      {!fullPage && (
        <Fab 
          className="chatbot-fab"
          aria-label="chat" 
          sx={{ 
            position: "fixed", 
            bottom: "20px", 
            right: "20px", 
            zIndex: 9999,
            background: 'linear-gradient(135deg, #0f766e, #14b8a6, #0ea5a3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #0b5d56, #0f766e, #0ea5a3)',
              transform: 'scale(1.05)',
            },
            boxShadow: '0 10px 28px rgba(15, 118, 110, 0.35)',
            transition: 'all 0.3s ease',
          }} 
          onClick={() => setOpen((o) => !o)}
        >
          <ChatIcon />
        </Fab>
      )}
    </Box>
  );
}
