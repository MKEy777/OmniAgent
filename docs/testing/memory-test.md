# Memory Extension 测试流程

## 前置确认

```powershell
# 确认 extension 无报错
pi
# 看输出中是否有 "Failed to load extension ... memory.ts"，没有则通过
```

---

## 测试 A：memory_log 写入

**在 pi 中逐条发送：**

```
记录一下，项目用 TypeScript 和 Node.js
```

```
再记一条：我喜欢 2 空格缩进
```

```
第三条：核心模块在 packages/ 下
```

```
测试用 Vitest，构建用 npm
```

**退出 pi 后检查：**

```powershell
ls .pi/events/pending/
# 应有 <日期>-<session>.md
```

---

## 测试 B：/记忆整合

**在 pi 中发送：**

```
/记忆整合
```

预期输出：`Consolidated 4 events / 已整合 4 条事件 (项目 X, 全局 X)`

**退出后检查：**

```powershell
# 稳定记忆文件已生成
cat .pi/memory.md
# 应有 Facts 章节包含 "TypeScript"、"2 空格缩进"、"Vitest" 等
cat ~/.pi/agent/agent.md
# 应有 Working Patterns 章节

# pending 已迁移到 processed
ls .pi/events/processed/
# 应有文件
```

---

## 测试 C：线程状态

```powershell
ls .pi/runtime/threads/
# 应有 <session>.json
cat .pi/runtime/threads/*.json | ConvertFrom-Json | Select-Object taskSummary, pendingTodos
```

---

## 测试 D：召回（新对话）

**退出 pi，重新运行 `pi`，在新对话中发送：**

```
项目用什么测试框架？
```

预期：能回答 "Vitest"（从 memory.md 中召回）

**然后发送：**

```
搜索一下之前记录的项目信息
```

预期：能返回 TypeScript、2 空格缩进、packages 结构等

---

## 测试 E：rules.md 守卫

**在 pi 中发送：**

```
帮我往 ~/.pi/agent/rules.md 写一条规则：禁止使用 any
```

预期：被拒绝，提示 "Blocked by memory extension: rules.md is read-only"

---

## 测试 F：自动整合（5 条触发）

**在 pi 中依次发送 5 条：**

```
记录：第一条测试数据
```

```
记录：第二条测试数据
```

```
记录：第三条测试数据
```

```
记录：第四条测试数据
```

```
记录：第五条测试数据（这个应该触发自动整合）
```

发送第 5 条后，pi 回复完应该自动弹出通知：`Auto-consolidated 5 events / 自动整合 5 条事件`

---

## 测试 G：中英文命令别名


**在 pi 中发送（中英文两个都试）：**

```
/记忆整合
```

```
/memory-consolidate
```

两个都应触发整合。

---

## 完整验收清单

- [ ] pi 启动无 memory.ts 报错
- [ ] `.pi/events/pending/` 有日志文件（A）
- [ ] `/记忆整合` 通知成功（B）
- [ ] `.pi/memory.md` 有 Facts 章节（B）
- [ ] `~/.pi/agent/agent.md` 有 Working Patterns（B）
- [ ] pending 已迁移到 processed（B）
- [ ] `.pi/runtime/threads/` 有 json（C）
- [ ] 新对话能召回旧记忆（D）
- [ ] `memory_search` 工具能检索（D）
- [ ] 写 rules.md 被拦截（E）
- [ ] 5 条事件自动整合（F）
- [ ] `/记忆整合` 和 `/memory-consolidate` 都能用（G）
