import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  Avatar,
  CircularProgress,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { API, authHeaders } from "../auth";

const STORAGE_KEY = "zameen_db_chat_history_v1";

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value || "");
}

function HtmlReply({ html }) {
  const navigate = useNavigate();

  function onClick(event) {
    const anchor = event.target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("/")) {
      event.preventDefault();
      navigate(href);
    }
  }

  return (
    <Box
      className="db-chat-html"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
      sx={{ fontSize: "0.95rem", lineHeight: 1.45 }}
    />
  );
}

async function getBotReply(messages) {
  const payload = {
    messages: messages.map((m) => ({
      role: m.from === "user" ? "user" : "assistant",
      content: m.text,
    })),
  };

  try {
    const resp = await fetch(`${API}/chat-db`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "Sorry, I couldn't generate a response.";
      return { text: detail, properties: [] };
    }
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

export default function DbChatbot() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const sendDebounceRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch (e) {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {}
  }, [messages, hydrated]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 60);
    return () => clearTimeout(timer);
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    if (sendDebounceRef.current) return;
    sendDebounceRef.current = true;
    setTimeout(() => (sendDebounceRef.current = false), 600);

    const lastUser = [...messages].reverse().find((m) => m.from === "user");
    if (lastUser && lastUser.text.trim() === input.trim()) {
      setInput("");
      return;
    }

    const userMsg = { from: "user", text: input.trim(), time: Date.now() };
    const newHistory = [...messages, userMsg];
    setInput("");
    setLoading(true);
    setMessages(newHistory);

    let botPayload = { text: "", properties: [] };
    try {
      botPayload = await getBotReply(newHistory);
    } catch (e) {
      botPayload = { text: "Connection error: unable to reach assistant.", properties: [] };
    }

    const botMsg = {
      from: "bot",
      text: botPayload.text,
      properties: botPayload.properties || [],
      time: Date.now(),
    };

    setMessages((prev) => {
      const lastAssistant = [...prev].reverse().find((m) => m.from === "bot");
      if (lastAssistant && lastAssistant.text && botMsg.text && lastAssistant.text.trim() === botMsg.text.trim()) {
        return prev;
      }
      return [...prev, botMsg];
    });
    setLoading(false);
  }

  return (
    <Paper
      elevation={2}
      sx={{ width: "100%", minHeight: "70vh", display: "flex", flexDirection: "column", borderRadius: 2, overflow: "hidden", position: "relative" }}
    >
      <Box sx={{ px: 3, py: 2, display: "flex", alignItems: "center", background: "linear-gradient(90deg, #0f766e, #14b8a6, #0ea5a3)" }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ color: "white", fontWeight: 700, fontSize: "1.1rem" }}>Database Assistant</Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.88)", fontSize: "0.82rem" }}>
            Answers from your listings. Property names open their pages.
          </Typography>
        </Box>
        <Button
          color="inherit"
          onClick={() => {
            setMessages([]);
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
          }}
          sx={{ "&:hover": { background: "rgba(255, 255, 255, 0.1)" } }}
        >
          Clear
        </Button>
      </Box>

      <List ref={listRef} sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
        {messages.length === 0 && (
          <ListItem>
            <ListItemText
              primary="Ask about listings in your agency."
              secondary="Prices, beds, locations, and pitches come from the database, then the assistant writes the reply."
            />
          </ListItem>
        )}

        {messages.map((m, idx) => {
          const isUser = m.from === "user";
          const html = !isUser && looksLikeHtml(m.text);
          const linkedInText = html && /href\s*=\s*["']\/property\//i.test(m.text);
          return (
            <ListItem
              key={m.time || idx}
              sx={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start" }}
            >
              <Avatar sx={{ mx: 1 }}>{isUser ? "U" : "B"}</Avatar>
              <Box sx={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                <Box
                  sx={{
                    background: isUser ? "linear-gradient(135deg, #0f766e, #14b8a6)" : "#f8fafc",
                    color: isUser ? "white" : "#0f172a",
                    px: 2,
                    py: 1,
                    borderRadius: 3,
                    width: "100%",
                    border: isUser ? "none" : "1px solid rgba(15,118,110,0.18)",
                  }}
                >
                  {html ? (
                    <HtmlReply html={m.text} />
                  ) : (
                    <Typography sx={{ fontSize: "0.95rem", whiteSpace: "pre-line" }}>{m.text}</Typography>
                  )}
                </Box>
                {!isUser && !linkedInText && Array.isArray(m.properties) && m.properties.length > 0 && (
                  <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.75 }} className="db-chat-html">
                    {m.properties.filter((p) => /^\d+$/.test(String(p?.id ?? ""))).map((p) => (
                      <HtmlReply key={p.id} html={`<a href="/property/${p.id}">View property ${p.id}</a>`} />
                    ))}
                  </Box>
                )}
              </Box>
            </ListItem>
          );
        })}

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
        <TextField
          size="small"
          fullWidth
          placeholder="Ask about listings, prices, or a pitch..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
          disabled={loading}
        />
        <Button
          variant="contained"
          onClick={sendMessage}
          disabled={loading}
          sx={{
            background: "linear-gradient(90deg, #0f766e, #14b8a6)",
            "&:hover": { background: "linear-gradient(90deg, #0b5d56, #0f766e)" },
            "&:disabled": { background: "#ccc" },
          }}
        >
          Send
        </Button>
      </Box>
    </Paper>
  );
}
