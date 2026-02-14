import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type {
  AnalyticsOverview,
  GrowthMetrics,
  ChannelActivity,
  MemberActivity,
  ContentInsights
} from '@wall-e/shared';

/**
 * Analytics Service
 * Provides comprehensive analytics for guild activity, growth, and engagement
 */

/**
 * Get analytics overview for a guild
 * Shows summary metrics including totals and growth rates
 */
export async function getOverview(guildId: string): Promise<AnalyticsOverview> {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Get total members
    const totalMembersResult = await db.query(
      `SELECT COUNT(*) as total FROM guild_members WHERE guild_id = $1 AND left_at IS NULL`,
      [guildId]
    );
    const totalMembers = parseInt(totalMembersResult.rows[0]?.total || '0');

    // Get total messages
    const totalMessagesResult = await db.query(
      `SELECT COUNT(*) as total FROM message_logs WHERE guild_id = $1`,
      [guildId]
    );
    const totalMessages = parseInt(totalMessagesResult.rows[0]?.total || '0');

    // Get active members (sent message in last 7 days)
    const activeMembersResult = await db.query(
      `SELECT COUNT(DISTINCT user_id) as active FROM message_logs
       WHERE guild_id = $1 AND created_at > $2`,
      [guildId, sevenDaysAgo]
    );
    const activeMembers = parseInt(activeMembersResult.rows[0]?.active || '0');

    // Get new members (joined in last 7 days)
    const newMembersResult = await db.query(
      `SELECT COUNT(*) as new FROM guild_members
       WHERE guild_id = $1 AND joined_at > $2`,
      [guildId, sevenDaysAgo]
    );
    const newMembers = parseInt(newMembersResult.rows[0]?.new || '0');

    // Get member count 7 days ago for growth calculation
    const previousMembersResult = await db.query(
      `SELECT COUNT(*) as total FROM guild_members
       WHERE guild_id = $1 AND joined_at < $2 AND (left_at IS NULL OR left_at > $2)`,
      [guildId, sevenDaysAgo]
    );
    const previousMembers = parseInt(previousMembersResult.rows[0]?.total || '0');

    // Get message count from 7-14 days ago for growth calculation
    const previousMessagesResult = await db.query(
      `SELECT COUNT(*) as total FROM message_logs
       WHERE guild_id = $1 AND created_at BETWEEN $2 AND $3`,
      [guildId, fourteenDaysAgo, sevenDaysAgo]
    );
    const previousMessages = parseInt(previousMessagesResult.rows[0]?.total || '0');

    // Get messages from last 7 days
    const recentMessagesResult = await db.query(
      `SELECT COUNT(*) as total FROM message_logs
       WHERE guild_id = $1 AND created_at > $2`,
      [guildId, sevenDaysAgo]
    );
    const recentMessages = parseInt(recentMessagesResult.rows[0]?.total || '0');

    // Calculate growth percentages
    const memberGrowth = previousMembers > 0
      ? ((totalMembers - previousMembers) / previousMembers) * 100
      : 0;

    const messageGrowth = previousMessages > 0
      ? ((recentMessages - previousMessages) / previousMessages) * 100
      : 0;

    return {
      totalMembers,
      totalMessages,
      activeMembers,
      newMembers,
      memberGrowth: Math.round(memberGrowth * 10) / 10,
      messageGrowth: Math.round(messageGrowth * 10) / 10,
    };
  } catch (error) {
    logger.error('Failed to get analytics overview:', error);
    throw error;
  }
}

/**
 * Get growth metrics over time
 * Returns daily, weekly, or monthly data points
 */
