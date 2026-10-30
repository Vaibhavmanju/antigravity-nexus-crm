/**
 * sheetMirror.js
 *
 * After a successful sheet sync, make the database an exact mirror of the
 * sheet for that user:
 *   • rows that were deleted or edited in the sheet (so their hash changed)
 *     are removed here instead of lingering and being double counted;
 *   • placeholder sample rows are removed because real data now exists.
 *
 * Only called when the sheet produced at least one real row, so a bad
 * fetch can never wipe a user's data.
 */

const db = require('../config/db');
const { clearSampleRows } = require('./sampleData');

async function mirrorSheet(table, userId, seenHashes) {
  if (!seenHashes || seenHashes.length === 0) return { removedStale: 0 };
  await clearSampleRows(table, userId);

  let removed = 0;
  // Delete in batches keyed on "not in the current sheet" without building a
  // giant IN () list: collect stored hashes, diff in JS, delete the leftovers.
  const [stored] = await db.query(`SELECT row_hash FROM ${table} WHERE user_id = ?`, [userId]);
  const keep = new Set(seenHashes);
  const stale = stored.map(r => r.row_hash).filter(h => h && !keep.has(h));
  const CHUNK = 500;
  for (let i = 0; i < stale.length; i += CHUNK) {
    const [res] = await db.query(
      `DELETE FROM ${table} WHERE user_id = ? AND row_hash IN (?)`,
      [userId, stale.slice(i, i + CHUNK)]
    );
    removed += res.affectedRows || 0;
  }
  return { removedStale: removed };
}

module.exports = { mirrorSheet };
