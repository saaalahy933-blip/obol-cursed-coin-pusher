/**
 * OBOL: Token Catalog, Contraband Relics, Starter Loadouts, Boss Quotas & Achievements
 * Commercial Itch.io Edition (v6 Deluxe Upgrade)
 */

function getCoinMaxVal(game, mult = 1) {
  const q = Math.max(1, game?.quotaLevel || 1);
  return Math.round((55 + (q - 1) * 45) * mult);
}

/**
 * Capped value mutation helper for all additive/multiplicative token effects across Quota #1-#9+
 */
const TOKEN_MUTATION_HANDLERS = {
  // Blood Leech / Leech Penny: drains $1 per nearby coin and adds +$2 per drained coin, capped at getCoinMaxVal(game)
  blood(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1);
    let drained = 0;
    for (const target of nearbyCoins) {
      if (target && target !== coin && target.value > 1) {
        target.value = Math.max(1, target.value - 1);
        drained++;
      }
    }
    if (drained > 0) {
      coin.value = Math.min(cap, (coin.value || 10) + drained * 2);
    }
    return coin.value;
  },

  // Blast Powder / Blast Cap: adds +$2 to nearby coins in blast radius, capped at getCoinMaxVal(game)
  curse(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1);
    for (const target of nearbyCoins) {
      if (target && target !== coin) {
        target.value = Math.min(cap, (target.value || 10) + 2);
      }
    }
    coin.value = Math.min(cap, coin.value || 20);
    return coin.value;
  },

  // Echo Mint / Voltaic Coil: adds +$2 to up to 3 nearby coins per shelf cycle, capped at getCoinMaxVal(game)
  echo(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1);
    let count = 0;
    for (const target of nearbyCoins) {
      if (target && target !== coin && count < 3) {
        target.value = Math.min(cap, (target.value || 10) + 2);
        count++;
      }
    }
    coin.value = Math.min(cap, coin.value || 22);
    return coin.value;
  },

  // Soul-Chained Ducat
  soul(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1);
    for (const target of nearbyCoins.slice(0, 1)) {
      if (target && target !== coin) {
        target.value = Math.min(cap, (target.value || 10) + 2);
      }
    }
    coin.value = Math.min(cap, coin.value || 22);
    return coin.value;
  },

  // Singularity Obol / Void Coin
  void_coin(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1);
    for (const target of nearbyCoins) {
      if (target && target !== coin) {
        target.value = Math.min(cap, (target.value || 10) + 3);
      }
    }
    coin.value = Math.min(cap, coin.value || 30);
    return coin.value;
  },

  // Mimic Tooth
  mimic(coin, targetCoin = null, game = null) {
    const cap = getCoinMaxVal(game, 1);
    if (targetCoin) {
      coin.value = Math.min(cap, targetCoin.value || 10);
    } else {
      coin.value = Math.min(cap, coin.value || 10);
    }
    return coin.value;
  },

  // Parasite: drains $2 and adds +$4, capped at getCoinMaxVal(game, 1.2)
  parasite(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.2);
    for (const target of nearbyCoins) {
      if (target && target !== coin && target.value > 2) {
        const drainAmt = Math.min(2, target.value - 1);
        target.value = Math.max(1, target.value - drainAmt);
        coin.value = Math.min(cap, (coin.value || 14) + 4);
      }
    }
    coin.value = Math.min(cap, coin.value || 14);
    return coin.value;
  },

  // Sun Bullion: adds +$2 to up to 4 nearby coins per cycle, capped at getCoinMaxVal(game, 1.3)
  sun_coin(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.3);
    let count = 0;
    for (const target of nearbyCoins) {
      if (target && target !== coin && count < 4) {
        target.value = Math.min(cap, (target.value || 10) + 2);
        count++;
      }
    }
    coin.value = Math.min(cap, coin.value || 60);
    return coin.value;
  },

  // Ossuary Skull / Doom Coin
  doom_coin(coin, burnedCount = 1, game = null) {
    const cap = getCoinMaxVal(game, 1.3);
    coin.value = Math.min(cap, (coin.value || 45) + burnedCount * 4);
    return coin.value;
  },

  // Crown Coin (Tier-2/3 fused)
  crown_coin(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.5);
    for (const target of nearbyCoins.slice(0, 4)) {
      if (target && target !== coin) {
        target.value = Math.min(cap, (target.value || 10) + 3);
      }
    }
    coin.value = Math.min(cap, coin.value || 75);
    return coin.value;
  },

  // Blood Crown / Crimson Sovereign (Tier-2/3 fused)
  blood_crown(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.5);
    let count = 0;
    for (const target of nearbyCoins) {
      if (target && target !== coin && count < 3) {
        target.value = Math.max(1, (target.value || 10) - 2);
        coin.value = Math.min(cap, (coin.value || 70) + 4);
        count++;
      }
    }
    coin.value = Math.min(cap, coin.value || 70);
    return coin.value;
  },

  // Abyssal Lord / Abyssal Magnetar (Tier-2/3 fused)
  abyssal_lord(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.5);
    for (const target of nearbyCoins) {
      if (target && target !== coin) {
        target.value = Math.min(cap, (target.value || 10) + 3);
      }
    }
    coin.value = Math.min(cap, coin.value || 85);
    return coin.value;
  },

  // Quicksilver Denarius: coats up to 3 nearby coins in Quicksilver (+$12 value & slick slide)
  alchemist_mercury(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.15);
    let count = 0;
    for (const target of nearbyCoins) {
      if (target && target !== coin && count < 3) {
        target.value = Math.min(cap, (target.value || 10) + 12);
        target.oilTimer = Math.max(target.oilTimer || 0, 4.0);
        count++;
      }
    }
    coin.value = Math.min(cap, coin.value || 34);
    return coin.value;
  },

  // Hellfire Ducat: scorches adjacent coins for +$10 value each push
  hellfire_ducat(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.15);
    let count = 0;
    for (const target of nearbyCoins) {
      if (target && target !== coin && count < 3) {
        target.value = Math.min(cap, (target.value || 10) + 10);
        count++;
      }
    }
    coin.value = Math.min(cap, coin.value || 38);
    return coin.value;
  },

  // Charon's Ferry Obol: warps back from side gutter with +$35 value
  charon_barge(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.35);
    coin.value = Math.min(cap, (coin.value || 55) + 35);
    return coin.value;
  },

  // Obsidian Mirror: copies the $VALUE of the richest non-chest coin on the board
  obsidian_mirror(coin, boardCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.25);
    let richest = coin.value || 36;
    for (const target of boardCoins) {
      if (target && target !== coin && !target.isPrizeTotem && target.typeId !== 'reliquary_chest') {
        if ((target.value || 0) > richest) {
          richest = target.value;
        }
      }
    }
    coin.value = Math.min(cap, richest);
    return coin.value;
  },

  // Mercury Leviathan (Mythic Fusion: Quicksilver Denarius + Glass Sovereign)
  quicksilver_sovereign(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.5);
    for (const target of nearbyCoins) {
      if (target && target !== coin) {
        target.value = Math.min(cap, (target.value || 10) + 20);
        target.oilTimer = Math.max(target.oilTimer || 0, 4.5);
      }
    }
    coin.value = Math.min(cap, coin.value || 190);
    return coin.value;
  },

  // Infernal Juggernaut (Mythic Fusion: Hellfire Ducat + Cursed Skull)
  infernal_juggernaut(coin, nearbyCoins = [], game = null) {
    const cap = getCoinMaxVal(game, 1.5);
    for (const target of nearbyCoins) {
      if (target && target !== coin) {
        target.value = Math.min(cap, (target.value || 10) + 12);
      }
    }
    coin.value = Math.min(cap, coin.value || 220);
    return coin.value;
  }
};