export async function getGrowthMetrics(
  guildId: string,
  period: 'day' | 'week' | 'month'
): Promise<GrowthMetrics> {
  try {
    const dataPoints = period === 'day' ? 30 : period === 'week' ? 12 : 12;
    const interval = period === 'day' ? '1 day' : period === 'week' ? '7 days' : '1 month';
    const dateFormat = period === 'day' ? 'YYYY-MM-DD' : period === 'week' ? 'YYYY-WW' : 'YYYY-MM';

    // Generate date series and get metrics
    const result = await db.query(
      `WITH date_series AS (
        SELECT generate_series(
          NOW() - INTERVAL '${dataPoints} ${interval}',
          NOW(),
          INTERVAL '${interval}'
        )::date as date
      )
      SELECT
        TO_CHAR(ds.date, '${dateFormat}') as date,
        COALESCE(
          (SELECT COUNT(*) FROM guild_members
           WHERE guild_id = $1
           AND joined_at::date <= ds.date
           AND (left_at IS NULL OR left_at::date > ds.date)
          ), 0
        ) as members,
        COALESCE(
          (SELECT COUNT(*) FROM message_logs
           WHERE guild_id = $1
           AND created_at::date = ds.date
          ), 0
        ) as messages,
        COALESCE(
          (SELECT COUNT(*) FROM guild_members
           WHERE guild_id = $1
           AND joined_at::date = ds.date
          ), 0
        ) as joins,
        COALESCE(
          (SELECT COUNT(*) FROM guild_members
           WHERE guild_id = $1
           AND left_at::date = ds.date
          ), 0
        ) as leaves
      FROM date_series ds
      ORDER BY ds.date`,
      [guildId]
    );

    return {
      period,
      data: result.rows.map(row => ({
        date: row.date,
        members: parseInt(row.members),
        messages: parseInt(row.messages),
        joins: parseInt(row.joins),
        leaves: parseInt(row.leaves),
      })),
    };
  } catch (error) {
    logger.error('Failed to get growth metrics:', error);
    throw error;
  }
}

/**
 * Get content insights
 * Returns top channels, top members, and peak activity times
 */
export async function getContentInsights(
  guildId: string,
  days: number = 30
): Promise<ContentInsights> {
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get top channels
    const topChannelsResult = await db.query(
      `SELECT
        channel_id,
        channel_name,
        COUNT(*) as message_count,
        COUNT(DISTINCT user_id) as unique_users,
        ROUND(COUNT(*)::numeric / $2, 1) as average_per_day
      FROM message_logs
      WHERE guild_id = $1 AND created_at > $3
      GROUP BY channel_id, channel_name
      ORDER BY message_count DESC
      LIMIT 10`,
      [guildId, days, since]
    );

    const topChannels: ChannelActivity[] = topChannelsResult.rows.map(row => ({
      channelId: row.channel_id,
      channelName: row.channel_name,
      messageCount: parseInt(row.message_count),
      uniqueUsers: parseInt(row.unique_users),
      averagePerDay: parseFloat(row.average_per_day),
    }));

    // Get top members
    const topMembersResult = await db.query(
      `SELECT
        ml.user_id,
        ml.username,
        COUNT(*) as message_count,
        MAX(ml.created_at) as last_active,
        gm.joined_at
      FROM message_logs ml
      LEFT JOIN guild_members gm ON ml.user_id = gm.user_id AND ml.guild_id = gm.guild_id
      WHERE ml.guild_id = $1 AND ml.created_at > $2
      GROUP BY ml.user_id, ml.username, gm.joined_at
      ORDER BY message_count DESC
      LIMIT 10`,
      [guildId, since]
    );

    const topMembers: MemberActivity[] = topMembersResult.rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      messageCount: parseInt(row.message_count),
      lastActive: new Date(row.last_active),
      joinedAt: row.joined_at ? new Date(row.joined_at) : new Date(),
    }));

    // Get peak hours (0-23)
    const peakHoursResult = await db.query(
      `SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as message_count
      FROM message_logs
      WHERE guild_id = $1 AND created_at > $2
      GROUP BY hour
      ORDER BY hour`,
      [guildId, since]
    );

    const peakHours = peakHoursResult.rows.map(row => ({
      hour: parseInt(row.hour),
      messageCount: parseInt(row.message_count),
    }));

    // Get peak days of week
    const peakDaysResult = await db.query(
      `SELECT
        TO_CHAR(created_at, 'Day') as day,
        COUNT(*) as message_count
      FROM message_logs
      WHERE guild_id = $1 AND created_at > $2
      GROUP BY day, EXTRACT(DOW FROM created_at)
      ORDER BY EXTRACT(DOW FROM created_at)`,
      [guildId, since]
    );

    const peakDays = peakDaysResult.rows.map(row => ({
      day: row.day.trim(),
      messageCount: parseInt(row.message_count),
    }));

    return {
      topChannels,
      topMembers,
      peakHours,
      peakDays,
    };
  } catch (error) {
    logger.error('Failed to get content insights:', error);
    throw error;
  }
}
