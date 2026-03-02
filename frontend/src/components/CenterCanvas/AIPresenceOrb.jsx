import { useRef, useEffect } from 'react'
import './AIPresenceOrb.css'

const ORB_COLORS = {
    idle: { primary: '#6B7280', glow: '#9CA3AF30' },
    listening: { primary: '#4f8ef7', glow: '#4f8ef740' },
    thinking: { primary: '#f5a623', glow: '#f5a62340' },
    speaking: { primary: '#10d98a', glow: '#10d98a50' },
    interrupted: { primary: '#f97066', glow: '#f9706650' },
}

export default function AIPresenceOrb({ state = 'idle' }) {
    const colors = ORB_COLORS[state] || ORB_COLORS.idle

    return (
        <div className={`orb orb-${state}`} id="ai-presence-orb"
            style={{ '--orb-color': colors.primary, '--orb-glow': colors.glow }}>
            <div className="orb-core" />
            <div className="orb-ring orb-ring-1" />
            <div className="orb-ring orb-ring-2" />
            {state === 'speaking' && <div className="orb-particles" />}
        </div>
    )
}