// Map catalog IDs to their capped mutation handlers
TOKEN_MUTATION_HANDLERS.leech_penny = TOKEN_MUTATION_HANDLERS.blood;
TOKEN_MUTATION_HANDLERS.blast_cap = TOKEN_MUTATION_HANDLERS.curse;
TOKEN_MUTATION_HANDLERS.voltaic_coil = TOKEN_MUTATION_HANDLERS.echo;
TOKEN_MUTATION_HANDLERS.soul_chain = TOKEN_MUTATION_HANDLERS.soul;
TOKEN_MUTATION_HANDLERS.void_singularity = TOKEN_MUTATION_HANDLERS.void_coin;
TOKEN_MUTATION_HANDLERS.mimic_tooth = TOKEN_MUTATION_HANDLERS.mimic;
TOKEN_MUTATION_HANDLERS.sun_bullion = TOKEN_MUTATION_HANDLERS.sun_coin;
TOKEN_MUTATION_HANDLERS.cursed_skull = TOKEN_MUTATION_HANDLERS.doom_coin;
TOKEN_MUTATION_HANDLERS.plasma_dynamo = TOKEN_MUTATION_HANDLERS.crown_coin;
TOKEN_MUTATION_HANDLERS.crimson_sovereign = TOKEN_MUTATION_HANDLERS.blood_crown;
TOKEN_MUTATION_HANDLERS.abyssal_magnetar = TOKEN_MUTATION_HANDLERS.abyssal_lord;

const EXPANSION_ICON_ALIASES = {
  mercury: 'RELIC_MIDAS',
  alchemist_mercury: 'RELIC_MIDAS',
  mercury_trough: 'RELIC_MIDAS',
  hellfire: 'fire',
  hellfire_ducat: 'fire',
  ferry: 'SHIELD',
  charon_barge: 'SHIELD',
  ferryman: 'SHIELD',
  stygian_ferryman: 'SHIELD',
  slag_return: 'RELIC_CHEST',
  mirror: 'GLASS',
  obsidian_mirror: 'GLASS',
  leviathan: 'PLASMA_BOMB',
  quicksilver_sovereign: 'PLASMA_BOMB',
  quicksilver_lord: 'alembic',
  juggernaut: 'SOLAR_CULT',
  infernal_juggernaut: 'SOLAR_CULT',
  gate: 'swords',
  pendulum_blade: 'swords',
  die: 'DICE',
  ossuary_dice: 'DICE',
  crown_coin: 'CROWN',
  sovereign_mint: 'CROWN',
  royal_minter: 'CROWN',
  abyssal_conqueror: 'VOID_GRAVITY'
};

if (typeof window !== 'undefined' && window.ObolIcons && !window.ObolIcons.__expansionPatched) {
  const origSvg = window.ObolIcons.svg.bind(window.ObolIcons);
  window.ObolIcons.svg = function (name, size = 18) {
    const raw = String(name || 'coin').trim();
    const mapped = EXPANSION_ICON_ALIASES[raw] || raw;
    return origSvg(mapped, size);
  };
  window.ObolIcons.__expansionPatched = true;
}

const obolSvg = (id, sz = 20) =>
  typeof window !== 'undefined' && window.ObolIcons
    ? window.ObolIcons.svg(id, sz)
    : `<svg class="obol-svg-icon" data-icon="${id}" width="${sz}" height="${sz}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#c4743b"/></svg>`;

