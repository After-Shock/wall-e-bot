import { useState } from 'react';
import { Calendar, Plus, Trash2, Edit, Clock, Hash, Play, Pause } from 'lucide-react';

interface ScheduledMessage {
  id: string;
  name: string;
  channelId: string;
  channelName: string;
  message: string;
  schedule: string;
  nextRun: Date;
  enabled: boolean;
}

export default function ScheduledMessagesPage() {
  const [messages, setMessages] = useState<ScheduledMessage[]>([
    { id: '1', name: 'Daily Reminder', channelId: '1', channelName: 'announcements', message: '📢 Don\'t forget to check out our weekly events!', schedule: 'Every day at 9:00 AM', nextRun: new Date(Date.now() + 43200000), enabled: true },
    { id: '2', name: 'Weekly Update', channelId: '2', channelName: 'general', message: '🎉 Weekly server stats are now available!', schedule: 'Every Sunday at 12:00 PM', nextRun: new Date(Date.now() + 259200000), enabled: true },
    { id: '3', name: 'Monthly Giveaway', channelId: '3', channelName: 'giveaways', message: '🎁 Monthly giveaway starting now!', schedule: '1st of every month at 6:00 PM', nextRun: new Date(Date.now() + 604800000), enabled: false },
  ]);


  const toggleMessage = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };

  const deleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const formatNextRun = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `in ${days}d ${hours % 24}h`;
    if (hours > 0) return `in ${hours}h`;
    return 'soon';
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Scheduled Messages</h1>
            <p className="text-discord-light">Automate recurring announcements and reminders</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold">{messages.length}</p>
          <p className="text-sm text-discord-light">Total Schedules</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-400">{messages.filter(m => m.enabled).length}</p>
          <p className="text-sm text-discord-light">Active</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-400">{messages.filter(m => !m.enabled).length}</p>
          <p className="text-sm text-discord-light">Paused</p>
        </div>
      </div>

      {/* Messages List */}
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="card text-center py-12 text-discord-light">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No scheduled messages</p>
            <p className="text-sm mt-1">Create a schedule to automatically post messages</p>
          </div>
        ) : (
          messages.map(message => (
            <div key={message.id} className={`card ${!message.enabled ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-4">
                <button
                  onClick={() => toggleMessage(message.id)}
                  className={`p-3 rounded-lg ${
                    message.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {message.enabled ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                </button>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{message.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      message.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {message.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-discord-light mb-3">
                    <span className="flex items-center gap-1">
                      <Hash className="w-4 h-4" />
                      {message.channelName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {message.schedule}
                    </span>
                  </div>
                  
                  <div className="bg-discord-dark rounded-lg p-3 text-sm">
                    {message.message}
                  </div>
                  
                  {message.enabled && (
                    <p className="text-xs text-discord-light mt-2">
                      Next run: <span className="text-green-400">{formatNextRun(message.nextRun)}</span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button className="p-2 text-discord-light hover:text-white transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMessage(message.id)}
                    className="p-2 text-discord-light hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
