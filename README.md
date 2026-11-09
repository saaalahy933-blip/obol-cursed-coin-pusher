# 🪙 OBOL: The Cursed Coin Pusher

> *CloverPit meets Buckshot Roulette inside a rusted, occult arcade Coin Pusher.*

You are locked in a dimly lit iron booth in purgatory. In front of you is a mechanical **Model VIII Reciprocating Coin Pusher** slick with oil and rust. Every 3 minutes, **The Collector** demands an escalating Quota of Obols. Drop cursed tokens onto the moving shelf, trigger chain-reaction physics combos on the board, and shove piles of treasure over the front lip into your Payout Chute—before they spill off the side gutters into the House's Furnace.

---

## 🎮 Core Features Included in This Build

1. **Custom 2.5D Coin-Pusher Physics (`physics.js`)**
   - **Reciprocating Hydraulic Shelf**: Drops tokens onto the upper moving shelf; as the shelf retracts against the back stopper wall, tokens drop in front of the piston face and shove the entire lower bed forward.
   - **Impulse-Based Multi-Substep Collisions**: Mass, radius, friction, and restitution per token type (`1.0x` Copper Obols up to `2.5x` Hellfire Bullion).
   - **Front Lip Teetering vs. Side Furnace Gutters**: Coins near the bottom edge wobble and teeter before cascading into your Payout Chute, while lateral spills fall into the glowing Left/Right House Furnace grates.

2. **Pouch Deckbuilding & Cursed Physics Tokens (`tokens.js`)**
   - 🪙 **Copper Obol**: Standard bronze token (`$10`). Prey for Leech Pennies.
   - 🩸 **Leech Penny**: Absorbs up to 2 adjacent Copper Obols every push cycle, permanently multiplying its own value by `x1.5` in your Pouch!
   - 💣 **Blast Cap**: Ticks down `3` piston pushes, then detonates—blasting nearby tokens straight toward the front lip!
   - 🧲 **Lodestone**: Heavy `2.2x` mass iron token that pulls nearby tokens away from the side furnace gutters toward the center line.
   - 🦷 **Mimic Tooth**: Worth `$0` alone, but bites the first non-Mimic token it bumps into, minting a duplicate copy right on the bed!
   - 🔮 **Glass Sovereign**: Multiplies your active Chute Combo by `x4` when scored, but shatters if bumped hard 5 times.
   - 🥈 **Silver Drachma**, ⛓️ **Soul-Chained Ducat**, 🛢️ **Slick Tallow Coin**, and 👑 **Hellfire Bullion**.

3. **Rig the Machine (Passive Contraband Relics / "Jokers")**
   - 🛡️ **Welded Guardrails**: Bolts steel plates over 42% of the left & right side gutters.
   - ⚙️ **Overclocked Piston**: `+35%` reciprocating shelf speed & `+30%` forward shove impulse.
   - 🧲 **Blood Magnet**: Pulls teetering coins over the front lip.
   - ⏱️ **Combo Metronome**: `+0.5x` Chute Multiplier for every coin dropped within `1.8s` of the last drop.
   - ✂️ **Clipped Tilt Wire**, ♻️ **Slag Return Chute**, 🔥 **Furnace Tithe**, and 💧 **Quicksilver Bed**.

4. **High-Stakes Cheating ("SLAM CABINET" & The Tilt Risk)**
   - Press `SPACEBAR` or click **👊 SLAM CABINET** to violently jolt the coin pile forward.
   - Every slam fills the **TILT SENSOR** gauge. If it hits `100%`, **The Collector** severs one of your **3 Fingers (Collateral)** and locks a relic or raises your Quota!

5. **Synthesized Web Audio Engine (`audio.js`)**
   - Zero external audio asset dependencies—100% procedural Web Audio API metallic coin clinks, pitch-shifted Balatro/Peggle-style combo risers, hydraulic piston thuds, explosions, glass shatters, and horror stingers.

---

## 🚀 How to Run Locally or Upload to Itch.io

### Play Locally
Simply open `index.html` in any modern web browser, or serve the folder locally:
```powershell
npx serve .
```

### Package for Itch.io (HTML5 Web Embed)
Run `package-itch.ps1` (or zip `index.html`, `style.css`, `audio.js`, `tokens.js`, `physics.js`, `game.js` into `obol-itch-web.zip`):
- On your itch.io project page, set **Kind of project** to `HTML`.
- Upload `obol-itch-web.zip` and check **"This file will be played in the browser"**.
- Set viewport dimensions to **1360 x 780** (or enable **Fullscreen button** + **Automatically start on page load**).
