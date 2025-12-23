import { createFileRoute, Link } from '@tanstack/react-router'
import { Box, Eye, Layers, Zap } from 'lucide-react'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const features = [
    {
      icon: <Eye className="w-12 h-12 text-cyan-400" />,
      title: 'Mermaid Compatible',
      description:
        'Parse any Mermaid flowchart diagram. LLMs know the syntax, millions of existing diagrams work out of the box.',
    },
    {
      icon: <Box className="w-12 h-12 text-cyan-400" />,
      title: 'Isometric Rendering',
      description:
        'Transform flat diagrams into beautiful 3D-looking isometric views. No WebGL required - pure SVG with CSS transforms.',
    },
    {
      icon: <Layers className="w-12 h-12 text-cyan-400" />,
      title: 'Semantic Navigation',
      description:
        'Drill into subgraphs, layer overlays, or fold/expand in place. Navigate complex architectures intuitively.',
    },
    {
      icon: <Zap className="w-12 h-12 text-cyan-400" />,
      title: 'Zero Dependencies',
      description:
        'Pure TypeScript library. Bring your own Mermaid. Works in any framework - React, Vue, Svelte, or vanilla JS.',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Hero */}
      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10"></div>
        <div className="relative max-w-5xl mx-auto">
          <h1 className="text-6xl md:text-7xl font-black text-white mb-6 [letter-spacing:-0.04em]">
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              isomaid
            </span>
          </h1>
          <p className="text-2xl md:text-3xl text-gray-300 mb-4 font-light">
            Interactive architecture diagrams with isometric rendering
          </p>
          <p className="text-lg text-gray-400 max-w-3xl mx-auto mb-8">
            Take Mermaid syntax and render it as flat 2D or beautiful isometric views.
            Navigate complex architectures with drill-down, layering, and folding.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/viewer"
              className="px-8 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/50"
            >
              Try the Demo
            </Link>
            <a
              href="https://github.com/your-org/isomaid"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Code Example */}
      <section className="py-16 px-6 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-white text-center mb-8">
          Simple to Use
        </h2>
        <div className="bg-slate-800 rounded-xl p-6 font-mono text-sm overflow-x-auto">
          <pre className="text-gray-300">
{`import { diagram } from 'isomaid'

const svg = await diagram(\`
%%{arch: {view: "iso", nav: "drill"}}%%
flowchart TD
    subgraph Frontend["Frontend Services"]
        WebApp[Web App]
        CDN[CDN]
    end
    subgraph Backend["Backend Services"]
        API[API Server]
        DB[(Database)]
    end
    Frontend --> Backend
\`)

document.getElementById('diagram').innerHTML = svg`}
          </pre>
        </div>
      </section>
    </div>
  )
}
