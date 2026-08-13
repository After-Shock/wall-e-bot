import { Construction } from 'lucide-react';

/**
 * Honest placeholder for dashboard pages whose bot-side feature isn't built yet.
 * Prevents a page from looking functional (with a working Save button) when
 * nothing it saves would actually take effect.
 */
export default function FeatureUnavailable({ title, note }: { title: string; note?: string }) {
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="card text-center py-16">
        <Construction className="w-16 h-16 mx-auto text-discord-light mb-4 opacity-60" />
        <h3 className="text-xl font-semibold mb-2">Not available yet</h3>
        <p className="text-discord-light max-w-md mx-auto">
          {note ?? `${title} isn't wired up to the bot yet, so changes here wouldn't do anything. This page is disabled until the feature is built.`}
        </p>
      </div>
    </div>
  );
}
