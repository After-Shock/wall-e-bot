import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  TrendingUp,
  Users,
  MessageSquare,
  UserPlus,
  Activity,
  BarChart3,
  Clock,
  Calendar
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import type {
  AnalyticsOverview,
  GrowthMetrics,
  ContentInsights
} from '@wall-e/shared';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

export default function AnalyticsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [growthPeriod, setGrowthPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [insightsDays, setInsightsDays] = useState(30);

  // Fetch overview data
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview
  } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics', guildId, 'overview'],
    queryFn: async () => {
      const response = await api.get(`/api/guilds/${guildId}/analytics/overview`);
      return response.data;
    },
    enabled: !!guildId,
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch growth metrics
  const {
    data: growth,
    isLoading: growthLoading,
    error: growthError,
    refetch: refetchGrowth
  } = useQuery<GrowthMetrics>({
    queryKey: ['analytics', guildId, 'growth', growthPeriod],
    queryFn: async () => {
      const response = await api.get(
        `/api/guilds/${guildId}/analytics/growth?period=${growthPeriod}`
      );
      return response.data;
    },
    enabled: !!guildId,
    refetchInterval: 60000,
  });

  // Fetch content insights
  const {
    data: insights,
    isLoading: insightsLoading,
    error: insightsError,
    refetch: refetchInsights
  } = useQuery<ContentInsights>({
    queryKey: ['analytics', guildId, 'insights', insightsDays],
    queryFn: async () => {
      const response = await api.get(
        `/api/guilds/${guildId}/analytics/insights?days=${insightsDays}`
      );
      return response.data;
    },
    enabled: !!guildId,
    refetchInterval: 60000,
  });

  if (overviewLoading || growthLoading || insightsLoading) {
    return <LoadingSpinner message="Loading analytics..." fullScreen />;
  }

  if (overviewError) {
    return (
      <ErrorAlert
        message="Failed to load analytics"
        details={overviewError.message}
        onRetry={() => refetchOverview()}
        fullScreen
      />
    );
  }

  if (!overview) {
    return <LoadingSpinner fullScreen />;
  }

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatGrowth = (growth: number) => {
    const sign = growth > 0 ? '+' : '';
    return `${sign}${growth.toFixed(1)}%`;
  };

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
          <p className="text-discord-light">Track your server's growth and engagement</p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Members */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-discord-light">Total Members</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(overview.totalMembers)}</p>
              <p className={`text-xs mt-2 ${overview.memberGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatGrowth(overview.memberGrowth)} this week
              </p>
            </div>
            <div className="w-12 h-12 bg-discord-blurple/20 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-discord-blurple" />
            </div>
          </div>
        </div>

        {/* Total Messages */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-discord-light">Total Messages</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(overview.totalMessages)}</p>
              <p className={`text-xs mt-2 ${overview.messageGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatGrowth(overview.messageGrowth)} this week
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        {/* Active Members */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-discord-light">Active Members</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(overview.activeMembers)}</p>
              <p className="text-xs mt-2 text-discord-light">Last 7 days</p>
            </div>
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <Activity className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        {/* New Members */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-discord-light">New Members</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(overview.newMembers)}</p>
              <p className="text-xs mt-2 text-discord-light">Last 7 days</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Growth Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">Growth Trends</h2>
            <p className="text-sm text-discord-light">Member and message growth over time</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGrowthPeriod('day')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                growthPeriod === 'day'
                  ? 'bg-discord-blurple text-white'
                  : 'bg-discord-dark text-discord-light hover:bg-discord-darker'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setGrowthPeriod('week')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                growthPeriod === 'week'
                  ? 'bg-discord-blurple text-white'
                  : 'bg-discord-dark text-discord-light hover:bg-discord-darker'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setGrowthPeriod('month')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                growthPeriod === 'month'
                  ? 'bg-discord-blurple text-white'
                  : 'bg-discord-dark text-discord-light hover:bg-discord-darker'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {growthLoading ? (
          <LoadingSpinner />
        ) : growthError ? (
          <p className="text-red-400 text-center py-8">Failed to load growth data</p>
        ) : growth && growth.data.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {growth.data.map((point, index) => {
              const maxMessages = Math.max(...growth.data.map(p => p.messages));
              const maxMembers = Math.max(...growth.data.map(p => p.members));
              const messageWidth = maxMessages > 0 ? (point.messages / maxMessages) * 100 : 0;
              const memberWidth = maxMembers > 0 ? (point.members / maxMembers) * 100 : 0;

              return (
                <div key={index} className="bg-discord-dark rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{point.date}</span>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-400">↑ {point.joins}</span>
                      <span className="text-red-400">↓ {point.leaves}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-discord-light">Messages</span>
                        <span className="text-blue-400">{formatNumber(point.messages)}</span>
                      </div>
                      <div className="w-full bg-discord-darker rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${messageWidth}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-discord-light">Members</span>
                        <span className="text-discord-blurple">{formatNumber(point.members)}</span>
                      </div>
                      <div className="w-full bg-discord-darker rounded-full h-2">
                        <div
                          className="bg-discord-blurple h-2 rounded-full transition-all"
                          style={{ width: `${memberWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-discord-light text-center py-8">No growth data available</p>
        )}
      </div>

      {/* Content Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Channels */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Top Channels</h2>
          {insightsLoading ? (
            <LoadingSpinner />
          ) : insights && insights.topChannels.length > 0 ? (
            <div className="space-y-3">
              {insights.topChannels.slice(0, 5).map((channel, index) => (
                <div key={channel.channelId} className="bg-discord-dark rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-discord-light font-semibold">#{index + 1}</span>
                      <span className="font-medium">{channel.channelName}</span>
                    </div>
                    <span className="text-sm text-discord-light">{formatNumber(channel.messageCount)} msgs</span>
                  </div>
                  <div className="flex justify-between text-xs text-discord-light">
                    <span>{channel.uniqueUsers} users</span>
                    <span>{channel.averagePerDay}/day avg</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-discord-light text-center py-8">No channel data available</p>
          )}
        </div>

        {/* Top Members */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Most Active Members</h2>
          {insightsLoading ? (
            <LoadingSpinner />
          ) : insights && insights.topMembers.length > 0 ? (
            <div className="space-y-3">
              {insights.topMembers.slice(0, 5).map((member, index) => (
                <div key={member.userId} className="bg-discord-dark rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-discord-light font-semibold">#{index + 1}</span>
                      <div>
                        <p className="font-medium">{member.username}</p>
                        <p className="text-xs text-discord-light">
                          Joined {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-discord-blurple">
                        {formatNumber(member.messageCount)}
                      </p>
                      <p className="text-xs text-discord-light">messages</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-discord-light text-center py-8">No member data available</p>
          )}
        </div>
      </div>

      {/* Peak Activity Times */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Peak Hours */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-discord-blurple" />
            <h2 className="text-xl font-bold">Peak Hours (UTC)</h2>
          </div>
          {insightsLoading ? (
            <LoadingSpinner />
          ) : insights && insights.peakHours.length > 0 ? (
            <div className="space-y-2">
              {(() => {
                const maxCount = Math.max(...insights.peakHours.map(h => h.messageCount));
                return insights.peakHours.map(hour => (
                  <div key={hour.hour} className="flex items-center gap-3">
                    <span className="text-sm text-discord-light w-12">
                      {hour.hour.toString().padStart(2, '0')}:00
                    </span>
                    <div className="flex-1 bg-discord-dark rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-discord-blurple h-full flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${(hour.messageCount / maxCount) * 100}%` }}
                      >
                        {hour.messageCount > 0 && (
                          <span className="text-xs font-semibold">{formatNumber(hour.messageCount)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <p className="text-discord-light text-center py-8">No peak hour data available</p>
          )}
        </div>

        {/* Peak Days */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-green-400" />
            <h2 className="text-xl font-bold">Peak Days</h2>
          </div>
          {insightsLoading ? (
            <LoadingSpinner />
          ) : insights && insights.peakDays.length > 0 ? (
            <div className="space-y-2">
              {(() => {
                const maxCount = Math.max(...insights.peakDays.map(d => d.messageCount));
                return insights.peakDays.map(day => (
                  <div key={day.day} className="flex items-center gap-3">
                    <span className="text-sm text-discord-light w-20">{day.day}</span>
                    <div className="flex-1 bg-discord-dark rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-green-500 h-full flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${(day.messageCount / maxCount) * 100}%` }}
                      >
                        {day.messageCount > 0 && (
                          <span className="text-xs font-semibold">{formatNumber(day.messageCount)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <p className="text-discord-light text-center py-8">No peak day data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