const TOKEN_CATALOG = {
  copper_obol: {
    id: 'copper_obol',
    name: 'Copper Obol',
    icon: obolSvg('copper_obol', 20),
    rarity: 'Common',
    baseValue: 10,
    radius: 16.5,
    mass: 1.0,
    friction: 0.90,
    restitution: 0.36,
    colorPrimary: '#f29d38',
    colorSecondary: '#8c4410',
    colorRim: '#ffe8a3',
    shopCost: 15,
    desc: 'Worn purgatory bronze ($10). Prime food for Leech Pennies.'
  },

  leech_penny: {
    id: 'leech_penny',
    name: 'Leech Penny',
    icon: obolSvg('leech_penny', 20),
    rarity: 'Uncommon',
    baseValue: 14,
    radius: 18,
    mass: 1.2,
    friction: 0.89,
    restitution: 0.3,
    colorPrimary: '#ff3d4d',
    colorSecondary: '#7a0b18',
    colorRim: '#ffcdd2',
    shopCost: 40,
    desc: 'Every piston push, drains $1 from adjacent Copper Obols and permanently gains +$2 value per coin drained!'
  },

  blast_cap: {
    id: 'blast_cap',
    name: 'Blast Cap',
    icon: obolSvg('blast_cap', 20),
    rarity: 'Uncommon',
    baseValue: 20,
    radius: 18,
    mass: 1.15,
    friction: 0.91,
    restitution: 0.42,
    colorPrimary: '#ff7724',
    colorSecondary: '#6e2206',
    colorRim: '#ffe082',
    shopCost: 44,
    desc: 'Ticks down 3 piston pushes, then DETONATES—adding +$2 to nearby tokens and blasting them straight toward the front lip!'
  },

  lodestone: {
    id: 'lodestone',
    name: 'Lodestone',
    icon: obolSvg('lodestone', 20),
    rarity: 'Rare',
    baseValue: 24,
    radius: 20,
    mass: 2.3,
    friction: 0.93,
    restitution: 0.22,
    colorPrimary: '#4fc3f7',
    colorSecondary: '#123e6b',
    colorRim: '#e1f5fe',
    shopCost: 50,
    desc: 'Heavy iron core (2.3x mass) that pulls nearby tokens away from the side furnace gutters toward the center.'
  },

  mimic_tooth: {
    id: 'mimic_tooth',
    name: 'Mimic Tooth',
    icon: obolSvg('mimic_tooth', 20),
    rarity: 'Rare',
    baseValue: 5,
    radius: 17.5,
    mass: 1.0,
    friction: 0.88,
    restitution: 0.52,
    colorPrimary: '#f5ecd8',
    colorSecondary: '#8c785c',
    colorRim: '#ffffff',
    shopCost: 52,
    desc: 'Bites the first non-Mimic token it collides with, minting a duplicate copy directly onto the board!'
  },

  glass_sovereign: {
    id: 'glass_sovereign',
    name: 'Glass Sovereign',
    icon: obolSvg('glass_sovereign', 20),
    rarity: 'Rare',
    baseValue: 40,
    radius: 19,
    mass: 0.88,
    friction: 0.85,
    restitution: 0.6,
    colorPrimary: '#70e2ff',
    colorSecondary: '#185c91',
    colorRim: '#f0fdff',
    shopCost: 58,
    desc: 'Fragile crystal mint. Pays x3 Value at Chute, but shatters after 5 peg hits.'
  },

  silver_drachma: {
    id: 'silver_drachma',
    name: 'Silver Drachma',
    icon: obolSvg('silver_drachma', 20),
    rarity: 'Common',
    baseValue: 28,
    radius: 20,
    mass: 1.75,
    friction: 0.89,
    restitution: 0.35,
    colorPrimary: '#e4eef7',
    colorSecondary: '#687b8f',
    colorRim: '#ffffff',
    shopCost: 32,
    desc: 'Heavy silver coin ($28, 1.75x mass) that bulldozes lighter tokens toward the front lip.'
  },

  soul_chain: {
    id: 'soul_chain',
    name: 'Soul-Chained Ducat',
    icon: obolSvg('soul_chain', 20),
    rarity: 'Uncommon',
    baseValue: 22,
    radius: 18.5,
    mass: 1.3,
    friction: 0.9,
    restitution: 0.35,
    colorPrimary: '#36d6a8',
    colorSecondary: '#0f4d3a',
    colorRim: '#b5ffea',
    shopCost: 45,
    desc: 'Tethers to a nearby coin; when either drops into the Payout Chute, it yanks its partner over the lip!'
  },

  oil_cask: {
    id: 'oil_cask',
    name: 'Slick Tallow Coin',
    icon: obolSvg('oil_cask', 20),
    rarity: 'Uncommon',
    baseValue: 18,
    radius: 18,
    mass: 1.1,
    friction: 0.81,
    restitution: 0.3,
    colorPrimary: '#c98b3e',
    colorSecondary: '#472c10',
    colorRim: '#ffe099',
    shopCost: 36,
    desc: 'Coats nearby tokens in slick black oil every push, slashing friction so the pile slides rapidly forward.'
  },

  voltaic_coil: {
    id: 'voltaic_coil',
    name: 'Voltaic Coil',
    icon: obolSvg('voltaic_coil', 20),
    rarity: 'Uncommon',
    baseValue: 22,
    radius: 18.5,
    mass: 1.25,
    friction: 0.89,
    restitution: 0.4,
    colorPrimary: '#38a1ff',
    colorSecondary: '#103466',
    colorRim: '#bbf2ff',
    shopCost: 46,
    desc: 'Every piston push, arcs chain lightning to up to 3 nearby coins—boosting their value +$2 and jolting them forward!'
  },

  void_singularity: {
    id: 'void_singularity',
    name: 'Singularity Obol',
    icon: obolSvg('void_singularity', 20),
    rarity: 'Rare',
    baseValue: 30,
    radius: 19,
    mass: 1.9,
    friction: 0.92,
    restitution: 0.25,
    colorPrimary: '#8b5cf6',
    colorSecondary: '#2a1259',
    colorRim: '#ede3ff',
    shopCost: 56,
    desc: 'Ticks down 2 pushes, then IMPLODES—pulling nearby coins inward from gutters, adding +$12 to each, and surging forward!'
  },

  necro_die: {
    id: 'necro_die',
    name: 'Necro-Die',
    icon: obolSvg('necro_die', 20),
    rarity: 'Uncommon',
    baseValue: 25,
    radius: 18,
    mass: 1.15,
    friction: 0.88,
    restitution: 0.48,
    colorPrimary: '#ece3cf',
    colorSecondary: '#6b604e',
    colorRim: '#ffffff',
    shopCost: 42,
    desc: 'Rolls 1–6 every push: [1–3] buffs nearby coins +$8; [4–5] shoves pile forward; [6] mints a free Obol & +x0.5 Combo!'
  },

  cursed_skull: {
    id: 'cursed_skull',
    name: 'Ossuary Skull',
    icon: obolSvg('cursed_skull', 20),
    rarity: 'Legendary',
    baseValue: 45,
    radius: 21,
    mass: 2.1,
    friction: 0.9,
    restitution: 0.28,
    colorPrimary: '#c04894',
    colorSecondary: '#3b0d2c',
    colorRim: '#ffd4ea',
    shopCost: 68,
    desc: 'Absorbs +$25 every time ANY coin falls into the side Furnace Gutters! Cashes out the entire soul bank when scored!'
  },

  sun_bullion: {
    id: 'sun_bullion',
    name: 'Hellfire Bullion',
    icon: obolSvg('sun_bullion', 20),
    rarity: 'Legendary',
    baseValue: 60,
    radius: 22.5,
    mass: 2.6,
    friction: 0.9,
    restitution: 0.25,
    colorPrimary: '#ffd740',
    colorSecondary: '#9e6700',
    colorRim: '#fff9c4',
    shopCost: 72,
    desc: 'Colossal gold bullion ($60, 2.6x mass). Adds +$2 to up to 4 nearby coins per cycle and +1.5x to active Chute Combo when scored!'
  },

  reliquary_chest: {
    id: 'reliquary_chest',
    name: 'Reliquary Chest',
    icon: obolSvg('reliquary_chest', 20),
    rarity: 'Prize Totem',
    isPrizeTotem: true,
    baseValue: 120,
    radius: 20,
    mass: 1.55,
    friction: 0.9,
    restitution: 0.25,
    colorPrimary: '#d9822b',
    colorSecondary: '#542908',
    colorRim: '#ffea99',
    shopCost: 90,
    desc: 'Heavy iron-bound prize chest on the bed! Shoving it over the lip grants a FREE Contraband Relic (or +$100) & 3 Silver Drachmas!'
  },

  plasma_dynamo: {
    id: 'plasma_dynamo',
    name: 'Plasma Dynamo',
    icon: obolSvg('plasma_dynamo', 20),
    rarity: 'Mythic Fusion',
    isFusedMythic: true,
    baseValue: 75,
    radius: 21,
    mass: 1.95,
    friction: 0.89,
    restitution: 0.4,
    colorPrimary: '#2998ff',
    colorSecondary: '#0c2c59',
    colorRim: '#ffb84d',
    shopCost: 95,
    desc: 'FUSION [Blast Cap + Voltaic Coil]: Every push, arcs lightning to 4 coins (+50% value) AND blasts nearby coins toward the lip!'
  },

  crimson_sovereign: {
    id: 'crimson_sovereign',
    name: 'Crimson Sovereign',
    icon: obolSvg('crimson_sovereign', 20),
    rarity: 'Mythic Fusion',
    isFusedMythic: true,
    baseValue: 70,
    radius: 21,
    mass: 2.1,
    friction: 0.89,
    restitution: 0.32,
    colorPrimary: '#e62238',
    colorSecondary: '#47060e',
    colorRim: '#ffe07d',
    shopCost: 95,
    desc: 'FUSION [Leech Penny + Silver Drachma]: Every push, siphons +$18 from up to 3 nearby coins without eating them & adds +0.5x Combo!'
  },

  abyssal_magnetar: {
    id: 'abyssal_magnetar',
    name: 'Abyssal Magnetar',
    icon: obolSvg('abyssal_magnetar', 20),
    rarity: 'Mythic Fusion',
    isFusedMythic: true,
    baseValue: 85,
    radius: 22,
    mass: 2.55,
    friction: 0.92,
    restitution: 0.25,
    colorPrimary: '#6d3bd9',
    colorSecondary: '#1c0b40',
    colorRim: '#99f2ff',
    shopCost: 98,
    desc: 'FUSION [Lodestone + Soul-Chained / Singularity]: Pulls outer-gutter coins toward center across the board & buffs nearby coins +$12!'
  },

  alchemist_mercury: {
    id: 'alchemist_mercury',
    name: 'Quicksilver Denarius',
    icon: obolSvg('mercury', 20),
    iconKey: 'mercury',
    rarity: 'Rare',
    baseValue: 34,
    mass: 1.15,
    radius: 17,
    friction: 0.02,
    restitution: 0.35,
    shopCost: 52,
    colorPrimary: '#b8d8e8',
    colorSecondary: '#2c4a5e',
    colorRim: '#e6f7ff',
    synergyTag: 'PUSH: COATS 3 COINS IN QUICKSILVER (+$12)',
    desc: 'Liquid mercury mint ($34). Every piston push coats up to 3 nearby coins in Quicksilver (+$12 value & slick slide).'
  },

  hellfire_ducat: {
    id: 'hellfire_ducat',
    name: 'Hellfire Ducat',
    icon: obolSvg('hellfire', 20),
    iconKey: 'hellfire',
    rarity: 'Rare',
    baseValue: 38,
    mass: 1.25,
    radius: 18,
    friction: 0.05,
    restitution: 0.25,
    shopCost: 56,
    colorPrimary: '#ff5e1a',
    colorSecondary: '#4a1205',
    colorRim: '#ffdf80',
    synergyTag: 'PUSH: SCORCHES ADJACENT COINS (+$10)',
    desc: 'Forged in Furnace slag ($38). Every piston push scorches adjacent coins for +$10 value and adds +1 Combo Streak on score.'
  },

  charon_barge: {
    id: 'charon_barge',
    name: "Charon's Ferry Obol",
    icon: obolSvg('ferry', 20),
    iconKey: 'ferry',
    rarity: 'Legendary',
    baseValue: 55,
    mass: 1.6,
    radius: 20,
    friction: 0.04,
    restitution: 0.2,
    shopCost: 78,
    colorPrimary: '#3dc2ad',
    colorSecondary: '#0f362f',
    colorRim: '#a8ffef',
    synergyTag: 'GUTTER IMMUNE: WARPS BACK (+$35)',
    desc: 'Ancient Stygian ferryman medallion ($55). Refuses the Furnace: if pushed into a side gutter, warps back to the upper shelf with +$35 value!'
  },

  obsidian_mirror: {
    id: 'obsidian_mirror',
    name: 'Obsidian Mirror',
    icon: obolSvg('mirror', 20),
    iconKey: 'mirror',
    rarity: 'Rare',
    baseValue: 36,
    mass: 1.2,
    radius: 17,
    friction: 0.05,
    restitution: 0.3,
    shopCost: 54,
    colorPrimary: '#7b5cc7',
    colorSecondary: '#1f143b',
    colorRim: '#e5d4ff',
    synergyTag: 'ON LAND: COPIES HIGHEST BED COIN $',
    desc: 'Volcanic scrying glass ($36). Upon landing on the shelf, copies the $VALUE of the richest non-chest coin on the board!'
  },

  quicksilver_sovereign: {
    id: 'quicksilver_sovereign',
    name: 'Mercury Leviathan',
    icon: obolSvg('leviathan', 20),
    iconKey: 'leviathan',
    rarity: 'Mythic Fusion',
    baseValue: 190,
    mass: 1.8,
    radius: 22,
    friction: 0.02,
    restitution: 0.35,
    shopCost: 0,
    isFusedMythic: true,
    colorPrimary: '#00d4ff',
    colorSecondary: '#082b38',
    colorRim: '#e0ffff',
    synergyTag: 'MYTHIC FUSION: +$20 TO TOUCHED COINS',
    desc: 'ALCHEMICAL FUSION (Quicksilver Denarius + Glass Sovereign). Unbreakable liquid-crystal bullion ($190) that grants +$20 to every coin in contact each push!'
  },

  infernal_juggernaut: {
    id: 'infernal_juggernaut',
    name: 'Infernal Juggernaut',
    icon: obolSvg('juggernaut', 20),
    iconKey: 'juggernaut',
    rarity: 'Mythic Fusion',
    baseValue: 220,
    mass: 2.2,
    radius: 23,
    friction: 0.04,
    restitution: 0.25,
    shopCost: 0,
    isFusedMythic: true,
    colorPrimary: '#ff3b14',
    colorSecondary: '#470a00',
    colorRim: '#ffee88',
    synergyTag: 'MYTHIC FUSION: FREE MICRO-SLAM EACH PUSH',
    desc: 'ALCHEMICAL FUSION (Hellfire Ducat + Cursed Skull). Molten colossus ($220) that unleashes a zero-Tilt micro-shockwave every piston cycle!'
  }
};

