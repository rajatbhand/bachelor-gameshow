import Image from "next/image";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">BACHELOR GAME SHOW</h1>
        <p className="text-gray-600 mb-8">Welcome to the game show control system</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/display"
            className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <div className="text-2xl mb-2">📺</div>
            <div className="font-bold">Display</div>
            <div className="text-sm opacity-90">TV/Audience View</div>
          </a>
          
          <a
            href="/control"
            className="bg-green-600 text-white p-6 rounded-lg hover:bg-green-700 transition-colors"
          >
            <div className="text-2xl mb-2">🎮</div>
            <div className="font-bold">Control Panel</div>
            <div className="text-sm opacity-90">Game Operator</div>
          </a>
          
          <a
            href="/audience"
            className="bg-purple-600 text-white p-6 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <div className="text-2xl mb-2">👥</div>
            <div className="font-bold">Audience</div>
            <div className="text-sm opacity-90">Team Selection</div>
          </a>
        </div>
        
        <div className="mt-8 text-sm text-gray-500">
          <p>Firebase-powered real-time game show system</p>
          <p>Built with Next.js 14, TypeScript, and Tailwind CSS</p>
        </div>
      </div>
    </div>
  );
}
