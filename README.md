# md-lint

Claude Code 的 PreToolUse hook：寫入 `.md` 前檢查省 token 的格式規則，違規就擋下並說明怎麼改。

## 檢查項目
- 手動斷行：同一段落被拆成多行（一般文字接在文字、條列或引言之後）。行尾兩個空白或 `\` 的明確換行不算。
- 表格補空白：儲存格內外為了對齊補的連續空白，或分隔列用了 4 個以上的 `-`。
- 開頭摘要：用 Write 寫超過 80 行的文件時，前 25 行內要出現「摘要／重點／結論／TL;DR／Summary」。
- 程式碼區塊與 frontmatter 不檢查。

## 略過
- 這次寫入的內容或既有檔案含 `token-lint: off`（例如寫成 HTML 註解）時整份略過，給格式由第三方規定的檔案用。
- 路徑含 `node_modules`、`.claude/plugins`、`.claude/projects`、`.claude/plans` 的檔案不檢查。

## 安裝
1. 把 `md-lint.js` 放到 `~/.claude/hooks/`。
2. 在 `~/.claude/settings.json` 的 `hooks.PreToolUse` 加入：

```json
{
  "matcher": "Write|Edit|MultiEdit",
  "hooks": [
    {
      "type": "command",
      "command": "node ~/.claude/hooks/md-lint.js",
      "timeout": 10,
      "statusMessage": "檢查 md 省 token 規則"
    }
  ]
}
```

- 需要 Node.js。
- Windows 上 `~` 不一定會展開，`command` 請換成實際的絕對路徑。

## 已知限制
- 只檢查這次寫入的片段；擋下訊息的行號從片段起算，不是整份檔案的行號。
- 摘要只檢查關鍵字有沒有出現，不檢查內容。