Object.defineProperty(TOKEN_CATALOG, 'gold_crown', {
  value: TOKEN_CATALOG.sun_bullion,
  enumerable: false,
  configurable: true
});

const FUSION_RECIPES = [
  {
    id: 'plasma_dynamo',
    ingredients: ['blast_cap', 'voltaic_coil'],
    result: 'plasma_dynamo',
    name: 'Plasma Dynamo',
    title: 'ALCHEMICAL FUSION: PLASMA DYNAMO!',
    icon: obolSvg('plasma_dynamo', 20),
    formulaText: 'Blast Cap + Voltaic Coil'
  },
  {
    id: 'crimson_sovereign',
    ingredients: ['leech_penny', 'silver_drachma'],
    altIngredients: ['leech_penny', 'sun_bullion'],
    result: 'crimson_sovereign',
    name: 'Crimson Sovereign',
    title: 'ALCHEMICAL FUSION: CRIMSON SOVEREIGN!',
    icon: obolSvg('crimson_sovereign', 20),
    formulaText: 'Leech Penny + Silver Drachma'
  },
  {
    id: 'abyssal_magnetar',
    ingredients: ['lodestone', 'soul_chain'],
    altIngredients: ['lodestone', 'void_singularity'],
    result: 'abyssal_magnetar',
    name: 'Abyssal Magnetar',
    title: 'ALCHEMICAL FUSION: ABYSSAL MAGNETAR!',
    icon: obolSvg('abyssal_magnetar', 20),
    formulaText: 'Lodestone + Soul-Chained / Singularity'
  },
  {
    id: 'quicksilver_sovereign',
    ingredients: ['alchemist_mercury', 'glass_sovereign'],
    result: 'quicksilver_sovereign',
    name: 'Mercury Leviathan',
    title: 'ALCHEMICAL FUSION: MERCURY LEVIATHAN!',
    icon: obolSvg('leviathan', 20),
    formulaText: 'Quicksilver Denarius + Glass Sovereign'
  },
  {
    id: 'infernal_juggernaut',
    ingredients: ['hellfire_ducat', 'cursed_skull'],
    result: 'infernal_juggernaut',
    name: 'Infernal Juggernaut',
    title: 'ALCHEMICAL FUSION: INFERNAL JUGGERNAUT!',
    icon: obolSvg('juggernaut', 20),
    formulaText: 'Hellfire Ducat + Ossuary Skull'
  }
];

