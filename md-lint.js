#!/usr/bin/env node
// PreToolUse hook：寫入 .md 前檢查省 token 規則，違規就擋下並說明要怎麼改。
// 只檢查這次要寫進去的內容，不掃既有檔案；「開頭摘要」只在 Write 長文件時檢查。
// 內容或既有檔案含 token-lint: off 時整份略過（給必須維持原格式的第三方文件用）。
'use strict';
const fs = require('fs');

const ok = () => process.exit(0);

let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  ok();
}

const ti = (payload && payload.tool_input) || {};
const fp = String(ti.file_path || '')
  .split(String.fromCharCode(92))
  .join('/');
if (!/\.(md|markdown)$/i.test(fp)) ok();
// 套件、外掛、記憶系統的檔案格式由別人規定，不檢查
if (/\/(node_modules|\.claude\/plugins|\.claude\/projects|\.claude\/plans)\//.test(fp)) ok();

const chunks = [];
const push = (v) => {
  if (typeof v === 'string' && v) chunks.push(v);
};
push(ti.content); // Write
push(ti.new_string); // Edit
if (Array.isArray(ti.edits)) ti.edits.forEach((e) => e && push(e.new_string));
if (!chunks.length) ok();

const OFF = 'token-lint: off';
if (chunks.some((c) => c.includes(OFF))) ok();
try {
  if (fs.readFileSync(fp, 'utf8').includes(OFF)) ok();
} catch {
  // 新檔案，沒有既有內容
}

const kind = (line) => {
  const s = line.trim();
  if (!s) return 'blank';
  if (/^(#{1,6}\s|[-*_]{3,}$|<)/.test(s)) return 'block';
  if (s.startsWith('|')) return 'table';
  if (/^([-*+]|\d+[.)])\s/.test(s)) return 'item';
  if (s.startsWith('>')) return 'quote';
  return 'text';
};

const wraps = [];
const tables = [];

const scan = (text) => {
  const lines = text.split(/\r?\n/);
  let i = 0;
  // 跳過 frontmatter
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) i = end + 1;
  }
  let fence = false;
  let prev = 'blank';
  let prevLine = '';
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      prev = 'block';
      continue;
    }
    if (fence) continue;
    const k = kind(line);
    const explicitBreak = / {2}$|\\$/.test(prevLine);
    const quoteText = (l) => l.trim().replace(/^>\s?/, '').trim();
    if (!explicitBreak) {
      if (k === 'text' && (prev === 'text' || prev === 'item' || prev === 'quote')) {
        wraps.push(i + 1);
      } else if (
        k === 'quote' &&
        prev === 'quote' &&
        quoteText(line) &&
        quoteText(prevLine) &&
        kind(quoteText(line)) === 'text'
      ) {
        wraps.push(i + 1);
      }
    }
    if (k === 'table') {
      const s = line.trim();
      const isSep = /^[\s|:-]+$/.test(s);
      if (/ {2,}/.test(s.replace(/^\|\s?|\s?\|$/g, '')) || (isSep && /-{4,}/.test(s))) {
        tables.push(i + 1);
      }
    }
    prev = k;
    prevLine = line;
  }
};
chunks.forEach(scan);

const hits = [];
const fmt = (arr) => arr.slice(0, 5).join('、') + (arr.length > 5 ? ` 等 ${arr.length} 處` : '');
if (wraps.length) {
  hits.push(
    `手動斷行（第 ${fmt(wraps)} 行）：同一段落請合成一行；若是各自獨立的條目就改成條列；真的要換行就在中間空一行`
  );
}
if (tables.length) {
  hits.push(`表格補空白（第 ${fmt(tables)} 行）：儲存格內外不要對齊補空白，分隔列用 |---| 即可`);
}

// 長文件開頭要有摘要，讓之後多數讀取只讀開頭就夠
if (typeof ti.content === 'string') {
  const lines = ti.content.split(/\r?\n/);
  if (lines.length > 80) {
    const head = lines.slice(0, 25).join('\n');
    if (!/摘要|重點|結論|TL;?DR|Summary/i.test(head)) {
      hits.push(`缺開頭摘要：超過 80 行的文件，前 25 行內要有「摘要」段落（5–10 行），寫出結論與各章重點`);
    }
  }
}

if (!hits.length) ok();

const reason = [
  '這次寫入的 .md 不符合省 token 規則，已擋下。請修正後重新寫入：',
  ...hits.map((h) => '  ・' + h),
  '',
  '（行號以這次寫入的內容起算。若這份檔案的格式由第三方規定、必須保留原樣，在檔案中加入 <!-- token-lint: off --> 即可略過，並告訴使用者。）',
].join('\n');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
    systemMessage: 'md 省 token 守門員：擋下一次寫入（' + hits.length + ' 項）',
  })
);
