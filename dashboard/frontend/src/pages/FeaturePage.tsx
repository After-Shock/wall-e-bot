import { Construction } from 'lucide-react';

interface FeaturePageProps {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export default function FeaturePage({ title, description, icon: Icon = Construction }: FeaturePageProps) {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Icon className="w-8 h-8 text-discord-blurple" />
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      
      <div className="card">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Construction className="w-16 h-16 text-discord-light mb-4" />
          <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-discord-light max-w-md">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
