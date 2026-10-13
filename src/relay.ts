import type { WorldState } from "./types.ts";

function esc(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function mainPage(state: WorldState): string {
  return `<!doctype html><html><head><title>Mock Kingdom of Loathing</title></head><body>
  <div style="border:3px solid #b00;padding:8px;font-family:monospace">MOCK RUNTIME — NO LIVE KOL CONNECTION</div>
  <h1>The Kingdom of Loathing (simulated)</h1>
  <p>Location: <b>${esc(state.location)}</b></p>
  <p>Turns remaining: ${state.player.turnsRemaining} · Meat: ${state.player.meat}</p>
  <p>Scenario: ${esc(state.scenarioId)} · tick ${state.tick}</p>
  <hr><pre>${esc(state.recentMessages.join("\n"))}</pre>
  </body></html>`;
}

export function charpanePage(state: WorldState): string {
  const effects = Object.entries(state.effects).map(([name, turns]) => `<li>${esc(name)} (${turns})</li>`).join("");
  return `<!doctype html><html><body><b>${esc(state.player.name)}</b> (#${state.player.playerId})<br>
  Level ${state.player.level} ${esc(state.player.className)}<br>
  HP ${state.player.hp}/${state.player.maxHp}<br>MP ${state.player.mp}/${state.player.maxMp}<br>
  Adventures: ${state.player.turnsRemaining}<br>Meat: ${state.player.meat}<br>
  <h4>Effects</h4><ul>${effects || "<li>none</li>"}</ul>
  <small>MOCK</small></body></html>`;
}

export function inventoryPage(state: WorldState): string {
  const rows = Object.entries(state.inventory)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `<tr><td>${esc(name)}</td><td>${count}</td></tr>`)
    .join("");
  return `<!doctype html><html><body><h2>Inventory (mock)</h2><table>${rows}</table></body></html>`;
}
