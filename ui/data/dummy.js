/**
 * Kastrix ダミーデータ
 * 
 * バックエンド未実装時のフロントエンド開発用。
 * Phase 2 でバックエンド接続後、invoke() 経由のデータ取得に置き換える。
 */

// ── タブ・ピッカー用プロジェクト（簡易） ─────────────────
const projects = [
  { id: 'proj-1', name: 'Marketing Web', color: 'indigo', icon: 'M' },
  { id: 'proj-2', name: 'Mobile App',    color: 'purple', icon: 'A' },
  { id: 'proj-3', name: 'Design System', color: 'pink',   icon: 'D' }
];

// ── タスク ────────────────────────────────────────────────
const tasks = [
  { id: '1', projectId: 'proj-1', title: 'ランディングページ制作', status: 'done',        priority: 'high',   dueDate: '2023-10-27', assignee: 'Tanaka'  },
  { id: '2', projectId: 'proj-1', title: 'SEOキーワード選定',       status: 'in-progress', priority: 'medium', dueDate: '2023-10-26', assignee: 'Sato'    },
  { id: '3', projectId: 'proj-2', title: 'ログイン画面の実装',       status: 'todo',        priority: 'high',   dueDate: '2023-10-27', assignee: 'Suzuki'  },
  { id: '4', projectId: 'proj-3', title: 'カラーパレット定義',       status: 'done',        priority: 'low',    dueDate: '2023-10-24', assignee: 'Ito'     },
  { id: '5', projectId: 'proj-2', title: 'APIドキュメント更新',      status: 'done',        priority: 'medium', dueDate: '2023-10-23', assignee: 'Suzuki'  }
];

// ── ローカルプロジェクト（ディレクトリスキャン相当） ──────
const localProjects = [
  { id: 1, name: 'lumina-dashboard',  path: 'C:\\Projects\\lumina-dashboard',   language: 'typescript', localModified: '2024-01-15 14:30', gitModified: '2024-01-14 09:15', lastCommit: 'feat: add project filtering'   },
  { id: 2, name: 'api-gateway',       path: 'C:\\Projects\\api-gateway',         language: 'rust',       localModified: '2024-01-14 18:45', gitModified: '2024-01-14 16:20', lastCommit: 'fix: handle cors headers'      },
  { id: 3, name: 'data-processor',    path: 'D:\\Workspace\\data-processor',     language: 'python',     localModified: '2024-01-13 11:20', gitModified: '2024-01-12 15:30', lastCommit: 'refactor: optimize pipeline'   },
  { id: 4, name: 'portfolio-site',    path: 'C:\\Projects\\portfolio-site',      language: 'javascript', localModified: '2024-01-15 09:00', gitModified: '2024-01-15 08:45', lastCommit: 'design: update hero section'   },
  { id: 5, name: 'ecommerce-backend', path: 'D:\\Workspace\\ecommerce-backend',  language: 'typescript', localModified: '2024-01-14 22:15', gitModified: '2024-01-14 20:00', lastCommit: 'feat: add payment integration' },
  { id: 6, name: 'cli-tools',         path: '~/dev/cli-tools',                      language: 'go',         localModified: '2024-01-13 16:30', gitModified: '2024-01-13 14:00', lastCommit: 'chore: update dependencies'    }
];

// ── アクティビティログ（将来 DB から取得） ────────────────
const activityLogs = [
  { id: 'log-1', taskId: '1', projectId: 'proj-1', action: 'completed', taskTitle: 'ランディングページ制作', projectName: 'Marketing Web', modifiedBy: 'Tanaka',  timestamp: '2023-10-27 11:00' },
  { id: 'log-2', taskId: '2', projectId: 'proj-1', action: 'started',   taskTitle: 'SEOキーワード選定',       projectName: 'Marketing Web', modifiedBy: 'Sato',    timestamp: '2023-10-26 09:15' },
  { id: 'log-3', taskId: '3', projectId: 'proj-2', action: 'created',   taskTitle: 'ログイン画面の実装',       projectName: 'Mobile App',    modifiedBy: 'Suzuki',  timestamp: '2023-10-27 11:00' },
  { id: 'log-4', taskId: '4', projectId: 'proj-3', action: 'completed', taskTitle: 'カラーパレット定義',       projectName: 'Design System', modifiedBy: 'Ito',     timestamp: '2023-10-24 16:45' },
  { id: 'log-5', taskId: '5', projectId: 'proj-2', action: 'completed', taskTitle: 'APIドキュメント更新',      projectName: 'Mobile App',    modifiedBy: 'Suzuki',  timestamp: '2023-10-23 10:30' }
];

// ── 言語バッジカラー定義 ──────────────────────────────────
const langColors = {
  javascript: { bg: 'bg-[#f1e05a20]', text: 'text-[#f1e05a]', label: 'JS' },
  typescript: { bg: 'bg-[#2b748920]', text: 'text-[#2b7489]', label: 'TS' },
  python:     { bg: 'bg-[#3572A520]', text: 'text-[#3572A5]', label: 'PY' },
  rust:       { bg: 'bg-[#dea58420]', text: 'text-[#dea584]', label: 'RS' },
  go:         { bg: 'bg-[#00ADD820]', text: 'text-[#00ADD8]', label: 'GO' },
  html:       { bg: 'bg-[#e34c2620]', text: 'text-[#e34c26]', label: 'HTML' },
  css:        { bg: 'bg-[#563d7c20]', text: 'text-[#563d7c]', label: 'CSS' },
  java:       { bg: 'bg-[#b0721920]', text: 'text-[#b07219]', label: 'JAVA' },
  shell:      { bg: 'bg-[#89e05120]', text: 'text-[#89e051]', label: 'SH' }
};