const TOKEN_BRANDS = {
  gilded: {
    id: 'gilded',
    name: 'Gilded Seal',
    shortLabel: 'GILDED',
    icon: obolSvg('gilded', 16),
    cost: 30,
    color: '#ffd166',
    desc: 'Doubles base coin value (x2.0) and shimmers with radiant gold.'
  },
  heavy: {
    id: 'heavy',
    name: 'Lead-Core Brand',
    shortLabel: 'LEAD-CORE',
    icon: obolSvg('heavy', 16),
    cost: 30,
    color: '#63b3ed',
    desc: '+80% shoving mass, +$15 base value, and resists side-gutter pull.'
  },
  echo: {
    id: 'echo',
    name: 'Twin-Echo Brand',
    shortLabel: 'TWIN-ECHO',
    icon: obolSvg('echo', 16),
    cost: 35,
    color: '#d6bcfa',
    desc: 'Spawns a spectral twin coin beside it when dropped from the top rail!'
  }
};

const RELIC_CATALOG = {
  welded_guardrails: {
    id: 'welded_guardrails',
    name: 'Welded Guardrails',
    icon: obolSvg('welded_guardrails', 18),
    cost: 60,
    desc: 'Bolts rusted steel plates over 45% of both side gutters, bouncing coins back onto the bed.'
  },
  overclocked_piston: {
    id: 'overclocked_piston',
    name: 'Overclocked Piston',
    icon: obolSvg('overclocked_piston', 18),
    cost: 65,
    desc: 'Increases reciprocating shelf speed by +38% and forward shove impulse by +35%.'
  },
  blood_magnet: {
    id: 'blood_magnet',
    name: 'Blood Magnet',
    icon: obolSvg('blood_magnet', 18),
    cost: 70,
    desc: 'Cursed electromagnet under the front lip pulls teetering coins straight into your Payout Chute.'
  },
  combo_metronome: {
    id: 'combo_metronome',
    name: 'Combo Metronome',
    icon: obolSvg('combo_metronome', 18),
    cost: 60,
    desc: '+0.5x Chute Multiplier for every token dropped within 2.0s of the previous drop.'
  },
  cut_tilt_wire: {
    id: 'cut_tilt_wire',
    name: 'Clipped Tilt Wire',
    icon: obolSvg('cut_tilt_wire', 18),
    cost: 50,
    desc: 'Cabinet SLAMs and Finger Flicks generate 45% less Tilt Sensor heat and cool down 50% faster.'
  },
  furnace_catcher: {
    id: 'furnace_catcher',
    name: 'Slag Return Chute',
    icon: obolSvg('furnace_catcher', 18),
    cost: 55,
    desc: '40% chance any coin falling into the side Furnace Gutters is spat back onto the top shelf!'
  },
  sacrificial_grate: {
    id: 'sacrificial_grate',
    name: 'Furnace Tithe',
    icon: obolSvg('sacrificial_grate', 18),
    cost: 55,
    desc: 'Whenever a coin burns in the side gutters, gain +$18 Wallet and +0.6x Chute Multiplier for 8 seconds.'
  },
  greased_bed: {
    id: 'greased_bed',
    name: 'Quicksilver Bed',
    icon: obolSvg('greased_bed', 18),
    cost: 58,
    desc: 'Lubricates the iron bed and adds +$5 value to every coin that hits a brass Drop Peg.'
  },
  tesla_coil: {
    id: 'tesla_coil',
    name: 'Tesla Lip Coil',
    icon: obolSvg('tesla_coil', 18),
    cost: 64,
    desc: 'Every 3rd piston push zaps the 3 coins closest to the front lip, adding +$12 and jolting them toward the chute!'
  },
  vampire_funnel: {
    id: 'vampire_funnel',
    name: 'Crimson Siphon',
    icon: obolSvg('vampire_funnel', 18),
    cost: 62,
    desc: 'Leech Pennies devour coins from +40% farther away and grant +x0.35 active Chute Combo per coin eaten!'
  },
  golden_gate: {
    id: 'golden_gate',
    name: 'Gilded Skill-Gate',
    icon: obolSvg('golden_gate', 18),
    cost: 58,
    desc: 'Widens the moving Skill-Shot Bonus Gate by +35% and adds +$20 to every coin that threads it!'
  },
  hydraulic_bumper: {
    id: 'hydraulic_bumper',
    name: 'Overcharged Bumpers',
    icon: obolSvg('hydraulic_bumper', 18),
    cost: 56,
    desc: 'Brass Bumper Wheels on the bed double their value bonus (+$12) and pulse outward every piston push!'
  },
  mercury_trough: {
    id: 'mercury_trough',
    name: 'Quicksilver Trough',
    icon: obolSvg('mercury', 18),
    iconKey: 'mercury',
    cost: 95,
    desc: 'Coins saved from the Furnace Gutters gain +$25 value and return Gilded.'
  },
  pendulum_blade: {
    id: 'pendulum_blade',
    name: 'Razor Pendulum Gate',
    icon: obolSvg('gate', 18),
    iconKey: 'gate',
    cost: 90,
    desc: 'Passing through the Skill-Shot Bonus Gate grants an extra +$18 and +x0.5 Chute Combo.'
  },
  ossuary_dice: {
    id: 'ossuary_dice',
    name: 'Loaded Ossuary Bones',
    icon: obolSvg('die', 18),
    iconKey: 'die',
    cost: 85,
    desc: 'Necro-Die rolls trigger twice per piston push cycle and grant +$10 bonus value.'
  },
  sovereign_mint: {
    id: 'sovereign_mint',
    name: 'Purgatory Royal Mint',
    icon: obolSvg('crown_coin', 18),
    iconKey: 'crown_coin',
    cost: 110,
    desc: 'Every 5th token dropped from your hand is automatically Gilded (2x Value) for free.'
  }
};

