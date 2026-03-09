// ── Simple Markdown to HTML Renderer ─────────────────────
// CSP制約のため外部ライブラリを使わず、最低限のMarkdown変換を実装
// 対応: 見出し(h1-h6), 太字, イタリック, コードブロック, インラインコード,
//       リスト(ul/ol), リンク, 水平線, 段落

function renderMarkdown(md) {
  if (!md) return '<p class="text-[#8b949e] text-xs">No content</p>';

  const lines = md.split('\n');
  let html = '';
  let inCodeBlock = false;
  let inList = false;
  let listType = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code block (```)
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        html += '</code></pre>';
        inCodeBlock = false;
      } else {
        if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
        html += '<pre class="bg-[#0d1117] border border-[#30363d] rounded-lg p-3 my-2 overflow-x-auto"><code class="text-xs text-[#c9d1d9]">';
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      html += _escapeHtml(line) + '\n';
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line.trim())) {
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      html += '<hr class="border-[#30363d] my-3">';
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      const level = headingMatch[1].length;
      const sizes = { 1: 'text-lg font-bold', 2: 'text-base font-bold', 3: 'text-sm font-bold', 4: 'text-sm font-semibold', 5: 'text-xs font-semibold', 6: 'text-xs font-medium' };
      html += `<h${level} class="${sizes[level]} text-white mt-3 mb-1">${_inlineMarkdown(headingMatch[2])}</h${level}>`;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) html += listType === 'ul' ? '</ul>' : '</ol>';
        html += '<ul class="list-disc list-inside my-1 space-y-0.5">';
        inList = true;
        listType = 'ul';
      }
      html += `<li class="text-sm text-[#c9d1d9]">${_inlineMarkdown(ulMatch[2])}</li>`;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) html += listType === 'ul' ? '</ul>' : '</ol>';
        html += '<ol class="list-decimal list-inside my-1 space-y-0.5">';
        inList = true;
        listType = 'ol';
      }
      html += `<li class="text-sm text-[#c9d1d9]">${_inlineMarkdown(olMatch[2])}</li>`;
      continue;
    }

    // Close list if no longer in list item
    if (inList && line.trim() === '') {
      html += listType === 'ul' ? '</ul>' : '</ol>';
      inList = false;
    }

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Paragraph
    html += `<p class="text-sm text-[#c9d1d9] my-1">${_inlineMarkdown(line)}</p>`;
  }

  if (inCodeBlock) html += '</code></pre>';
  if (inList) html += listType === 'ul' ? '</ul>' : '</ol>';

  return html;
}

function _inlineMarkdown(text) {
  text = _escapeHtml(text);
  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="text-white"><em>$1</em></strong>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code class="bg-[#0d1117] px-1.5 py-0.5 rounded text-xs text-[#f97583]">$1</code>');
  // Links [text](url) — only allow http/https
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline">$1</a>');
  return text;
}

function _escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
