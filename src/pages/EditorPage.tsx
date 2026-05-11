import {useCallback, useEffect, useRef, useState} from "react"
import { useSearchParams } from "react-router-dom"

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "ws://localhost:8787"

interface ShowMeta {
    category: string;
    name: string
}

type Status = "idle" | "connecting" | "connected" | "disconnected" | "error"

export default function EditorPage() {

    const [searchParams] = useSearchParams()
    const [code, setCode] = useState(searchParams.get("code") ?? "")
    const [status, setStatus] = useState<Status>("idle")
    const [shows, setShows] = useState<ShowMeta[]>([])
    const [log, setLog] = useState<string[]>([])
    const ws = useRef<WebSocket | null>(null)

    const addLog = useCallback((msg: string) => {
        setLog(l => [...l.slice(-49), msg])
    }, [])

    const connect = useCallback(() => {
        if (!code) return
        setStatus("connecting")

        const socket = new WebSocket(`${RELAY_URL}?code=${code}&role=editor`)
        ws.current = socket

        socket.onopen = () => {
            console.log("WebSocket Connected")
            setStatus("connected")
            addLog("Connected. Fetching shows...")
            socket.send(JSON.stringify({action: "GET_SHOWS"}))
        }

        socket.onmessage = (e) => {
            const msg = JSON.parse(e.data)
            if (msg.type === "PONG") return
            addLog(`← ${JSON.stringify(msg)}`)
            if (msg.type === "SHOW_LIST") setShows(msg.shows)
            if (msg.type === "ERROR") {
                addLog(`✗ ${msg.message}`)
                if (msg.message === "No plugin connected to this session yet.") {
                    setStatus("error")
                    ws.current = null
                }
            }
            if (msg.type === "SUCCESS") addLog(`✓ ${msg.message}`)
            if (msg.type === "EDITOR_DISCONNECTED") {
                ws.current?.close()
                ws.current = null
                setStatus("disconnected")
            }
        }

        socket.onclose = () => {
            ws.current = null
            setStatus("disconnected")
        }

        socket.onerror = () => {
            console.log("WebSocket error")
            setStatus("error")
            ws.current = null
        }
    }, [code, addLog])

    useEffect(() => {
        if (status !== "connected") return
        const id = setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({type: "PING"}))
            }
        }, 5000)
        return () => clearInterval(id)
    }, [status])

// Auto-connect if code came from URL — fire exactly once
    const hasAutoConnected = useRef(false)
    useEffect(() => {
        if (!hasAutoConnected.current && searchParams.get("code")) {
            hasAutoConnected.current = true
            connect()
        }
    }, [connect, searchParams])

    function stopShow(category: string, name: string) {
        ws.current?.send(JSON.stringify({action: "STOP_SHOW", category, name}))
    }

    // ── Not connected yet ─────────────────────────────────────────
    if (status === "idle" || status === "disconnected" || status === "error") {
        return (
            <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: "100vh", gap: 12
            }}>
                <h2>EffectMaster Editor</h2>
                {status === "error" && <p style={{color: "red"}}>Connection failed.</p>}
                {status === "disconnected" && <p style={{color: "orange"}}>Disconnected.</p>}
                <p style={{color: "#888", fontSize: 13}}>
                    Run <code>/em editor</code> in-game to get a code.
                </p>
                <input
                    placeholder="Session code"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    style={{
                        padding: "8px 12px", fontSize: 18, textAlign: "center",
                        letterSpacing: 4, textTransform: "uppercase", width: 160
                    }}
                />
                <button onClick={connect} disabled={code.length < 4}>
                    Connect
                </button>
            </div>
        )
    }

    if (status === "connecting") {
        return <p style={{padding: 32}}>Connecting to session {code}…</p>
    }

    // ── Connected ─────────────────────────────────────────────────
    return (
        <div style={{display: "flex", height: "100vh", fontFamily: "monospace"}}>

            {/* Show list */}
            <div style={{width: 220, borderRight: "1px solid #333", overflowY: "auto", padding: 8}}>
                <div style={{fontSize: 11, color: "#888", marginBottom: 8}}>
                    SHOWS — session {code}
                </div>
                {shows.length === 0 && (
                    <div style={{color: "#555", fontSize: 12}}>No shows loaded.</div>
                )}
                {shows.map(s => (
                    <div key={`${s.category}/${s.name}`}
                         style={{
                             padding: "4px 8px", marginBottom: 4, background: "#1a1a1a",
                             borderRadius: 4
                         }}>
                        <div style={{fontSize: 11, color: "#888"}}>{s.category}</div>
                        <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <span style={{fontSize: 13}}>{s.name}</span>
                            <button
                                style={{
                                    fontSize: 11, padding: "1px 6px",
                                    background: "#5a1a1a", border: "none",
                                    color: "#fff", borderRadius: 3, cursor: "pointer"
                                }}
                                onClick={() => stopShow(s.category, s.name)}
                            >
                                stop
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Debug log */}
            <div style={{flex: 1, display: "flex", flexDirection: "column"}}>
                <div style={{
                    padding: "6px 12px", borderBottom: "1px solid #333",
                    fontSize: 12, color: "#4a4"
                }}>
                    ● Connected
                </div>
                <div style={{
                    flex: 1, overflowY: "auto", padding: 12, background: "#0d0d0d",
                    fontSize: 12, color: "#aaa"
                }}>
                    {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    )
}