// Non-enumerable alias so startingRelic 'slag_return' resolves to furnace_catcher while keeping 16 enumerable relics
Object.defineProperty(RELIC_CATALOG, 'slag_return', {
  value: RELIC_CATALOG.furnace_catcher,
  enumerable: false,
  configurable: true
});

const STARTER_LOADOUTS = [
  {
    id: 'usurer',
    name: "The Usurer's Pouch",
    icon: obolSvg('leech_penny', 24),
    tagline: 'Blood Synergies & Exponential Scaling',
    subtitle: 'Blood Synergies & Exponential Scaling',
    desc: 'Starts with Leech Penny, Blast Cap, Lodestone, Mimic Tooth & Silver Drachma.',
    wallet: 50,
    startingWallet: 50,
    startingRelic: null,
    tokens: [
      'copper_obol', 'copper_obol', 'leech_penny', 'copper_obol',
      'blast_cap', 'copper_obol', 'silver_drachma', 'copper_obol',
      'lodestone', 'copper_obol', 'mimic_tooth', 'copper_obol'
    ],
    pouch: [
      'copper_obol', 'copper_obol', 'leech_penny', 'copper_obol',
      'blast_cap', 'copper_obol', 'silver_drachma', 'copper_obol',
      'lodestone', 'copper_obol', 'mimic_tooth', 'copper_obol'
    ]
  },
  {
    id: 'demolitionist',
    name: 'Sapper of Purgatory',
    icon: obolSvg('blast_cap', 24),
    tagline: 'Explosive Detonations & Guardrails',
    subtitle: 'Explosive Detonations & Guardrails',
    desc: 'Starts with 2x Blast Caps, Slick Tallow Coin, Soul-Chained Ducat + Welded Guardrails Relic.',
    wallet: 35,
    startingWallet: 35,
    startingRelic: 'welded_guardrails',
    tokens: [
      'copper_obol', 'blast_cap', 'copper_obol', 'oil_cask',
      'blast_cap', 'copper_obol', 'soul_chain', 'copper_obol',
      'silver_drachma', 'copper_obol', 'copper_obol'
    ],
    pouch: [
      'copper_obol', 'blast_cap', 'copper_obol', 'oil_cask',
      'blast_cap', 'copper_obol', 'soul_chain', 'copper_obol',
      'silver_drachma', 'copper_obol', 'copper_obol'
    ]
  },
  {
    id: 'highroller',
    name: 'The Glass Sovereign',
    icon: obolSvg('glass_sovereign', 24),
    tagline: 'x3 Chute Value & Heavy Bullion',
    subtitle: 'x3 Chute Value & Heavy Bullion',
    desc: 'Starts with Glass Sovereign, Hellfire Bullion, Mimic Tooth, Necro-Die + Combo Metronome Relic.',
    wallet: 30,
    startingWallet: 30,
    startingRelic: 'combo_metronome',
    tokens: [
      'copper_obol', 'glass_sovereign', 'copper_obol', 'mimic_tooth',
      'sun_bullion', 'copper_obol', 'necro_die', 'copper_obol',
      'soul_chain', 'copper_obol'
    ],
    pouch: [
      'copper_obol', 'glass_sovereign', 'copper_obol', 'mimic_tooth',
      'sun_bullion', 'copper_obol', 'necro_die', 'copper_obol',
      'soul_chain', 'copper_obol'
    ]
  },
  {
    id: 'arcanist',
    name: 'Voltaic Arcanist',
    icon: obolSvg('voltaic_coil', 24),
    tagline: 'Chain Lightning, Gravity Vortex & Skull Bank',
    subtitle: 'Chain Lightning, Gravity Vortex & Skull Bank',
    desc: 'Starts with Voltaic Coil, Singularity Obol, Ossuary Skull, Necro-Die + Tesla Lip Coil Relic.',
    wallet: 35,
    startingWallet: 35,
    startingRelic: 'tesla_coil',
    tokens: [
      'copper_obol', 'voltaic_coil', 'copper_obol', 'void_singularity',
      'cursed_skull', 'copper_obol', 'necro_die', 'copper_obol',
      'voltaic_coil', 'copper_obol'
    ],
    pouch: [
      'copper_obol', 'voltaic_coil', 'copper_obol', 'void_singularity',
      'cursed_skull', 'copper_obol', 'necro_die', 'copper_obol',
      'voltaic_coil', 'copper_obol'
    ]
  },
  {
    id: 'alchemist',
    name: 'The Quicksilver Alchemist',
    icon: obolSvg('alchemist_mercury', 24),
    tagline: 'Liquid Velocity & Prismatic Fusions',
    subtitle: 'Liquid Velocity & Prismatic Fusions',
    desc: 'Starts with Quicksilver Denarius, Glass Sovereign, Slick Tallow Coin, Silver Drachma + Quicksilver Trough Relic.',
    wallet: 40,
    startingWallet: 40,
    startingRelic: 'mercury_trough',
    tokens: [
      'copper_obol', 'alchemist_mercury', 'copper_obol', 'glass_sovereign',
      'oil_cask', 'copper_obol', 'silver_drachma', 'copper_obol',
      'alchemist_mercury', 'copper_obol', 'copper_obol'
    ],
    pouch: [
      'copper_obol', 'alchemist_mercury', 'copper_obol', 'glass_sovereign',
      'oil_cask', 'copper_obol', 'silver_drachma', 'copper_obol',
      'alchemist_mercury', 'copper_obol', 'copper_obol'
    ]
  },
  {
    id: 'ferryman',
    name: "Charon's Navigator",
    icon: obolSvg('charon_barge', 24),
    tagline: 'Stygian Gutter Immunity & Heavy Bullion',
    subtitle: 'Stygian Gutter Immunity & Heavy Bullion',
    desc: "Starts with Charon's Ferry Obol, Lodestone, Soul-Chained Ducat, Silver Drachma + Slag Return Chute Relic.",
    wallet: 35,
    startingWallet: 35,
    startingRelic: 'slag_return',
    tokens: [
      'copper_obol', 'charon_barge', 'copper_obol', 'lodestone',
      'soul_chain', 'copper_obol', 'silver_drachma', 'copper_obol',
      'lodestone', 'copper_obol', 'copper_obol'
    ],
    pouch: [
      'copper_obol', 'charon_barge', 'copper_obol', 'lodestone',
      'soul_chain', 'copper_obol', 'silver_drachma', 'copper_obol',
      'lodestone', 'copper_obol', 'copper_obol'
    ]
  }
];

