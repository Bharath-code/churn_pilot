/**
 * Weekly Digest Runner
 *
 * Run manually or via cron:
 * npx tsx scripts/run-weekly.ts
 */

import { sendAllWeeklyDigests } from '../src/core/email/weekly.js';

async function main() {
  console.log('📧 Starting weekly digest run...\n');

  const startTime = Date.now();
  const result = await sendAllWeeklyDigests();
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n--- Summary ---');
  console.log(`Total founders: ${result.total}`);
  console.log(`Successful: ${result.successful}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Duration: ${duration}s`);

  if (result.failed > 0) {
    console.log('\nFailed sends:');
    result.results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.founderId}: ${r.error}`);
      });
  }

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
