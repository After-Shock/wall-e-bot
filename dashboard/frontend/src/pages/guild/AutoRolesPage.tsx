import { useState } from 'react';
import { Users, Save, Plus, Trash2, GripVertical } from 'lucide-react';

interface AutoRole {
  id: string;
  roleId: string;
  roleName: string;
  delay: number;
  condition: 'all' | 'humans' | 'bots';
}

const mockRoles = [
  { id: '1', name: 'Member', color: '#3498db' },
  { id: '2', name: 'Newcomer', color: '#2ecc71' },
  { id: '3', name: 'Verified', color: '#9b59b6' },
];

export default function AutoRolesPage() {
  const [enabled, setEnabled] = useState(false);
  const [autoRoles, setAutoRoles] = useState<AutoRole[]>([
    { id: '1', roleId: '1', roleName: 'Member', delay: 0, condition: 'humans' },
  ]);

  const addRole = () => {
    setAutoRoles(prev => [
      ...prev,
      { id: Date.now().toString(), roleId: '', roleName: '', delay: 0, condition: 'all' },
    ]);
  };

  const removeRole = (id: string) => {
    setAutoRoles(prev => prev.filter(r => r.id !== id));
  };

  const updateRole = (id: string, updates: Partial<AutoRole>) => {
    setAutoRoles(prev =>
      prev.map(r => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Auto Roles</h1>
            <p className="text-discord-light">Automatically assign roles to new members</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable Auto Roles</h3>
            <p className="text-sm text-discord-light">
              Automatically assign roles when members join the server
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Auto Roles List */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Roles to Assign</h3>
              <button
                onClick={addRole}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Role
              </button>
            </div>

            {autoRoles.length === 0 ? (
              <div className="text-center py-8 text-discord-light">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No auto roles configured</p>
                <p className="text-sm">Click "Add Role" to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
              {autoRoles.map((role) => (
                  <div
                    key={role.id}
                    className="bg-discord-dark rounded-lg p-4 flex items-center gap-4"
                  >
                    <GripVertical className="w-5 h-5 text-discord-light cursor-grab" />
                    
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-discord-light mb-1">Role</label>
                        <select
                          value={role.roleId}
                          onChange={e => {
                            const selected = mockRoles.find(r => r.id === e.target.value);
                            updateRole(role.id, {
                              roleId: e.target.value,
                              roleName: selected?.name || '',
                            });
                          }}
                          className="input w-full"
                        >
                          <option value="">Select role...</option>
                          {mockRoles.map(r => (
                            <option key={r.id} value={r.id}>
                              @{r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-discord-light mb-1">Delay (seconds)</label>
                        <input
                          type="number"
                          value={role.delay}
                          onChange={e => updateRole(role.id, { delay: parseInt(e.target.value) || 0 })}
                          className="input w-full"
                          min="0"
                          max="3600"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs text-discord-light mb-1">Apply to</label>
                        <select
                          value={role.condition}
                          onChange={e => updateRole(role.id, { condition: e.target.value as AutoRole['condition'] })}
                          className="input w-full"
                        >
                          <option value="all">All Members</option>
                          <option value="humans">Humans Only</option>
                          <option value="bots">Bots Only</option>
                        </select>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => removeRole(role.id)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="card bg-discord-blurple/10 border-discord-blurple/30">
            <h4 className="font-semibold mb-2">💡 Tips</h4>
            <ul className="text-sm text-discord-light space-y-1">
              <li>• Drag roles to reorder them (roles are assigned in order)</li>
              <li>• Use delays to prevent raid bots from getting roles immediately</li>
              <li>• Make sure the bot's role is higher than the roles it assigns</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
