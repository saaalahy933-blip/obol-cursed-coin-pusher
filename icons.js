/**
 * OBOL: The Cursed Coin Pusher
 * Bespoke Dark-Occult Metallic Inline SVG Vector Iconography Library (S2)
 * Eliminates all OS system unicode emojis across HUD, Modals, Tokens, Relics & Controls.
 */

(function () {
  const DEFS = `
    <defs>
      <linearGradient id="og-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff0a8"/>
        <stop offset="50%" stop-color="#ffd86b"/>
        <stop offset="100%" stop-color="#9e6b18"/>
      </linearGradient>
      <linearGradient id="og-crimson" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ff8a96"/>
        <stop offset="50%" stop-color="#ff3b4e"/>
        <stop offset="100%" stop-color="#7a0916"/>
      </linearGradient>
      <linearGradient id="og-emerald" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#a8ffcb"/>
        <stop offset="50%" stop-color="#38ef7d"/>
        <stop offset="100%" stop-color="#0d6e34"/>
      </linearGradient>
      <linearGradient id="og-violet" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#e2b8ff"/>
        <stop offset="50%" stop-color="#b86bff"/>
        <stop offset="100%" stop-color="#48148c"/>
      </linearGradient>
      <linearGradient id="og-iron" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ece4d8"/>
        <stop offset="50%" stop-color="#c5b8a5"/>
        <stop offset="100%" stop-color="#5c5044"/>
      </linearGradient>
      <linearGradient id="og-copper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffb884"/>
        <stop offset="50%" stop-color="#d87a3c"/>
        <stop offset="100%" stop-color="#6e3212"/>
      </linearGradient>
      <linearGradient id="og-cyan" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d4ffff"/>
        <stop offset="50%" stop-color="#5ce1e6"/>
        <stop offset="100%" stop-color="#145c73"/>
      </linearGradient>
    </defs>
  `;

  const PATHS = {
    // === 18 TOKENS ===
    obol: `
      <circle cx="12" cy="12" r="9.5" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#522108" stroke-width="1.2" stroke-dasharray="2 1.5"/>
      <path d="M12 7.5 L14.8 12 L12 16.5 L9.2 12 Z" fill="#ffd86b" stroke="#522108" stroke-width="1"/>
    `,
    drachma: `
      <circle cx="12" cy="12" r="9.5" fill="url(#og-iron)" stroke="#ece4d8" stroke-width="1.6"/>
      <circle cx="12" cy="12" r="6.8" fill="none" stroke="#3a322c" stroke-width="1.1"/>
      <path d="M8.5 9.5 L15.5 9.5 L12 16.5 Z" fill="none" stroke="#ffd86b" stroke-width="1.5"/>
      <circle cx="12" cy="11.8" r="1.8" fill="#ffd86b"/>
    `,
    heavy: `
      <rect x="5" y="4" width="14" height="16" rx="2.5" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.5"/>
      <line x1="5" y1="9" x2="19" y2="9" stroke="#ffd86b" stroke-width="1.4"/>
      <line x1="5" y1="15" x2="19" y2="15" stroke="#ffd86b" stroke-width="1.4"/>
      <path d="M12 10.2 C10 12.5 10 14 12 14.5 C14 14 14 12.5 12 10.2 Z" fill="url(#og-crimson)"/>
    `,
    SHIELD: `
      <path d="M12 2.5 L20 6 V11.5 C20 16.8 16.5 20.3 12 21.8 C7.5 20.3 4 16.8 4 11.5 V6 L12 2.5 Z" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.6"/>
      <path d="M12 5.5 L17 7.8 V11.5 C17 15 14.8 17.6 12 18.8 C9.2 17.6 7 15 7 11.5 V7.8 L12 5.5 Z" fill="none" stroke="#ffd86b" stroke-width="1.1"/>
      <path d="M12 8 V16 M8.5 11.5 H15.5" stroke="#ffd86b" stroke-width="1.5" stroke-linecap="round"/>
    `,
    BOMB: `
      <circle cx="11" cy="13.5" r="7.5" fill="url(#og-iron)" stroke="#ff3b4e" stroke-width="1.5"/>
      <path d="M15.5 7.5 L17.5 5.5 C18.8 4.2 20.5 5 20.5 6.8" fill="none" stroke="#ffd86b" stroke-width="1.6" stroke-linecap="round"/>
      <polygon points="20,2.5 21.2,4.8 23.5,5.2 21.5,6.8 22,9 20,7.7 18,9 18.5,6.8 16.5,5.2 18.8,4.8" fill="#ff3b4e"/>
      <circle cx="9" cy="11.5" r="1.8" fill="#ffd86b" opacity="0.8"/>
    `,
    MAGNET: `
      <path d="M6 5 V12.5 C6 16.2 8.7 19 12 19 C15.3 19 18 16.2 18 12.5 V5" fill="none" stroke="url(#og-crimson)" stroke-width="4" stroke-linecap="round"/>
      <rect x="4" y="3.5" width="4" height="3.5" fill="url(#og-iron)" stroke="#c5b8a5" stroke-width="1"/>
      <rect x="16" y="3.5" width="4" height="3.5" fill="url(#og-iron)" stroke="#c5b8a5" stroke-width="1"/>
      <path d="M10.5 8 L13.5 11 L11.5 11 L13.5 14.5" fill="none" stroke="#5ce1e6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    CURSED: `
      <circle cx="12" cy="12" r="9.5" fill="#1a0d26" stroke="url(#og-violet)" stroke-width="1.6"/>
      <path d="M8.5 10.5 C8.5 7.8 15.5 7.8 15.5 10.5 C15.5 12.2 14.5 13 14.5 14.5 H9.5 C9.5 13 8.5 12.2 8.5 10.5 Z" fill="url(#og-iron)"/>
      <circle cx="10.4" cy="10.5" r="1.2" fill="#ff3b4e"/>
      <circle cx="13.6" cy="10.5" r="1.2" fill="#ff3b4e"/>
      <path d="M10 15.2 V17.2 M12 15.2 V17.5 M14 15.2 V17.2" stroke="#c5b8a5" stroke-width="1.3" stroke-linecap="round"/>
    `,
    MIMIC: `
      <circle cx="12" cy="12" r="9.5" fill="url(#og-gold)" stroke="#ff3b4e" stroke-width="1.5"/>
      <path d="M5.5 12 Q12 7 18.5 12 Q12 17.5 5.5 12 Z" fill="#3a0711" stroke="#ffd86b" stroke-width="1.2"/>
      <polygon points="8,10.8 9.2,13 10.4,10.5" fill="#fff0a8"/>
      <polygon points="13.6,10.5 14.8,13 16,10.8" fill="#fff0a8"/>
      <polygon points="10.2,13.5 11.4,11.2 12.6,13.5" fill="#fff0a8"/>
      <circle cx="12" cy="12" r="1.6" fill="#ff3b4e"/>
    `,
    GLASS: `
      <polygon points="12,2.5 20.5,8.5 17.5,19.5 6.5,19.5 3.5,8.5" fill="url(#og-cyan)" stroke="#ece4d8" stroke-width="1.5"/>
      <polygon points="12,5.5 17,9.5 15,16.5 9,16.5 7,9.5" fill="none" stroke="#ffffff" stroke-width="1.1"/>
      <path d="M12 2.5 L12 19.5 M3.5 8.5 L20.5 8.5" stroke="#ffffff" stroke-width="0.9" opacity="0.7"/>
    `,
    BLOOD: `
      <path d="M12 2.8 C12 2.8 5.5 10.2 5.5 15 C5.5 18.6 8.4 21.5 12 21.5 C15.6 21.5 18.5 18.6 18.5 15 C18.5 10.2 12 2.8 12 2.8 Z" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.4"/>
      <path d="M9.5 13.5 C9.5 15.8 10.8 17.5 12.5 18" fill="none" stroke="#ffd86b" stroke-width="1.4" stroke-linecap="round"/>
    `,
    SOUL: `
      <circle cx="9.2" cy="9.2" r="4.5" fill="none" stroke="url(#og-emerald)" stroke-width="2.2"/>
      <circle cx="14.8" cy="14.8" r="4.5" fill="none" stroke="url(#og-cyan)" stroke-width="2.2"/>
      <path d="M11.5 11.5 L12.5 12.5" stroke="#ffd86b" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="#38ef7d" stroke-width="1" stroke-dasharray="3 2"/>
    `,
    VOID: `
      <circle cx="12" cy="12" r="8.5" fill="#090314" stroke="url(#og-violet)" stroke-width="1.8"/>
      <path d="M12 4 C17 4 20 8 18 13 C16 18 10 20 6 16 C3 13 4 7 9 6" fill="none" stroke="#b86bff" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="12" cy="12" r="3.2" fill="#000000" stroke="#ffd86b" stroke-width="1.2"/>
    `,
    CROWN: `
      <path d="M3.5 17.5 L5.2 7.5 L9.8 12 L12 5.5 L14.2 12 L18.8 7.5 L20.5 17.5 Z" fill="url(#og-gold)" stroke="#ffd86b" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="3.5" y="17.5" width="17" height="2.8" rx="1" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.2"/>
      <circle cx="12" cy="14.2" r="1.4" fill="#ff3b4e"/>
    `,
    DICE: `
      <rect x="4" y="4" width="16" height="16" rx="3" fill="url(#og-violet)" stroke="#ffd86b" stroke-width="1.6"/>
      <circle cx="8.5" cy="8.5" r="1.4" fill="#ffd86b"/>
      <circle cx="15.5" cy="8.5" r="1.4" fill="#ffd86b"/>
      <circle cx="12" cy="12" r="1.5" fill="#ff3b4e"/>
      <circle cx="8.5" cy="15.5" r="1.4" fill="#ffd86b"/>
      <circle cx="15.5" cy="15.5" r="1.4" fill="#ffd86b"/>
    `,
    HOURGLASS: `
      <path d="M6 3.5 H18 M6 20.5 H18" stroke="url(#og-gold)" stroke-width="2" stroke-linecap="round"/>
      <path d="M7.5 3.5 L12 11.5 L16.5 3.5 M7.5 20.5 L12 12.5 L16.5 20.5" fill="url(#og-cyan)" fill-opacity="0.35" stroke="#ffd86b" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="12" cy="12" r="1.4" fill="#38ef7d"/>
    `,
    WEB: `
      <polygon points="12,2.5 20.2,7.2 20.2,16.8 12,21.5 3.8,16.8 3.8,7.2" fill="none" stroke="url(#og-iron)" stroke-width="1.5"/>
      <polygon points="12,6.5 16.8,9.2 16.8,14.8 12,17.5 7.2,14.8 7.2,9.2" fill="none" stroke="#c5b8a5" stroke-width="1.2"/>
      <path d="M12 2.5 V21.5 M3.8 7.2 L20.2 16.8 M20.2 7.2 L3.8 16.8" stroke="#ffd86b" stroke-width="1.1"/>
    `,
    CANDLE: `
      <rect x="8.5" y="10.5" width="7" height="10" rx="1" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.4"/>
      <path d="M12 3 C12 3 9 6.2 9 8.2 C9 9.8 10.3 10.8 12 10.8 C13.7 10.8 15 9.8 15 8.2 C15 6.2 12 3 12 3 Z" fill="url(#og-gold)" stroke="#ff3b4e" stroke-width="1.2"/>
      <path d="M6 20.5 H18" stroke="#ffd86b" stroke-width="1.8" stroke-linecap="round"/>
    `,
    SUN: `
      <circle cx="12" cy="12" r="5.8" fill="url(#og-gold)" stroke="#ff3b4e" stroke-width="1.4"/>
      <path d="M12 2 V4.8 M12 19.2 V22 M2 12 H4.8 M19.2 12 H22 M4.9 4.9 L6.9 6.9 M17.1 17.1 L19.1 19.1 M19.1 4.9 L17.1 6.9 M6.9 17.1 L4.9 19.1" stroke="#ffd86b" stroke-width="1.8" stroke-linecap="round"/>
    `,

    // === 3 FUSIONS ===
    SOLAR_CULT: `
      <circle cx="12" cy="12" r="9.5" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.6"/>
      <path d="M5 15.5 L7 8.5 L10.5 12 L12 6.5 L13.5 12 L17 8.5 L19 15.5 Z" fill="url(#og-gold)" stroke="#520810" stroke-width="1.1"/>
      <circle cx="12" cy="13.2" r="1.5" fill="#ff3b4e"/>
    `,
    VOID_GRAVITY: `
      <circle cx="12" cy="12" r="9.5" fill="#0b0418" stroke="url(#og-violet)" stroke-width="1.8"/>
      <ellipse cx="12" cy="12" rx="8.5" ry="3.8" transform="rotate(-28 12 12)" fill="none" stroke="#5ce1e6" stroke-width="1.5"/>
      <ellipse cx="12" cy="12" rx="8.5" ry="3.8" transform="rotate(28 12 12)" fill="none" stroke="#b86bff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="3.4" fill="url(#og-violet)" stroke="#ffd86b" stroke-width="1.2"/>
    `,
    PLASMA_BOMB: `
      <circle cx="12" cy="12" r="9" fill="url(#og-cyan)" stroke="#ffd86b" stroke-width="1.6"/>
      <polygon points="13,3.5 7.5,13 12,13 10.5,20.5 16.8,11 12.2,11" fill="url(#og-gold)" stroke="#145c73" stroke-width="1.1"/>
    `,

    // === NEW EXPANSION TOKENS, FUSIONS & RELICS ===
    mercury: `
      <circle cx="12" cy="12" r="9.5" fill="url(#og-iron)" stroke="#5ce1e6" stroke-width="1.5"/>
      <path d="M8.5 5.2 C8.5 7.5 15.5 7.5 15.5 5.2" fill="none" stroke="url(#og-cyan)" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="12" cy="10.2" r="3.4" fill="none" stroke="url(#og-cyan)" stroke-width="1.8"/>
      <path d="M12 13.6 V19.5 M9.2 16.5 H14.8" stroke="#ffd86b" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="12" cy="10.2" r="1.3" fill="#ffd86b"/>
    `,
    hellfire: `
      <circle cx="12" cy="12" r="9.5" fill="#2b060a" stroke="url(#og-crimson)" stroke-width="1.6"/>
      <path d="M5.5 16.5 L7.2 8.5 L10.2 12.2 L12 5.2 L13.8 12.2 L16.8 8.5 L18.5 16.5 Z" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M12 9.5 V18.5 M9.2 14.2 H14.8" stroke="#fff0a8" stroke-width="1.6" stroke-linecap="round"/>
    `,
    ferry: `
      <circle cx="12" cy="12" r="9.5" fill="#071f1a" stroke="url(#og-emerald)" stroke-width="1.5"/>
      <path d="M4.5 14.5 Q12 19.5 19.5 14.5 L17.5 17.8 H6.5 Z" fill="url(#og-gold)" stroke="#38ef7d" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M8 14.5 L15.5 5.5 M14.5 5.5 L17.5 8.5" stroke="url(#og-cyan)" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="8.2" cy="8.5" r="2" fill="url(#og-gold)"/>
    `,
    mirror: `
      <polygon points="8.5,3 15.5,3 21,8.5 21,15.5 15.5,21 8.5,21 3,15.5 3,8.5" fill="#120824" stroke="url(#og-violet)" stroke-width="1.6"/>
      <polygon points="9.5,5.5 14.5,5.5 18.5,9.5 18.5,14.5 14.5,18.5 9.5,18.5 5.5,14.5 5.5,9.5" fill="url(#og-cyan)" fill-opacity="0.28" stroke="#ffd86b" stroke-width="1.2"/>
      <path d="M8.5 9.5 L14.5 15.5 M10.5 7.5 L16.5 13.5" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
    `,
    leviathan: `
      <circle cx="12" cy="12" r="9.5" fill="#061c24" stroke="url(#og-cyan)" stroke-width="1.7"/>
      <path d="M6.5 16.5 C5.5 12 9.5 10.5 12 13 C14.5 15.5 18.5 13.5 17 9.5 C15.8 6.8 12.5 6.5 10.5 8.5" fill="none" stroke="url(#og-emerald)" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M9 5.5 L10.8 3.5 L12 5.2 L13.2 3.5 L15 5.5" fill="none" stroke="#ffd86b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="11.2" cy="8.2" r="1.3" fill="#ff3b4e"/>
    `,
    juggernaut: `
      <circle cx="12" cy="12" r="9.5" fill="#26070a" stroke="url(#og-crimson)" stroke-width="1.7"/>
      <path d="M4.5 8.5 C4.5 4.5 8.5 5 9.5 7.5 L14.5 7.5 C15.5 5 19.5 4.5 19.5 8.5 C18 9.8 16.5 10 15.8 11.5 L14.2 17.5 H9.8 L8.2 11.5 C7.5 10 6 9.8 4.5 8.5 Z" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="10" cy="11.5" r="1.4" fill="#fff0a8"/>
      <circle cx="14" cy="11.5" r="1.4" fill="#fff0a8"/>
      <path d="M10.2 15.2 H13.8" stroke="#ff3b4e" stroke-width="1.6" stroke-linecap="round"/>
    `,
    gate: `
      <path d="M4.5 20 V8.5 C4.5 5 8 3 12 3 C16 3 19.5 5 19.5 8.5 V20" fill="none" stroke="url(#og-gold)" stroke-width="2" stroke-linecap="round"/>
      <rect x="3.5" y="18.5" width="4" height="2.5" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1"/>
      <rect x="16.5" y="18.5" width="4" height="2.5" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1"/>
      <path d="M8 12 H16 M12 8 V16" stroke="url(#og-emerald)" stroke-width="1.8" stroke-linecap="round"/>
    `,
    die: `
      <rect x="4" y="4" width="16" height="16" rx="3" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.6"/>
      <circle cx="8" cy="8" r="1.4" fill="#2b070c"/>
      <circle cx="16" cy="8" r="1.4" fill="#2b070c"/>
      <circle cx="12" cy="12" r="1.8" fill="url(#og-crimson)"/>
      <circle cx="8" cy="16" r="1.4" fill="#2b070c"/>
      <circle cx="16" cy="16" r="1.4" fill="#2b070c"/>
    `,

    // === 12 RELICS ===
    RELIC_GUTTER: `
      <rect x="3.5" y="4" width="4" height="16" rx="1" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.3"/>
      <rect x="16.5" y="4" width="4" height="16" rx="1" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.3"/>
      <path d="M7.5 8 H16.5 M7.5 12 H16.5 M7.5 16 H16.5" stroke="#ff3b4e" stroke-width="1.6"/>
    `,
    RELIC_MAGNET: `
      <path d="M6.5 5 V12.5 C6.5 16 9 18.5 12 18.5 C15 18.5 17.5 16 17.5 12.5 V5" fill="none" stroke="url(#og-crimson)" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M12 8.5 C12 8.5 9.5 11.8 9.5 13.5 C9.5 15 10.6 16 12 16 C13.4 16 14.5 15 14.5 13.5 C14.5 11.8 12 8.5 12 8.5 Z" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1"/>
    `,
    RELIC_FUSE: `
      <rect x="5" y="4" width="14" height="6" rx="1.5" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.4"/>
      <rect x="9.5" y="10" width="5" height="7" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.2"/>
      <path d="M6 17 H18 L20 20.5 H4 Z" fill="url(#og-gold)" stroke="#ffd86b" stroke-width="1.2"/>
    `,
    RELIC_DUP: `
      <circle cx="8" cy="17" r="3" fill="none" stroke="url(#og-iron)" stroke-width="1.8"/>
      <circle cx="16" cy="17" r="3" fill="none" stroke="url(#og-iron)" stroke-width="1.8"/>
      <path d="M9.8 14.5 L17 4.5 M14.2 14.5 L7 4.5" stroke="url(#og-crimson)" stroke-width="2.2" stroke-linecap="round"/>
    `,
    RELIC_CHEST: `
      <path d="M4 9.5 H20 L18 19.5 H6 Z" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.5"/>
      <path d="M8 13 H16 M10 16 H14" stroke="#ff3b4e" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M12 3.5 L15 7.5 H9 Z" fill="url(#og-gold)"/>
    `,
    RELIC_MIDAS: `
      <path d="M12 3 C12 3 6 10 6 14.8 C6 18.2 8.7 21 12 21 C15.3 21 18 18.2 18 14.8 C18 10 12 3 12 3 Z" fill="url(#og-gold)" stroke="#ece4d8" stroke-width="1.5"/>
      <circle cx="10.2" cy="14.5" r="1.5" fill="#fff0a8"/>
    `,
    RELIC_VAMPIRE: `
      <path d="M3 11 C6 7 9 8 12 11 C15 8 18 7 21 11 C18 13 15 15 12 18 C9 15 6 13 3 11 Z" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.4"/>
      <polygon points="10,12 10.8,15.5 11.6,12" fill="#ffffff"/>
      <polygon points="12.4,12 13.2,15.5 14,12" fill="#ffffff"/>
    `,
    RELIC_SPEED: `
      <polygon points="12,3 19,20 5,20" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="12" y1="18" x2="16.5" y2="8" stroke="#ff3b4e" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="18" r="1.8" fill="#ffd86b"/>
    `,
    RELIC_HEAVY: `
      <polygon points="13.5,2.5 6.5,13 12,13 10,21.5 17.5,11 12,11" fill="url(#og-cyan)" stroke="#ffd86b" stroke-width="1.5" stroke-linejoin="round"/>
    `,
    RELIC_CROWN: `
      <rect x="3.5" y="5" width="17" height="14" rx="2" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.6"/>
      <rect x="6.5" y="9" width="3.2" height="6" fill="url(#og-gold)"/>
      <rect x="10.4" y="9" width="3.2" height="6" fill="url(#og-gold)"/>
      <rect x="14.3" y="9" width="3.2" height="6" fill="url(#og-gold)"/>
    `,
    RELIC_COMBO: `
      <path d="M12 2.5 C12 2.5 18 7.5 18 13.5 C18 17.5 15.3 20.8 12 21.5 C8.7 20.8 6 17.5 6 13.5 C6 10.5 8 8 8 8 C8 10.5 10 11.5 10 11.5 C9.5 8 12 2.5 12 2.5 Z" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.4"/>
      <circle cx="12" cy="15.8" r="2.6" fill="url(#og-gold)"/>
    `,
    RELIC_BUMPER: `
      <circle cx="12" cy="12" r="8.5" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.8"/>
      <circle cx="12" cy="12" r="4.5" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.3"/>
      <path d="M12 1.5 V4.5 M12 19.5 V22.5 M1.5 12 H4.5 M19.5 12 H22.5" stroke="#ffd86b" stroke-width="1.8" stroke-linecap="round"/>
    `,

    // === UI & HUD SYMBOLS ===
    finger: `
      <rect x="9" y="3.5" width="6" height="16.5" rx="3" fill="url(#og-gold)" stroke="#ece4d8" stroke-width="1.4"/>
      <path d="M10.2 5.2 H13.8" stroke="#fff0a8" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="9.2" y1="10.5" x2="14.8" y2="10.5" stroke="#6e3212" stroke-width="1.3"/>
      <line x1="9.2" y1="14.5" x2="14.8" y2="14.5" stroke="#6e3212" stroke-width="1.3"/>
    `,
    severed: `
      <circle cx="12" cy="12" r="9" fill="#2b070c" stroke="#ff3b4e" stroke-width="1.6"/>
      <path d="M7.5 7.5 L16.5 16.5 M16.5 7.5 L7.5 16.5" stroke="url(#og-crimson)" stroke-width="2.6" stroke-linecap="round"/>
    `,
    skull: `
      <path d="M6 10.5 C6 6 9 3.5 12 3.5 C15 3.5 18 6 18 10.5 C18 13 16.8 14.5 16 15.8 V19.5 H8 V15.8 C7.2 14.5 6 13 6 10.5 Z" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.5"/>
      <circle cx="9.6" cy="10.5" r="1.6" fill="#ff3b4e"/>
      <circle cx="14.4" cy="10.5" r="1.6" fill="#ff3b4e"/>
      <path d="M10 16.5 V19.5 M12 16.5 V19.5 M14 16.5 V19.5" stroke="#2b231e" stroke-width="1.3"/>
    `,
    trophy: `
      <path d="M7 4.5 H17 V10 C17 13 14.8 15 12 15 C9.2 15 7 13 7 10 Z" fill="url(#og-gold)" stroke="#ece4d8" stroke-width="1.4"/>
      <path d="M7 6.5 H4.5 V9.5 C4.5 11 5.5 12 7 12 M17 6.5 H19.5 V9.5 C19.5 11 18.5 12 17 12" fill="none" stroke="#ffd86b" stroke-width="1.5"/>
      <path d="M12 15 V18.5 M8 19.5 H16" stroke="#ffd86b" stroke-width="2" stroke-linecap="round"/>
    `,
    alembic: `
      <path d="M9.5 3.5 H14.5 M10.5 3.5 V8.5 L5.5 17.5 C4.8 18.8 5.7 20.5 7.2 20.5 H16.8 C18.3 20.5 19.2 18.8 18.5 17.5 L13.5 8.5 V3.5" fill="url(#og-violet)" stroke="#ffd86b" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M7.2 15.5 H16.8" stroke="#38ef7d" stroke-width="1.6"/>
    `,
    coin: `
      <circle cx="12" cy="12" r="9" fill="url(#og-gold)" stroke="#ece4d8" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="6" fill="none" stroke="#805310" stroke-width="1.2"/>
      <path d="M12 8 V16 M9.8 10 H14.2 M9.8 14 H14.2" stroke="#523004" stroke-width="1.5" stroke-linecap="round"/>
    `,
    gear: `
      <circle cx="12" cy="12" r="6.8" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.6"/>
      <circle cx="12" cy="12" r="2.8" fill="#181210" stroke="#ffd86b" stroke-width="1.2"/>
      <path d="M12 2.2 V5 M12 19 V21.8 M2.2 12 H5 M19 12 H21.8 M5 5 L7 7 M17 17 L19 19 M19 5 L17 7 M7 17 L5 19" stroke="#ffd86b" stroke-width="2.2" stroke-linecap="round"/>
    `,
    film: `
      <rect x="3.5" y="5" width="17" height="14" rx="2" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.5"/>
      <polygon points="10,9 16,12 10,15" fill="url(#og-crimson)"/>
    `,
    book: `
      <path d="M4 5.5 C4 4.5 5 4 6.5 4 H18.5 V19.5 H6.5 C5 19.5 4 18.8 4 17.5 Z" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.5"/>
      <path d="M7.5 4 V19.5 M11.5 8.5 H15.5 M11.5 12 H15.5" stroke="#ffd86b" stroke-width="1.4" stroke-linecap="round"/>
    `,
    pouch: `
      <path d="M9 4.5 H15 L13.5 7.5 H10.5 Z" fill="url(#og-gold)" stroke="#ffd86b" stroke-width="1.2"/>
      <path d="M10 7.5 C6 9 4.8 13 5.5 17 C6 19.2 8.5 20.5 12 20.5 C15.5 20.5 18 19.2 18.5 17 C19.2 13 18 9 14 7.5 Z" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.5"/>
      <circle cx="12" cy="14" r="2.4" fill="url(#og-gold)"/>
    `,
    speaker_on: `
      <polygon points="4,9.5 8.5,9.5 13.5,5 13.5,19 8.5,14.5 4,14.5" fill="url(#og-gold)" stroke="#ece4d8" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M16.5 8.8 C18 10.4 18 13.6 16.5 15.2 M19 6.5 C21.5 9.5 21.5 14.5 19 17.5" fill="none" stroke="#38ef7d" stroke-width="1.6" stroke-linecap="round"/>
    `,
    speaker_off: `
      <polygon points="4,9.5 8.5,9.5 13.5,5 13.5,19 8.5,14.5 4,14.5" fill="url(#og-iron)" stroke="#c5b8a5" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M16.5 9.5 L21 14.5 M21 9.5 L16.5 14.5" stroke="#ff3b4e" stroke-width="2" stroke-linecap="round"/>
    `,
    crt: `
      <rect x="3" y="4.5" width="18" height="13.5" rx="2" fill="#12181b" stroke="url(#og-gold)" stroke-width="1.6"/>
      <line x1="6" y1="8.5" x2="18" y2="8.5" stroke="#38ef7d" stroke-width="1.2"/>
      <line x1="6" y1="11.5" x2="18" y2="11.5" stroke="#38ef7d" stroke-width="1.2"/>
      <line x1="6" y1="14.5" x2="14" y2="14.5" stroke="#38ef7d" stroke-width="1.2"/>
      <path d="M8 20.5 H16" stroke="#ffd86b" stroke-width="1.8" stroke-linecap="round"/>
    `,
    fullscreen: `
      <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" fill="none" stroke="url(#og-gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    warning: `
      <polygon points="12,3 21.5,19.5 2.5,19.5" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="12" y1="8.5" x2="12" y2="14" stroke="#fff0a8" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="17" r="1.2" fill="#fff0a8"/>
    `,
    fist: `
      <path d="M7 9.5 V6.5 C7 5.5 8.5 5.5 8.5 6.5 V9 M9 9 V5.8 C9 4.8 11 4.8 11 5.8 V9 M11.5 9 V5.8 C11.5 4.8 13.5 4.8 13.5 5.8 V9 M14 9.5 V6.5 C14 5.5 16 5.5 16 6.5 V12" fill="url(#og-gold)" stroke="#522108" stroke-width="1.2"/>
      <rect x="6.5" y="9.5" width="11" height="9.5" rx="3" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.5"/>
    `,
    bolt: `
      <polygon points="13.5,2.5 6,13.2 11.8,13.2 10.2,21.5 18,10.8 12.2,10.8" fill="url(#og-gold)" stroke="#ff3b4e" stroke-width="1.3" stroke-linejoin="round"/>
    `,
    check: `
      <circle cx="12" cy="12" r="9" fill="url(#og-emerald)" stroke="#ffd86b" stroke-width="1.4"/>
      <path d="M7.5 12.2 L10.6 15.4 L16.8 8.8" fill="none" stroke="#082e16" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    `,
    lock: `
      <rect x="5.5" y="10.5" width="13" height="10" rx="2" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.5"/>
      <path d="M8.5 10.5 V7.5 C8.5 5.3 10 3.8 12 3.8 C14 3.8 15.5 5.3 15.5 7.5 V10.5" fill="none" stroke="#ffd86b" stroke-width="1.8"/>
      <circle cx="12" cy="15.2" r="1.5" fill="#181210"/>
    `,
    anvil: `
      <path d="M3.5 8.5 H19.5 L17.5 13 H8.5 L5.5 11.5 Z" fill="url(#og-iron)" stroke="#ffd86b" stroke-width="1.4"/>
      <path d="M9.5 13 L8 18.5 H16.5 L15 13" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.4"/>
      <rect x="6" y="18.5" width="12.5" height="2.2" fill="url(#og-gold)"/>
    `,
    eyes: `
      <path d="M2.5 12 Q7 6.5 11.5 12 Q7 17.5 2.5 12 Z M12.5 12 Q17 6.5 21.5 12 Q17 17.5 12.5 12 Z" fill="#29060a" stroke="#ff3b4e" stroke-width="1.4"/>
      <circle cx="7" cy="12" r="1.8" fill="#ffd86b"/>
      <circle cx="17" cy="12" r="1.8" fill="#ffd86b"/>
    `,
    fire: `
      <path d="M12 2.5 C12 2.5 18.5 8 18.5 14 C18.5 18 15.6 21 12 21 C8.4 21 5.5 18 5.5 14 C5.5 10.5 7.8 7.8 7.8 7.8 C7.8 10.5 9.8 11.5 9.8 11.5 C9.2 7.5 12 2.5 12 2.5 Z" fill="url(#og-crimson)" stroke="#ffd86b" stroke-width="1.4"/>
      <path d="M12 11.5 C12 11.5 14.8 14 14.8 16.5 C14.8 18.2 13.5 19.5 12 19.5 C10.5 19.5 9.2 18.2 9.2 16.5 C9.2 14 12 11.5 12 11.5 Z" fill="url(#og-gold)"/>
    `,
    chest: `
      <rect x="3.5" y="7" width="17" height="12.5" rx="2" fill="url(#og-copper)" stroke="#ffd86b" stroke-width="1.6"/>
      <line x1="3.5" y1="12" x2="20.5" y2="12" stroke="#ffd86b" stroke-width="1.6"/>
      <rect x="10.2" y="10.2" width="3.6" height="4" rx="0.8" fill="url(#og-gold)" stroke="#3d1e05" stroke-width="1"/>
    `,
    swords: `
      <path d="M4.5 19.5 L18.5 5.5 M14.5 4.5 L19.5 4.5 L19.5 9.5" fill="none" stroke="url(#og-iron)" stroke-width="2" stroke-linecap="round"/>
      <path d="M19.5 19.5 L5.5 5.5 M9.5 4.5 L4.5 4.5 L4.5 9.5" fill="none" stroke="url(#og-gold)" stroke-width="2" stroke-linecap="round"/>
    `,
    star: `
      <polygon points="12,2.5 14.8,8.5 21.2,9.3 16.5,13.8 17.7,20.2 12,17 6.3,20.2 7.5,13.8 2.8,9.3 9.2,8.5" fill="url(#og-gold)" stroke="#ff3b4e" stroke-width="1.3" stroke-linejoin="round"/>
    `,
    refresh: `
      <path d="M19 8 A8 8 0 0 0 6 6.5 L4 8.5 M5 16 A8 8 0 0 0 18 17.5 L20 15.5" fill="none" stroke="url(#og-gold)" stroke-width="2" stroke-linecap="round"/>
      <polyline points="4,4.5 4,8.5 8,8.5" fill="none" stroke="#ffd86b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="20,19.5 20,15.5 16,15.5" fill="none" stroke="#ffd86b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `
  };

  const ALIAS_MAP = {
    // 18 Token aliases & catalog IDs
    obol: 'obol',
    copper_obol: 'obol',
    drachma: 'drachma',
    silver_drachma: 'drachma',
    heavy: 'heavy',
    oil_cask: 'heavy',
    SHIELD: 'SHIELD',
    BOMB: 'BOMB',
    blast_cap: 'BOMB',
    curse: 'BOMB',
    MAGNET: 'MAGNET',
    lodestone: 'MAGNET',
    CURSED: 'CURSED',
    cursed_skull: 'CURSED',
    doom_coin: 'CURSED',
    MIMIC: 'MIMIC',
    mimic_tooth: 'MIMIC',
    mimic: 'MIMIC',
    GLASS: 'GLASS',
    glass_sovereign: 'GLASS',
    fragile: 'GLASS',
    BLOOD: 'BLOOD',
    leech_penny: 'BLOOD',
    blood: 'BLOOD',
    parasite: 'BLOOD',
    SOUL: 'SOUL',
    soul_chain: 'SOUL',
    soul: 'SOUL',
    VOID: 'VOID',
    void_singularity: 'VOID',
    void_coin: 'VOID',
    CROWN: 'CROWN',
    crown_coin: 'CROWN',
    DICE: 'DICE',
    necro_die: 'DICE',
    HOURGLASS: 'HOURGLASS',
    voltaic_coil: 'HOURGLASS',
    echo: 'HOURGLASS',
    WEB: 'WEB',
    CANDLE: 'CANDLE',
    SUN: 'SUN',
    sun_bullion: 'SUN',
    sun_coin: 'SUN',
    reliquary_chest: 'chest',

    // 3 Fusions & Expansion Fusions/Tokens/Relics
    SOLAR_CULT: 'SOLAR_CULT',
    crimson_sovereign: 'SOLAR_CULT',
    blood_crown: 'SOLAR_CULT',
    VOID_GRAVITY: 'VOID_GRAVITY',
    abyssal_magnetar: 'VOID_GRAVITY',
    abyssal_lord: 'VOID_GRAVITY',
    PLASMA_BOMB: 'PLASMA_BOMB',
    plasma_dynamo: 'PLASMA_BOMB',
    mercury: 'mercury',
    alchemist_mercury: 'mercury',
    hellfire: 'hellfire',
    hellfire_ducat: 'hellfire',
    ferry: 'ferry',
    charon_barge: 'ferry',
    mirror: 'mirror',
    obsidian_mirror: 'mirror',
    leviathan: 'leviathan',
    quicksilver_sovereign: 'leviathan',
    juggernaut: 'juggernaut',
    infernal_juggernaut: 'juggernaut',
    gate: 'gate',
    stygian_gate: 'gate',
    die: 'die',
    ossuary_dice: 'die',

    // 12 Relics
    RELIC_GUTTER: 'RELIC_GUTTER',
    welded_guardrails: 'RELIC_GUTTER',
    RELIC_MAGNET: 'RELIC_MAGNET',
    blood_magnet: 'RELIC_MAGNET',
    RELIC_FUSE: 'RELIC_FUSE',
    overclocked_piston: 'RELIC_FUSE',
    RELIC_DUP: 'RELIC_DUP',
    cut_tilt_wire: 'RELIC_DUP',
    RELIC_CHEST: 'RELIC_CHEST',
    furnace_catcher: 'RELIC_CHEST',
    RELIC_MIDAS: 'RELIC_MIDAS',
    greased_bed: 'RELIC_MIDAS',
    RELIC_VAMPIRE: 'RELIC_VAMPIRE',
    vampire_funnel: 'RELIC_VAMPIRE',
    RELIC_SPEED: 'RELIC_SPEED',
    combo_metronome: 'RELIC_SPEED',
    RELIC_HEAVY: 'RELIC_HEAVY',
    tesla_coil: 'RELIC_HEAVY',
    RELIC_CROWN: 'RELIC_CROWN',
    golden_gate: 'RELIC_CROWN',
    RELIC_COMBO: 'RELIC_COMBO',
    sacrificial_grate: 'RELIC_COMBO',
    RELIC_BUMPER: 'RELIC_BUMPER',
    hydraulic_bumper: 'RELIC_BUMPER',

    // Brands & Loadouts & Achievements
    gilded: 'star',
    usurer: 'coin',
    bloodletter: 'BLOOD',
    saboteur: 'BOMB',
    first_quota: 'coin',
    skill_shot: 'RELIC_CROWN',
    combo_king: 'fire',
    blood_pact: 'BLOOD',
    high_value_coin: 'CROWN',
    boss_slayer: 'skull',
    smelter: 'anvil',
    full_rig: 'gear',
    alchemist: 'alembic',
    chest_hunter: 'chest',

    // Legacy Unicode Emojis
    '🪙': 'obol',
    '🥈': 'drachma',
    '🩸': 'BLOOD',
    '💣': 'BOMB',
    '🧲': 'MAGNET',
    '🦷': 'MIMIC',
    '🔮': 'GLASS',
    '⛓️': 'SOUL',
    '⛓': 'SOUL',
    '🛢️': 'heavy',
    '🛢': 'heavy',
    '⚡': 'bolt',
    '🕳️': 'VOID',
    '🕳': 'VOID',
    '🎲': 'DICE',
    '💀': 'skull',
    '👑': 'CROWN',
    '🧛': 'SOLAR_CULT',
    '🌌': 'VOID_GRAVITY',
    '🧰': 'chest',
    '✨': 'star',
    '⚓': 'anvil',
    '♊': 'SOUL',
    '🛡️': 'SHIELD',
    '🛡': 'SHIELD',
    '⚙️': 'gear',
    '⚙': 'gear',
    '✂️': 'RELIC_DUP',
    '✂': 'RELIC_DUP',
    '♻️': 'RELIC_CHEST',
    '♻': 'RELIC_CHEST',
    '💧': 'RELIC_MIDAS',
    '🦇': 'RELIC_VAMPIRE',
    '⏱️': 'HOURGLASS',
    '⏱': 'HOURGLASS',
    '⏳': 'HOURGLASS',
    '🎰': 'RELIC_CROWN',
    '🔥': 'fire',
    '🔔': 'RELIC_BUMPER',
    '⚖️': 'coin',
    '⚖': 'coin',
    '🏆': 'trophy',
    '⚗️': 'alembic',
    '⚗': 'alembic',
    '🔩': 'gear',
    '🎬': 'film',
    '📖': 'book',
    '🎒': 'pouch',
    '🔊': 'speaker_on',
    '🔇': 'speaker_off',
    '📺': 'crt',
    '⛶': 'fullscreen',
    '✊': 'fist',
    '👊': 'fist',
    '⚠️': 'warning',
    '⚠': 'warning',
    '☀️': 'SUN',
    '☀': 'SUN',
    '🕯️': 'CANDLE',
    '🕯': 'CANDLE',
    '🕸️': 'WEB',
    '🕸': 'WEB',
    '🔨': 'anvil',
    '⚒️': 'anvil',
    '⚒': 'anvil',
    '👻': 'SOUL',
    '✓': 'check',
    '🔒': 'lock',
    '🖐️': 'finger',
    '🖐': 'finger',
    '☝️': 'finger',
    '☝': 'finger',
    '✖️': 'severed',
    '✖': 'severed',
    '👀': 'eyes',
    '📊': 'crt',
    '📜': 'book',
    '🚪': 'chest',
    '🔄': 'refresh',
    '⚔️': 'swords',
    '⚔': 'swords'
  };

  const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?/gu;

  const ObolIcons = {
    svg(name, size = 18) {
      const rawKey = String(name || 'coin').trim();
      const canonical = PATHS[rawKey] ? rawKey : ALIAS_MAP[rawKey] || ALIAS_MAP[rawKey.replace(/\uFE0F/g, '')] || 'coin';
      const inner = PATHS[canonical] || PATHS.coin;
      return `<svg class="obol-svg-icon" data-icon="${canonical}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${DEFS}${inner}</svg>`;
    },

    fromEmojiOrId(keyOrEmoji, size = 18) {
      if (!keyOrEmoji) return this.svg('coin', size);
      const str = String(keyOrEmoji).trim();
      if (str.startsWith('<svg')) return str;
      if (PATHS[str] || ALIAS_MAP[str] || ALIAS_MAP[str.replace(/\uFE0F/g, '')]) {
        return this.svg(str, size);
      }
      if (EMOJI_REGEX.test(str)) {
        EMOJI_REGEX.lastIndex = 0;
        return str.replace(EMOJI_REGEX, (match) => this.svg(match, size));
      }
      return this.svg(str, size);
    },

    stripEmojis(text) {
      if (!text) return '';
      return String(text).replace(EMOJI_REGEX, '').replace(/\s{2,}/g, ' ').trim();
    },

    hydrateAll(root = typeof document !== 'undefined' ? document : null) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('[data-obol-icon]').forEach((el) => {
        const iconName = el.getAttribute('data-obol-icon');
        const size = Number(el.getAttribute('data-obol-size')) || 16;
        el.innerHTML = this.svg(iconName, size);
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.ObolIcons = ObolIcons;
    window.obolIcon = (name, size = 18) => ObolIcons.fromEmojiOrId(name, size);
    window.hydrateObolIcons = (root) => ObolIcons.hydrateAll(root);
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ObolIcons.hydrateAll(document));
      } else {
        ObolIcons.hydrateAll(document);
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObolIcons;
  }
})();
