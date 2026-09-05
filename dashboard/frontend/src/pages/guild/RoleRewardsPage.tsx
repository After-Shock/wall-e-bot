import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, Plus, Trash2, Save, CheckCircle } from 'lucide-react';
import { LevelingConfig } from '@wall-e/shared';
import { api } from '../../services/api';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

type RoleReward = LevelingConfig['roleRewards'][number];

interface GuildRole {
  id: string;
  name: string;
  color: number;
}

// Discord role colors are ints; 0 means "no color" (inherit), shown as grey.
const roleHex = (color: number) => (color ? `#${color.toString(16).padStart(6, '0')}` : '#99AAB5');

export default function RoleRewardsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [rewards, setRewards] = useState<RoleReward[] | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data, isLoading, error, update, isUpdating, updateError, updateWarning, refetch } =
    useGuildConfig<LevelingConfig>(guildId, 'leveling');

  const { data: guildRoles = [] } = useQuery<GuildRole[]>({
    queryKey: ['guild-roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/roles`).then(r => r.data),
  });

  const errorMessage = useErrorMessage(error || updateError);

  useEffect(() => {
    if (data) setRewards([...(data.roleRewards ?? [])].sort((a, b) => a.level - b.level));
  }, [data]);

  if (isLoading) return <LoadingSpinner message="Loading role rewards..." fullScreen />;
  if (error) {
    return (
      <ErrorAlert
        message="Failed to load role rewards"
        details={errorMessage || undefined}
        onRetry={() => refetch()}
        fullScreen
      />
    );
  }
  if (!rewards) return <LoadingSpinner fullScreen />;

  const roleName = (id: string) => guildRoles.find(r => r.id === id)?.name ?? 'Unknown role';
  const roleColor = (id: string) => roleHex(guildRoles.find(r => r.id === id)?.color ?? 0);
  const usedRoleIds = new Set(rewards.map(r => r.roleId));

  const addReward = () => {
    const firstFree = guildRoles.find(r => !usedRoleIds.has(r.id));
    setRewards(prev => [
      ...(prev ?? []),
      { level: 1, roleId: firstFree?.id ?? '', removeOnHigherLevel: false },
    ]);
  };

  const updateReward = (index: number, updates: Partial<RoleReward>) => {
    setRewards(prev => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const removeReward = (index: number) => {
    setRewards(prev => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleSave = async () => {
    if (!rewards) return;
    const sorted = [...rewards].sort((a, b) => a.level - b.level);
    try {
      // roleRewards is a top-level leveling field, so omitted leveling fields
      // remain untouched by the section PATCH contract.
      await update({ roleRewards: sorted } as Partial<LevelingConfig>);
      setRewards(sorted);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save role rewards:', err);
    }
  };

  const invalid = rewards.some(r => !r.roleId || r.level < 1);
  const previewLevels = [...new Set([1, 5, 10, 15, 20, 25, 30, 40, 50, ...rewards.map(r => r.level)])]
    .sort((a, b) => a - b);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Role Rewards</h1>
            <p className="text-discord-light">Assign roles when members reach certain levels</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isUpdating || invalid}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : showSuccess ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {updateError && (
        <ErrorAlert
          message="Failed to save role rewards"
          details={errorMessage || undefined}
          onRetry={handleSave}
          variant="error"
        />
      )}

      {updateWarning && <ErrorAlert message="Configuration saved; bot visibility is delayed" details={updateWarning} variant="warning" />}

      {/* Info */}
      <div className="bg-discord-blurple/20 border border-discord-blurple/50 rounded-lg p-4">
        <p className="text-sm">
          Roles are granted automatically when a member reaches the specified level. Wall-E's role
          must sit above every reward role in Server Settings → Roles, or it can't assign them.
          Rewards only apply if <strong>Leveling</strong> is enabled on the Leveling Settings page.
        </p>
      </div>

      {/* Rewards List */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Level Rewards ({rewards.length})</h3>
          <button
            onClick={addReward}
            disabled={guildRoles.length === 0}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Reward
          </button>
        </div>

        {rewards.length === 0 ? (
          <div className="text-center py-12 text-discord-light">
            <Award className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No role rewards configured</p>
            <p className="text-sm mt-1">Add rewards to give roles when members level up</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward, index) => (
              <div key={index} className="bg-discord-dark rounded-lg p-4 flex items-end gap-4 flex-wrap">
                <div className="w-24">
                  <label className="block text-xs text-discord-light mb-1">Level</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={reward.level}
                    onChange={e => updateReward(index, { level: parseInt(e.target.value) || 1 })}
                    className="input w-full"
                  />
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <label className="block text-xs text-discord-light mb-1">Role to award</label>
                  <select
                    value={reward.roleId}
                    onChange={e => updateReward(index, { roleId: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select role...</option>
                    {guildRoles.map(role => (
                      <option
                        key={role.id}
                        value={role.id}
                        disabled={role.id !== reward.roleId && usedRoleIds.has(role.id)}
                      >
                        @{role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reward.removeOnHigherLevel}
                    onChange={e => updateReward(index, { removeOnHigherLevel: e.target.checked })}
                    className="w-4 h-4"
                  />
                  Remove at higher levels
                </label>
                <button
                  onClick={() => removeReward(index)}
                  className="p-2 text-discord-light hover:text-red-400 transition-colors pb-3"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Level Progression Preview */}
      {rewards.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Level Progression</h3>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-discord-dark" />
            <div className="space-y-4 pl-10">
              {previewLevels.map(level => {
                const reward = rewards.find(r => r.level === level && r.roleId);
                return (
                  <div key={level} className="relative flex items-center gap-4">
                    <div
                      className={`absolute -left-6 w-3 h-3 rounded-full ${
                        reward ? 'bg-discord-blurple' : 'bg-discord-dark'
                      }`}
                    />
                    <span className="text-sm text-discord-light w-12">Lv. {level}</span>
                    {reward ? (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: roleColor(reward.roleId) + '33', color: roleColor(reward.roleId) }}
                      >
                        @{roleName(reward.roleId)}
                      </span>
                    ) : (
                      <span className="text-xs text-discord-light opacity-50">No reward</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
