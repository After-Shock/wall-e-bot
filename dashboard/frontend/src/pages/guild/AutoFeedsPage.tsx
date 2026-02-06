import { useState } from 'react';
import { Rss, Plus, Trash2, Hash, Youtube, Globe } from 'lucide-react';

interface Feed {
  id: string;
  name: string;
  type: 'rss' | 'reddit' | 'youtube';
  url: string;
  channelId: string;
  channelName: string;
  lastPost?: string;
  enabled: boolean;
}

export default function AutoFeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([
    { id: '1', name: 'Tech News', type: 'rss', url: 'https://techcrunch.com/feed/', channelId: '1', channelName: 'tech-news', lastPost: '2 hours ago', enabled: true },
    { id: '2', name: 'r/gaming', type: 'reddit', url: 'https://reddit.com/r/gaming', channelId: '2', channelName: 'reddit-feed', lastPost: '30 minutes ago', enabled: true },
    { id: '3', name: 'YouTube Channel', type: 'youtube', url: 'https://youtube.com/c/example', channelId: '3', channelName: 'videos', lastPost: '1 day ago', enabled: false },
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [newFeed, setNewFeed] = useState({ name: '', type: 'rss' as 'rss' | 'reddit' | 'youtube', url: '', channelId: '' });

  const addFeed = () => {
    if (!newFeed.name.trim() || !newFeed.url.trim()) return;
    setFeeds(prev => [...prev, {
      id: Date.now().toString(),
      ...newFeed,
      channelName: 'general',
      enabled: true,
    }]);
    setNewFeed({ name: '', type: 'rss', url: '', channelId: '' });
    setIsAdding(false);
  };

  const toggleFeed = (id: string) => {
    setFeeds(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  const removeFeed = (id: string) => {
    setFeeds(prev => prev.filter(f => f.id !== id));
  };

  const getFeedIcon = (type: string) => {
    switch (type) {
      case 'youtube': return <Youtube className="w-5 h-5 text-red-500" />;
      case 'reddit': return <Globe className="w-5 h-5 text-orange-500" />;
      default: return <Rss className="w-5 h-5 text-orange-400" />;
    }
  };

  const getFeedColor = (type: string) => {
    switch (type) {
      case 'youtube': return 'bg-red-500/20 text-red-400';
      case 'reddit': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-yellow-500/20 text-yellow-400';
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rss className="w-8 h-8 text-orange-400" />
          <div>
            <h1 className="text-2xl font-bold">Auto Feeds</h1>
            <p className="text-discord-light">Automatically post content from RSS, Reddit, and YouTube</p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Feed
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold">{feeds.length}</p>
          <p className="text-sm text-discord-light">Total Feeds</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-400">{feeds.filter(f => f.type === 'rss').length}</p>
          <p className="text-sm text-discord-light">RSS</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-orange-400">{feeds.filter(f => f.type === 'reddit').length}</p>
          <p className="text-sm text-discord-light">Reddit</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-400">{feeds.filter(f => f.type === 'youtube').length}</p>
          <p className="text-sm text-discord-light">YouTube</p>
        </div>
      </div>

      {/* Add Feed Modal */}
      {isAdding && (
        <div className="card border-2 border-discord-blurple">
          <h3 className="font-semibold mb-4">Add New Feed</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Feed Name</label>
                <input
                  type="text"
                  value={newFeed.name}
                  onChange={e => setNewFeed(prev => ({ ...prev, name: e.target.value }))}
                  className="input w-full"
                  placeholder="My Feed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Feed Type</label>
                <select
                  value={newFeed.type}
                  onChange={e => setNewFeed(prev => ({ ...prev, type: e.target.value as any }))}
                  className="input w-full"
                >
                  <option value="rss">RSS Feed</option>
                  <option value="reddit">Reddit Subreddit</option>
                  <option value="youtube">YouTube Channel</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {newFeed.type === 'reddit' ? 'Subreddit URL' : newFeed.type === 'youtube' ? 'Channel URL' : 'Feed URL'}
              </label>
              <input
                type="text"
                value={newFeed.url}
                onChange={e => setNewFeed(prev => ({ ...prev, url: e.target.value }))}
                className="input w-full"
                placeholder={newFeed.type === 'reddit' ? 'https://reddit.com/r/...' : newFeed.type === 'youtube' ? 'https://youtube.com/c/...' : 'https://example.com/feed.xml'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Post to Channel</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                <select
                  value={newFeed.channelId}
                  onChange={e => setNewFeed(prev => ({ ...prev, channelId: e.target.value }))}
                  className="input w-full pl-9"
                >
                  <option value="">Select channel...</option>
                  <option value="feed">feed</option>
                  <option value="news">news</option>
                  <option value="media">media</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsAdding(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={addFeed} className="btn btn-primary">Add Feed</button>
            </div>
          </div>
        </div>
      )}

      {/* Feeds List */}
      <div className="space-y-4">
        {feeds.length === 0 ? (
          <div className="card text-center py-12 text-discord-light">
            <Rss className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No feeds configured</p>
            <p className="text-sm mt-1">Add feeds to automatically post content</p>
          </div>
        ) : (
          feeds.map(feed => (
            <div key={feed.id} className={`card ${!feed.enabled ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${getFeedColor(feed.type)}`}>
                  {getFeedIcon(feed.type)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{feed.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs uppercase ${getFeedColor(feed.type)}`}>
                      {feed.type}
                    </span>
                  </div>
                  <p className="text-sm text-discord-light truncate">{feed.url}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-discord-light">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {feed.channelName}
                    </span>
                    {feed.lastPost && <span>Last post: {feed.lastPost}</span>}
                  </div>
                </div>

                <button
                  onClick={() => toggleFeed(feed.id)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    feed.enabled ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      feed.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>

                <button
                  onClick={() => removeFeed(feed.id)}
                  className="p-2 text-discord-light hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