const BOSS_MODIFIERS = {
  3: {
    name: 'BOSS QUOTA: THE IRON INQUISITOR',
    desc: 'Every piston push jolts the side grates, pulling outer coins toward the Furnace—but all scored coins grant +25% bonus cash!',
    sidePull: 16,
    payoutBonus: 1.25
  },
  6: {
    name: 'BOSS QUOTA: THE ARCH-COLLECTOR',
    desc: 'Tilt Sensor builds 30% faster, but Brass Drop Pegs double the value of any coin that touches them!',
    tiltPenalty: 1.3,
    pegDouble: true
  },
  9: {
    name: 'BOSS QUOTA: LORD OF THE FURNACE',
    desc: 'Piston pushes 30% faster and side gutters burn hotter, but all Chute Combos scale +50% faster!',
    comboBoost: 1.5,
    payoutBonus: 1.5
  },
  12: {
    name: 'BOSS QUOTA: THE ABYSSAL EMPEROR',
    desc: 'Abyssal gravity pulls outer coins toward the Furnace and Tilt builds 35% faster, but all scored coins grant +75% bonus cash and +50% Combo scaling!',
    sidePull: 20,
    tiltPenalty: 1.35,
    comboBoost: 1.5,
    payoutBonus: 1.75
  }
};

const TORMENT_TIERS = [
  {
    level: 0,
    id: 'torment_0',
    label: 'TORMENT 0: STANDARD',
    shortLabel: 'TORMENT 0',
    quotaMult: 1.0,
    tiltMult: 1.0,
    prestigeMult: 1.0,
    desc: 'Standard Purgatory Debt (1.0x Quota Targets).'
  },
  {
    level: 1,
    id: 'torment_1',
    label: "TORMENT I: USURER'S TAX",
    shortLabel: 'TORMENT I',
    quotaMult: 1.2,
    tiltMult: 1.05,
    prestigeMult: 1.25,
    desc: '1.2x Quota Targets • +25% Career Obol Prestige.'
  },
  {
    level: 2,
    id: 'torment_2',
    label: 'TORMENT II: IRON TILT',
    shortLabel: 'TORMENT II',
    quotaMult: 1.4,
    tiltMult: 1.15,
    prestigeMult: 1.5,
    desc: '1.4x Quota Targets • +15% Tilt Sensitivity • +50% Prestige.'
  },
  {
    level: 3,
    id: 'torment_3',
    label: 'TORMENT III: ABYSSAL DEBT',
    shortLabel: 'TORMENT III',
    quotaMult: 1.65,
    tiltMult: 1.25,
    prestigeMult: 2.0,
    desc: '1.65x Quota Targets • +25% Tilt Sensitivity • 2.0x Prestige.'
  }
];

