import { Link } from "react-router-dom";
import { Home, Compass } from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { WaveBackground } from "../components/WaveBackground";

export default function NotFound() {
  return (
    <PublicLayout>
      <section className="relative grid min-h-[70vh] place-items-center overflow-hidden px-4">
        <WaveBackground />
        <div className="relative text-center animate-fade-up">
          <p className="bg-gradient-to-r from-brand-600 to-teal-400 bg-clip-text text-8xl font-extrabold text-transparent">404</p>
          <h1 className="mt-2 text-2xl font-extrabold text-ink dark:text-white">This page flatlined</h1>
          <p className="mt-2 muted">The page you're looking for doesn't exist or has moved.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/" className="btn-primary magnetic"><Home className="h-4 w-4" /> Go home</Link>
            <Link to="/#features" className="btn-outline magnetic"><Compass className="h-4 w-4" /> See features</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
