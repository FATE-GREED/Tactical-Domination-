// ====================================================================
// rules-win.js — Win Condition (Bagian 12).
// Pemain kalah hanya jika SELURUH Markas miliknya hancur. Garnisun
// tidak pernah jadi objective (sudah dijamin tidak bisa diserang di
// rules-combat.js).
// ====================================================================

function checkWinCondition() {
  if (gameOver) return true;
  for (let i = 0; i < players.length; i++) {
    const markasCount = players[i].buildings.filter(b => b.type === 'markas').length;
    if (markasCount === 0) {
      gameOver = true;
      winner = 1 - i;
      return true;
    }
  }
  return false;
}
