import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-6xl font-bold text-discord-blurple">404</h1>
      <h2 className="text-2xl font-semibold">Page Not Found</h2>
      <p className="text-discord-light">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn btn-primary flex items-center gap-2 mt-4">
        <Home className="w-4 h-4" />
        Go Home
      </Link>
    </div>
  );
}
