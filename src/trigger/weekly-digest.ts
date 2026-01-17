import { schedules } from '@trigger.dev/sdk/v3';
import { sendAllWeeklyDigests } from '../core/email/weekly.js';

/**
 * Weekly Digest Automation
 * Runs every Monday at 9:00 AM UTC
 * Fetches all active founders, analyzes their customers, and sends reports.
 */
export const weeklyDigestTask = schedules.task({
  id: 'weekly-digest',
  cron: '0 9 * * 1', // Every Monday at 09:00 UTC
  run: async (payload) => {
    console.log('🚀 Starting weekly digest automation...', payload.timestamp);

    const result = await sendAllWeeklyDigests();

    console.log(
      `✅ Weekly digest complete. Total: ${result.total}, Successful: ${result.successful}, Failed: ${result.failed}`,
    );

    return {
      message: 'Weekly digest automation completed',
      stats: {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
      },
    };
  },
});