const ACHIEVEMENT_CATALOG = [
  {
    id: 'first_quota',
    name: 'Debt Paid in Bronze',
    icon: obolSvg('first_quota', 20),
    desc: 'Survive and pay off Quota #1.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'skill_shot',
    name: 'Thread the Needle',
    icon: obolSvg('skill_shot', 20),
    desc: 'Drop a coin cleanly through the moving Skill-Shot Bonus Gate.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'combo_king',
    name: 'Cascade Fever',
    icon: obolSvg('combo_king', 20),
    desc: 'Reach an active Chute Combo Multiplier of x5.0 or higher.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'blood_pact',
    name: 'Signed in Blood',
    icon: obolSvg('blood_pact', 20),
    desc: 'Invoke the Blood Pact during a run.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'high_value_coin',
    name: 'Alchemical Mint',
    icon: obolSvg('high_value_coin', 20),
    desc: 'Score a single coin worth $250 or more after multipliers.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'boss_slayer',
    name: 'Inquisitor Broken',
    icon: obolSvg('boss_slayer', 20),
    desc: 'Defeat Boss Quota #3 (The Iron Inquisitor).',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'smelter',
    name: 'Refiner of Sin',
    icon: obolSvg('smelter', 20),
    desc: 'Smelt a Copper Obol in the Pouch Inspector to permanently buff all coins.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'full_rig',
    name: 'Contraband Engineer',
    icon: obolSvg('full_rig', 20),
    desc: 'Bolt 4 Contraband Relics onto the cabinet simultaneously.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'alchemist',
    name: 'Forbidden Alchemy',
    icon: obolSvg('alchemist', 20),
    desc: 'Fuse two Cursed Tokens on the pusher bed into a Mythic Fusion Token.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'chest_hunter',
    name: 'Reliquary Breaker',
    icon: obolSvg('chest_hunter', 20),
    desc: 'Shove a heavy Reliquary Prize Chest over the front Payout Lip.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'quicksilver_lord',
    name: 'Quicksilver Lord',
    icon: obolSvg('quicksilver_lord', 20),
    desc: 'Synthesize the Mercury Leviathan or Infernal Juggernaut on the board.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'stygian_ferryman',
    name: 'Stygian Navigator',
    icon: obolSvg('stygian_ferryman', 20),
    desc: 'Rescue a coin from the Furnace Gutters.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'royal_minter',
    name: 'Royal Minter',
    icon: obolSvg('royal_minter', 20),
    desc: 'Accumulate 6 Contraband Relics in a single run.',
    rewardText: '+$5 Starting Wallet'
  },
  {
    id: 'abyssal_conqueror',
    name: 'Abyssal Conqueror',
    icon: obolSvg('abyssal_conqueror', 20),
    desc: 'Reach Act IV: The Abyssal Mint (Quota #10+).',
    rewardText: '+$5 Starting Wallet'
  }
];

const COLLECTOR_QUOTES = {
  idle: [
    '"FEED THE IRON LIP, DEBTOR..."',
    '"THE FURNACE HUNGERS FOR YOUR SIDE SPILLS."',
    '"THREE FINGERS LEFT ON THAT HAND. CAREFUL."',
    '"AIM FOR THE BRASS PEGS TO BLESS YOUR DROP."',
    '"RIGHT-CLICK ANY COIN ON THE BED TO FLICK IT FORWARD... IF YOU DARE."'
  ],
  combo: [
    '"IMPOSSIBLE... THE MACHINE IS BLEEDING GOLD!"',
    '"WHO RIGGED THIS PISTON?!"',
    '"STOP SHOVING THE PILE! MY VAULT!"'
  ],
  tiltWarning: [
    '"TOUCH THAT CABINET AGAIN AND I TAKE A KNUCKLE."',
    '"I HEAR THE TILT SENSOR HUMMING, SINNER..."'
  ],
  punish: [
    '"CAUGHT YOU CHEATING! HAND OVER THE FINGER!"',
    '"THE ALARM RANG. PENALTY ASSESSED IN FLESH!"'
  ]
};

const _obolRootScope = typeof window !== 'undefined' ? window : globalThis;
_obolRootScope.getCoinMaxVal = getCoinMaxVal;
_obolRootScope.TOKEN_MUTATION_HANDLERS = TOKEN_MUTATION_HANDLERS;
_obolRootScope.TOKEN_CATALOG = TOKEN_CATALOG;
_obolRootScope.FUSION_RECIPES = FUSION_RECIPES;
_obolRootScope.TOKEN_BRANDS = TOKEN_BRANDS;
_obolRootScope.RELIC_CATALOG = RELIC_CATALOG;
_obolRootScope.STARTER_LOADOUTS = STARTER_LOADOUTS;
_obolRootScope.BOSS_MODIFIERS = BOSS_MODIFIERS;
_obolRootScope.TORMENT_TIERS = TORMENT_TIERS;
_obolRootScope.ACHIEVEMENT_CATALOG = ACHIEVEMENT_CATALOG;
_obolRootScope.ACHIEVEMENTS = ACHIEVEMENT_CATALOG;
_obolRootScope.COLLECTOR_QUOTES = COLLECTOR_QUOTES;
