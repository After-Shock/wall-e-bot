import { useState } from 'react';
import { Award, Plus, Trash2, Save, GripVertical } from 'lucide-react';

interface RoleReward {
  id: string;
  level: number;
  roleId: string;
  roleName: string;
  roleColor: string;
}

export default function RoleRewardsPage() {
  const [rewards, setRewards] = useState<RoleReward[]>([
    { id: '1', level: 5, roleId: '1', roleName: 'Active', roleColor: '#3BA55C' },
    { id: '2', level: 10, roleId: '2', roleName: 'Regular', roleColor: '#5865F2' },
    { id: '3', level: 25, roleId: '3', roleName: 'Veteran', roleColor: '#EB459E' },
    { id: '4', level: 50, roleId: '4', roleName: 'Legend', roleColor: '#FEE75C' },
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [newReward, setNewReward] = useState({ level: 1, roleId: '' });

  const availableRoles = [
    { id: 'member', name: 'Member', color: '#99AAB5' },
    { id: 'active', name: 'Active', color: '#3BA55C' },
    { id: 'regular', name: 'Regular', color: '#5865F2' },
    { id: 'veteran', name: 'Veteran', color: '#EB459E' },
    { id: 'legend', name: 'Legend', color: '#FEE75C' },
    { id: 'champion', name: 'Champion', color: '#ED4245' },
  ];

  const addReward = () => {
    if (!newReward.roleId || newReward.level < 1) return;
    const role = availableRoles.find(r => r.id === newReward.roleId);
    if (!role) return;

    setRewards(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        level: newReward.level,
        roleId: role.id,
        roleName: role.name,
        roleColor: role.color,
      },
    ].sort((a, b) => a.level - b.level));
    setNewReward({ level: 1, roleId: '' });
    setIsAdding(false);
  };

  const removeReward = (id: string) => {
    setRewards(prev => prev.filter(r => r.id !== id));
  };

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
        <button className="btn btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Info */}
      <div className="bg-discord-blurple/20 border border-discord-blurple/50 rounded-lg p-4">
        <p className="text-sm">
          Role rewards are automatically given when a member reaches the specified level.
          Make sure the bot's role is higher than the reward roles in the server settings.
        </p>
      </div>

      {/* Rewards List */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Level Rewards ({rewards.length})</h3>
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Reward
          </button>
        </div>

        {isAdding && (
          <div className="bg-discord-dark rounded-lg p-4 mb-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Level Required</label>
                <input
                  type="number"
                  value={newReward.level}
                  onChange={e => setNewReward(prev => ({ ...prev, level: parseInt(e.target.value) || 1 }))}
                  className="input w-full"
                  min="1"
                  max="100"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Role to Award</label>
                <select
                  value={newReward.roleId}
                  onChange={e => setNewReward(prev => ({ ...prev, roleId: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Select role...</option>
                  {availableRoles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addReward}
                  className="btn btn-primary"
                  disabled={!newReward.roleId}
                >
                  Add
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {rewards.length === 0 ? (
          <div className="text-center py-12 text-discord-light">
            <Award className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No role rewards configured</p>
            <p className="text-sm mt-1">Add rewards to give roles when members level up</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rewards.map(reward => (
              <div
                key={reward.id}
                className="flex items-center gap-4 bg-discord-dark rounded-lg p-3 group"
              >
                <GripVertical className="w-4 h-4 text-discord-light opacity-0 group-hover:opacity-100 cursor-grab" />
                
                <div className="w-16 text-center">
                  <span className="text-2xl font-bold">{reward.level}</span>
                  <p className="text-xs text-discord-light">Level</p>
                </div>

                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xl">→</span>
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{ backgroundColor: reward.roleColor + '33', color: reward.roleColor }}
                  >
                    @{reward.roleName}
                  </span>
                </div>

                <button
                  onClick={() => removeReward(reward.id)}
                  className="p-2 text-discord-light hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Level Progression Preview */}
      <div className="card">
        <h3 className="font-semibold mb-4">Level Progression</h3>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-discord-dark" />
          <div className="space-y-4 pl-10">
            {[1, 5, 10, 15, 20, 25, 30, 40, 50].map(level => {
              const reward = rewards.find(r => r.level === level);
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
                      style={{ backgroundColor: reward.roleColor + '33', color: reward.roleColor }}
                    >
                      @{reward.roleName}
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
    </div>
  );
}
