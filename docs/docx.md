# 总览


[https://datawhalechina.github.io/deepagents-in-action/](https://datawhalechina.github.io/deepagents-in-action/)


| 层次 | 代表 | 核心价值 | 适用场景 |
| --- | --- | --- | --- |
| Runtime（底层） | LangGraph | 持久化执行、流式输出、人机协作、状态管理 | 需要精细控制的长期运行 Agent 和复杂工作流 |
| Framework（中间层） | LangChain | 模型抽象、工具接口、Agent 循环、中间件 | 快速上手、构建标准化的 Agent 应用 |
| Harness（上层） | Deep Agents | 预置工具、提示词、子 Agent、长期记忆 | 复杂多步骤任务、自主性较高的 Agent |



![Deep Agents 技术全景图：顶层 Deep Agents (Harness) 包含文件系统工具、任务规划、子 Agent、可插拔存储后端、长期记忆五大模块；中间层 LangChain (Framework) 和 LangGraph (Runtime)；底层 LangSmith 提供可观测性](https://datawhalechina.github.io/deepagents-in-action/imgs/04-framework-tech-panorama.png)


# 底层：Agent Runtime


**运行时层**


- 持久化执行（Durable Execution）：Agent 运行到一半崩溃了，能从断点恢复
- 流式输出（Streaming）：让用户实时看到 Agent 的思考和操作过程
- 人机协作（Human-in-the-Loop）：在关键操作前暂停，等待人工审批
- 状态管理（Persistence）：跨对话保存上下文


# 中间层：Agent Framework


**框架层**


**Agent Framework** 构建在 Runtime 之上，提供更高层次的开发体验：模型抽象、工具接口、Agent 循环、中间件（Middleware）等。


```python
from langchain import create_agent

agent = create_agent(
    model="",
    tools=[web_search, calculator],
    system_prompt="You are a helpful assistant."
)

```


# 上层：Agent Harness


工具层


| 能力 | 说明 |
| --- | --- |
| 虚拟文件系统 | read_file、write_file、edit_file、ls、glob、grep 六大文件操作工具 |
| 任务规划 | write_todos 工具，让 Agent 能把复杂任务拆解为可追踪的步骤 |
| 子 Agent 委派 | task 工具，让 Agent 能将子任务派发给专门的 Agent |
| 长期记忆 | 基于 LangGraph Memory Store，支持跨对话的持久化记忆 |



## 虚拟文件系统


### 核心设计哲学


**给 Agent 一个文件系统**，让 AI 像人类一样工作——按需读取、结构化存储、搜索定位，而不是把所有信息都塞进 prompt。


传统 Agent 开发的问题：所有信息（文件内容、搜索结果、中间计算）全部挤在一个不断膨胀的对话历史里。虚拟文件系统的解决思路是让 Agent 拥有类似人类的工作方式：


- 不会把所有资料同时打开铺在桌面上
- 把资料分门别类存放，需要时再取出来
- 用搜索快速定位需要的内容
- 在便签纸上记录中间结果


### 六大核心工具


| 工具 | 用途 | 类比 |
| --- | --- | --- |
| ls | 列出目录中的文件和元信息（大小、修改时间） | 打开文件夹看看有什么 |
| read_file | 读取文件内容，支持偏移量和限制条数；原生支持多模态格式（图片、视频、音频、PDF/PPT） | 翻开某份资料阅读 |
| write_file | 创建新文件 | 写一份新的备忘录 |
| edit_file | 对已有文件做精确字符串替换 | 用红笔修改文档 |
| glob | 按模式匹配查找文件（如 **/*.py） | 在文件柜中按标签找 |
| grep | 搜索文件内容，按字面量匹配；支持内容输出和计数 | 全文检索 |



### read_file：不只是"读文件"


**特性一：分片读取**——对于大文件，支持按偏移量和行数读取，避免一次性把整个文件塞进上下文：


```python
# 默认最多读取前 100 行
read_file("/workspace/report.md")

# 从第 100 行开始，读取 50 行
read_file("/workspace/report.md", offset=100, limit=50)

```


**特性二：原生多模态支持**——不只能读文本，原生支持多种多媒体格式，直接返回多模态内容块，让 Agent 能"看到"图片、"听到"音频、"读懂"文档：


| 类型 | 支持格式 |
| --- | --- |
| 图片 | .png .jpg .jpeg .gif .webp .heic .heif |
| 视频 | .mp4 .mpeg .mov .avi .flv .mpg .webm .wmv .3gpp |
| 音频 | .wav .mp3 .aiff .aac .ogg .flac |
| 文档 | .pdf .ppt .pptx |



这意味着 Agent 可以直接处理截图、录音、演示文稿——不再局限于纯文本工作流。


### grep：三种输出模式


`grep` 是 Agent 快速定位信息的利器，支持三种输出模式：


- files_with_matches：只返回匹配的文件路径（快速定位）
- content：返回匹配行及上下文（深入查看）
- count：返回匹配数量（概览统计）


```python
# 找到所有包含 "TODO" 的 Python 文件
grep("TODO", glob="**/*.py", output_mode="files_with_matches")

# 查看匹配内容
grep("def create_agent", output_mode="content")

```


### 上下文自动管理机制


虚拟文件系统最大的价值不在于"存文件"本身，而在于它与 Agent 的**上下文自动管理机制**紧密配合。


#### 大结果自动卸载


当工具调用的输入或输出超过阈值（如 20,000 tokens）时，系统会自动：


1. 将完整内容写入虚拟文件系统
2. 在对话历史中替换为文件路径引用 + 前 10 行预览
3. Agent 需要时可以按需读回


```python
# 原始结果：[50000 tokens 的搜索结果]

# 自动卸载后：
"结果已保存到 /workspace/search_results_001.md，
 前 10 行预览：
   1  # Search Results for 'LangGraph'
   2
   3  ## Result 1: Official Documentation
   4  ..."

```


这个机制是**完全自动的**——Agent 不需要手动管理，但可以随时通过 `read_file` 或 `grep` 重新访问完整内容。


#### 对话历史自动总结


当上下文大小达到模型窗口的 85% 时，如果没有更多可卸载的内容，系统会启动**自动总结**：


1. 用 LLM 生成对话的结构化摘要（意图、产出物、下一步）
2. 将完整的原始对话写入文件系统保存
3. 用摘要替换对话历史中的旧消息


这种"双保险"设计意味着：Agent 既有精炼的工作记忆（摘要），又能在需要时回溯细节（文件系统中的完整记录）。


![上下文自动管理两道防线：大结果自动卸载（>20K tokens）和对话历史自动总结（>85% 窗口），Agent 始终拥有精炼的工作记忆和可回溯的完整记录](https://datawhalechina.github.io/deepagents-in-action/imgs/08-flowchart-context-management.png)


### 可插拔的存储后端


虚拟文件系统是一个抽象概念。具体的文件存到哪里，由**后端（Backend）**决定。后端是**可插拔的**——可以根据场景选择不同的存储策略。


#### StateBackend（默认）：临时存储


文件存在 Agent 的临时状态中。特点：


- 同一个对话线程内持久化（多轮对话不丢失）
- 对话结束后丢失（换一个线程就没了）
- 主 Agent 和子 Agent 共享文件


适合场景：大多数情况下的默认选择，Agent 的"草稿纸"。


#### FilesystemBackend：本地磁盘


文件直接读写**本地文件系统**。特点：


- root_dir 指定 Agent 可访问的根目录
- virtual_mode=True 启用路径沙箱（阻止 ..、~ 及越界的绝对路径），强烈建议开启
- 文件修改是永久的、不可逆的


> ⚠️ 安全提示：Agent 可以读取 `root_dir` 下所有文件，包括 `.env`、密钥等敏感文件。Web 服务或 API 场景中切勿使用此后端，应改用沙箱后端。


#### LocalShellBackend：本地 Shell 执行


`LocalShellBackend` 是 `FilesystemBackend` 的扩展，在文件系统工具之外**额外提供 `execute` 工具**，可直接在宿主机运行 Shell 命令。特点：


- 命令通过 subprocess.run(shell=True) 执行，无任何沙箱隔离
- 支持 timeout（默认 120 秒）、max_output_bytes（默认 100,000）、env 等参数
- root_dir 作为命令的工作目录，但命令可访问系统上任意路径


> ⚠️ 极高风险：Agent 可执行任意 Shell 命令，包括删除文件、外传数据、消耗资源。**绝对不要在生产环境或多用户系统中使用。**


#### StoreBackend：跨会话持久化


文件存在持久化存储中。特点：


- 跨线程持久化——不同对话都能访问同一份文件
- namespace 参数控制数据隔离，按用户隔离防止数据混用


适合场景：长期记忆、跨会话的用户偏好、累积的知识库。


#### CompositeBackend：混合路由


最灵活的方案——**不同路径走不同后端**：


```python
backend = CompositeBackend(
    default=StateBackend(),            # 默认：临时存储
    routes={
        "/memories/": StoreBackend(...),  # 持久化，按用户隔离
    }
)

```


效果：


- Agent 写入 /workspace/plan.md → StateBackend（临时）
- Agent 写入 /memories/preferences.txt → StoreBackend（持久化）
- ls、glob、grep 自动聚合所有后端的结果


这种设计让 Agent 既有快速的"草稿纸"（State），又有持久的"记忆库"（Store），通过路径前缀自然隔离。


#### 沙箱后端：安全代码执行


当使用沙箱后端时，除了文件系统工具外，Agent 还会获得一个额外的 `execute` 工具，可以在隔离环境中执行 Shell 命令。适用于需要安全隔离的生产环境。


![五种存储后端对比：StateBackend（临时）→ FilesystemBackend（本地磁盘）→ StoreBackend（跨会话持久化）→ CompositeBackend（混合路由）→ 沙箱后端（安全执行），从临时到持久化的渐进选择](https://datawhalechina.github.io/deepagents-in-action/imgs/09-comparison-backends.png)


### 后端选择指南


| 场景 | 推荐后端 | 理由 |
| --- | --- | --- |
| 学习和实验 | StateBackend（默认） | 零配置，自动清理 |
| 本地编程助手 | FilesystemBackend | 直接操作项目文件 |
| 需要跨会话记忆 | CompositeBackend | 混合临时 + 持久化 |
| 需要执行代码 | 沙箱后端 | 安全隔离 |
| 生产部署 | StoreBackend 或 CompositeBackend | 持久化 + 可伸缩 |



### 自定义后端与安全策略


#### 声明式权限：FilesystemPermission


最简单的路径访问控制方式：


```python
permissions=[
    FilesystemPermission(
        operations=["write"],
        paths=["/policies/**"],
        mode="deny",           # 禁止写入 /policies/ 下的任何文件
    ),
]

```


权限规则在工具调用前按声明顺序求值，采用 first-match-wins：第一个同时匹配 `operations` 和 `paths` 的规则决定结果；如果没有规则匹配，则默认允许。


#### 实现自定义后端


如果内置后端不满足需求（如接入 S3 或 Postgres），可以实现 `BackendProtocol` 接口，需要实现 6 个方法：`ls`、`read`、`write`、`edit`、`grep`、`glob`。


#### 安全策略：PolicyWrapper


对于需要拦截策略（速率限制、审计日志、内容检查）的场景，可以通过继承或包装后端实现。`PolicyWrapper` 是通用包装器，适用于任何后端。


### 小结


虚拟文件系统的核心价值：


1. 设计哲学：让 Agent 像人一样工作——按需读取、结构化存储、搜索定位，而不是把所有信息塞进 prompt
2. 六大工具：ls、read_file、write_file、edit_file、glob、grep，覆盖了文件操作的完整生命周期
3. 自动上下文管理：大结果自动卸载（>20K tokens → 文件 + 引用）、对话历史自动总结（>85% 窗口 → 摘要 + 完整记录保存到文件）
4. 可插拔后端：StateBackend（临时）、FilesystemBackend（本地磁盘）、LocalShellBackend（本地 Shell）、StoreBackend（持久化）、CompositeBackend（混合路由）、沙箱后端（安全执行）
5. 权限控制：FilesystemPermission 声明式权限；GuardedBackend 或 PolicyWrapper 实现定制策略


## 任务规划和分解


### 为什么 Agent 需要"规划"能力


对于简单任务，Agent 可以一步到位。但对于复杂任务，一步到位是不可能的——涉及搜索多个信息源、阅读和整理大量资料、对比分析、组织结构、撰写报告。没有规划，Agent 会出现：


- 遗漏关键步骤：直接开始写报告，忘了先搜索竞品信息
- 重复劳动：搜索了同一个关键词三次，因为它"忘记"已经搜过了
- 半途而废：上下文太长后，Agent 失去了对整体进度的把控
- 质量不稳定：有时做得很好，有时莫名跳过重要环节


规划能力让 Agent 能够**先思考再行动**——把大任务拆解为小步骤，然后逐步执行、追踪进度、动态调整。


### 任务的数据结构


每个任务是一个简单的结构化对象：


```json
{
    "content": "搜索 LangGraph 官方文档，整理核心架构和 API 设计",
    "status": "pending"
}

```


### 三种状态与流转


| 状态 | 含义 | 典型场景 |
| --- | --- | --- |
| pending | 待办 | 刚规划出来，还没开始做 |
| in_progress | 进行中 | 正在执行这个步骤 |
| completed | 已完成 | 确认做完了 |



状态流转：`pending` → `in_progress` → `completed`


### Agent 如何使用任务规划


当 Agent 收到一个复杂任务时，其典型行为分三步：


**第一步：制定计划**——把大任务拆解为可追踪的小步骤，全部设为 `pending`：


```
1. [pending] 搜索官方文档和核心概念
2. [pending] 搜索三个竞品
3. [pending] 对比分析各产品的优劣势
4. [pending] 撰写报告大纲
5. [pending] 撰写完整报告

```


**第二步：逐步执行**——逐个更新状态并调用工具：


```
更新任务 1 为 in_progress → 调用搜索工具 → 保存结果到文件 → 更新任务 1 为 completed
更新任务 2 为 in_progress → 调用搜索工具 → ...

```


**第三步：动态调整**——执行过程中可能发现需要额外步骤，及时补充：


```
1. [completed] 搜索官方文档和核心概念
2. [in_progress] 搜索三个竞品
3. [pending] 对比分析各产品的优劣势
4. [pending] 撰写报告大纲
5. [pending] 撰写完整报告
6. [pending] 补充新发现的资料 ← 新增

```


### 任务清单的持久化


任务清单持久化在 Agent 的状态中：


- 在同一个对话中，任务清单不会丢失
- 即使 Agent 的对话历史被总结压缩，任务清单依然完整
- 子 Agent 无法访问主 Agent 的任务清单（上下文隔离）


### 任务规划与上下文管理的协同


在长时间运行的任务中，任务规划和上下文管理需要**协同工作**。假设 Agent 正在执行一个包含 10 个步骤的任务，执行到第 6 步时：


1. 大结果卸载：前面步骤产生的大量搜索结果已经被卸载到文件系统
2. 对话总结：如果上下文超过触发阈值，旧的对话会被总结压缩


关键点在于：**即使对话历史被总结压缩了，任务清单依然完整**。这意味着 Agent 在总结后仍然知道：


- 总共有哪些步骤
- 哪些已经完成，哪些还在进行
- 下一步该做什么


任务清单充当了 Agent 的"北极星"——无论中间过程如何压缩，Agent 始终不会迷失方向。


### 中间件机制


任务规划能力的底层实现是**中间件（Middleware）**——Agent 能力的插件机制。核心要点：


- 常驻层（始终启用）：TodoListMiddleware（任务规划）、FilesystemMiddleware（文件工具+权限）、SummarizationMiddleware（上下文压缩）
- 条件层（按参数激活）：SubAgentMiddleware（子 Agent 委派）、SkillsMiddleware（技能包）、MemoryMiddleware（记忆注入）、HumanInTheLoopMiddleware（人工审批）
- 用户自定义层（middleware=[] 按需叠加）：安全（PII 脱敏）、弹性（重试/降级）、限制（调用次数）、上下文（清理旧结果）


理解中间件机制，就能看懂 Agent 内部是怎么拼装出来的，也能自己按需添加新能力。


### 小结


任务规划的核心价值：


1. 为什么需要规划：复杂任务需要先拆解再执行，否则 Agent 会遗漏步骤、重复劳动、半途而废
2. 任务状态：pending → in_progress → completed 三种状态，持久化在 Agent State 中
3. 与上下文协同：任务清单是 Agent 的"北极星"，即使对话被总结压缩，任务清单依然完整
4. 中间件机制：任务规划的真身是 TodoListMiddleware，上下文压缩的真身是 SummarizationMiddleware——理解底层，才能自由扩展


### 中间件设计详解


#### TodoListMiddleware：任务规划的真身


`write_todos` 工具在 Agent 框架中是自动内置的。它的底层实现就是 `TodoListMiddleware`。如果使用更底层的 `create_agent()`，可以手动添加这个能力：


```python
from langchain.agents import create_agent
from langchain.agents.middleware import TodoListMiddleware

agent = create_agent(
    model=model,
    tools=[...],
    middleware=[
        TodoListMiddleware(),
        FilesystemMiddleware(),   # 自动注入 read_file / write_file 等文件工具
    ],
)

```


添加 `TodoListMiddleware` 后，Agent 会自动获得：


- `write_todos` 工具：创建和管理任务清单
- 规划指导提示词：自动注入到系统提示词中，引导 Agent 在面对复杂任务时先规划再执行


**自定义配置**：`TodoListMiddleware` 支持两个可选参数：


```python
TodoListMiddleware(
    system_prompt="...",      # 自定义规划指导提示词
    tool_description="...",   # 自定义 write_todos 工具的描述
)

```


大多数情况下，默认配置就够了。只有当你发现 Agent 的规划行为需要特别引导时（比如"总是先写测试再写代码"），才需要自定义 `system_prompt`。


> 注意：`create_agent()` 和 `create_deep_agent()` 的区别在于——前者需要你**手动选择和组合**中间件，后者帮你**预设好了一套最佳组合**。


#### SummarizationMiddleware：上下文压缩的真身


第 3 章讲的"对话历史自动总结"，底层就是 `SummarizationMiddleware`。它和 `TodoListMiddleware` 一样，也是预构建中间件之一。


```python
from langchain.agents import create_agent
from langchain.agents.middleware import TodoListMiddleware
from deepagents.middleware import FilesystemMiddleware, SummarizationMiddleware

agent = create_agent(
    model=model,
    tools=[internet_search],
    middleware=[
        TodoListMiddleware(),
        FilesystemMiddleware(),   # read_file / write_file 通过中间件注入
        SummarizationMiddleware(
            model="...",           # 总结压缩影响后续推理质量，建议用 SOTA 模型
            trigger=("tokens", 4000),  # 可自定义：("ratio", 0.85) 或 ("tokens", N)
            keep=("messages", 20),
        ),
    ],
)

```


关键参数：


- trigger：触发阈值，支持两种模式——("ratio", 0.85) 按窗口比例触发，("tokens", N) 按绝对 token 数触发
- keep：保留最近多少条消息不被压缩，保证 Agent 有足够的近期上下文


#### 手动组合：任务规划 + 上下文管理


理解了中间件机制后，就能看懂 Agent 框架内部是怎么组装的。下面用 `create_agent()` 手动组合了任务规划和上下文总结两个能力——这基本就是 `create_deep_agent()` 内部做的事情的核心部分：


```python
from langchain.agents import create_agent
from langchain.agents.middleware import TodoListMiddleware
from deepagents.middleware import FilesystemMiddleware, SummarizationMiddleware

agent = create_agent(
    model=model,
    tools=[internet_search],
    middleware=[
        TodoListMiddleware(),
        FilesystemMiddleware(),   # read_file / write_file 通过中间件注入
        SummarizationMiddleware(
            model="...",  # 总结压缩影响后续推理质量，建议用 SOTA 模型
            trigger=("tokens", 4000),  # 可自定义
            keep=("messages", 20),
        ),
    ],
)

```


在 `create_deep_agent()` 中，这两个能力都是自动内置的，不需要手动组合。


#### 代码实战：完整示例


让 Agent 自主规划并执行一个多步骤研究任务：


```python
from langchain_openai import ChatOpenAI
from tavily import TavilyClient
from deepagents import create_deep_agent

model = ChatOpenAI(
    model="...",
    api_key=os.environ["API_KEY"],
    base_url="...",
)

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def internet_search(query: str, max_results: int = 5) -> dict:
    """搜索互联网获取最新信息。"""
    return tavily_client.search(query, max_results=max_results)

agent = create_deep_agent(
    model=model,
    tools=[internet_search],
    system_prompt="""你是一位专业的技术研究员。
面对复杂研究任务时，你会：
1. 先用 write_todos 制定研究计划
2. 逐步执行每个步骤，及时更新进度
3. 将搜索结果写入文件系统整理
4. 最终输出完整的研究报告
""",
)

result = agent.invoke({
    "messages": [{
        "role": "user",
        "content": "请调研 Agent 开发领域的三大 Harness 框架，对比它们的核心能力差异，写一份简要分析报告。"
    }]
})

print(result["messages"][-1].content)

```


在这个例子中，Agent 会自动：


1. 调用 write_todos 制定研究计划（搜索→对比→写报告）
2. 逐步执行每个任务，更新状态
3. 用 write_file 保存中间搜索结果到虚拟文件系统
4. 最终综合所有信息输出报告


### 中间件全景：Agent 的能力版图


![alt text](image.png)


> `FilesystemMiddleware` 和 `SubAgentMiddleware` 是**不可排除的必要中间件**——它们支撑了 Agent 框架的核心功能（文件工具、权限控制、子 Agent 委派），框架会主动阻止将它们从堆栈中移除。其余中间件可以通过 `middleware` 参数按需叠加——**你可以像拼积木一样，给 Agent 添加任何你需要的能力**。


## 子 Agent 与上下文隔离


### 为什么需要子 Agent


#### 上下文膨胀问题


假设主 Agent 要完成一个研究报告，其中一个子任务是"搜索技术文档"。这个子任务可能涉及：


- 5 次网络搜索调用
- 每次返回 3000+ tokens 的搜索结果
- 多次写文件保存中间结果
- 多次读文件回顾和整理


这些中间过程产生大量工具调用记录，全部堆在主 Agent 的上下文里。虽然自动卸载机制能缓解一部分，但主 Agent 其实**根本不需要知道这些细节**——它只需要最终的研究摘要。


#### Context Quarantine（上下文隔离）


这就是子 Agent 的核心设计动机：**Context Quarantine（上下文隔离）**。


工作方式：


1. 主 Agent 通过 task 工具创建一个子 Agent
2. 子 Agent 在独立的上下文中执行任务（自己的工具调用、文件操作都不会回到主 Agent）
3. 子 Agent 完成后，只把最终结果返回给主 Agent
4. 主 Agent 的上下文保持干净


打个比方：主 Agent 是项目经理，子 Agent 是专项负责人。项目经理不需要参加每一个技术讨论会——他只需要看到每个负责人提交的总结报告。


#### 什么时候用子 Agent


| 场景 | 是否用子 Agent | 理由 |
| --- | --- | --- |
| 需要多次搜索和整理的研究任务 | ✅ | 大量中间结果会膨胀主 Agent 上下文 |
| 需要特殊工具或指令的专业任务 | ✅ | 子 Agent 可以有自己的工具集和系统提示词 |
| 需要不同模型能力的任务 | ✅ | 子 Agent 可以用不同的模型 |
| 需要高层协调的复杂任务 | ✅ | 主 Agent 专注协调，子 Agent 专注执行 |
| 单步简单查询 | ❌ | 委派开销大于收益 |
| 需要保留中间上下文的任务 | ❌ | 子 Agent 的上下文不回传给主 Agent |



### 定义子 Agent


子 Agent 通过结构化配置定义，核心字段：


| 字段 | 必填 | 继承主 Agent？ | 说明 |
| --- | --- | --- | --- |
| name | ✅ | — | 唯一标识符，主 Agent 通过它指定委派给谁 |
| description | ✅ | — | 描述子 Agent 的能力，主 Agent 靠它决策路由 |
| system_prompt | ✅ | ❌ 不继承 | 子 Agent 自己的指令，需独立定义 |
| tools | 可选 | ✅ 默认继承，指定后完全替换 | 子 Agent 工具集；不指定则继承主 Agent 的所有工具 |
| model | 可选 | ✅ 默认继承 | 可指定不同模型 |
| middleware | 可选 | ❌ 不继承 | 子 Agent 自己的中间件 |
| response_format | 可选 | ❌ 不继承 | 结构化输出 schema，设置后主 Agent 收到 JSON 而非自由文本 |



关键点：**子 Agent 的 `system_prompt` 不继承主 Agent**——每个子 Agent 应有自己专属的指令。`tools` 默认继承主 Agent 的工具集，但一旦显式指定就会完全替换（不是合并）。


### General-purpose 子 Agent：默认的"万能助手"


即使不定义任何子 Agent，系统也自带一个 **general-purpose 子 Agent**。它是唯一的例外——**继承主 Agent 的 system_prompt、tools、model 和 skills**。


General-purpose 子 Agent 的作用是**纯粹的上下文隔离**——它和主 Agent 有相同的能力，但在独立的上下文中工作。主 Agent 不需要承受子任务中 10 次搜索带来的上下文膨胀，只需要收到一份精炼的摘要。


可以通过配置禁用或覆盖它：


```python
# 覆盖默认子 Agent（指定不同模型或工具）
subagents = [
    {
        "name": "general-purpose",  # 覆盖默认
        "description": "通用助手，处理各种委派任务",
        "system_prompt": "你是一个通用助手。",
        "tools": [internet_search],
        "model": "..."  # 子 Agent 用更强的模型
    },
]

# 禁用子 Agent 机制
agent = create_agent(
    subagents=[],  # 不传任何子 Agent
    general_purpose_subagent_enabled=False
)

```


### CompiledSubAgent：集成预构建工作流


对于更复杂的场景，可以用一个预构建的工作流图作为子 Agent。这适用于需要**多步骤、有分支逻辑**的工作流：


```python
# 创建一个自定义工作流图
custom_graph = create_agent(
    model=model,
    tools=[statistical_analysis, generate_chart],
    system_prompt="你是数据分析专家，擅长统计分析和可视化。",
)

# 包装为 CompiledSubAgent
data_subagent = CompiledSubAgent(
    name="data-analyzer",
    description="执行复杂的数据分析任务，包括统计分析和图表生成",
    runnable=custom_graph,  # 传入编译好的工作流图
)

agent = create_agent(
    model=model,
    subagents=[data_subagent],
)

```


**字典 vs CompiledSubAgent 怎么选**：


| 场景 | 推荐方式 | 理由 |
| --- | --- | --- |
| 大多数情况 | 字典方式 | 简单直观，配置灵活 |
| 需要复杂的多步骤工作流 | CompiledSubAgent | 可用工作流图 API 定义分支、循环 |
| 已有现成的工作流图 | CompiledSubAgent | 直接复用，无需重写 |



### 多子 Agent 协作模式


实际项目中，最常见的模式是**多个专业子 Agent 协作**，由主 Agent 作为协调者：


```python
subagents = [
    {
        "name": "data-collector",
        "description": "从多个来源收集原始数据，包括网络搜索和 API 调用",
        "system_prompt": "你是数据收集专家。搜索并整理相关数据，返回结构化的数据摘要。",
        "tools": [internet_search, api_call],
    },
    {
        "name": "data-analyzer",
        "description": "对收集到的数据进行统计分析，提取关键洞察",
        "system_prompt": "你是数据分析专家。分析数据并提取 3-5 个关键发现，控制在 300 字以内。",
        "tools": [statistical_analysis],
    },
    {
        "name": "report-writer",
        "description": "根据分析结果撰写专业报告",
        "system_prompt": "你是技术写作专家。根据提供的分析结果撰写清晰、专业的报告。",
        "tools": [format_document],
    },
]

agent = create_agent(
    model=model,
    system_prompt="""你是一位项目协调者。面对复杂任务时：
1. 先用 write_todos 制定计划
2. 将数据收集委派给 data-collector
3. 将分析工作委派给 data-analyzer
4. 将报告撰写委派给 report-writer
5. 整合各子 Agent 的输出，形成最终结果""",
    subagents=subagents,
)

```


执行流程：


1. 主 Agent 制定计划（write_todos）
2. task(name="data-collector", task="搜索最新趋势") → 返回数据摘要
3. task(name="data-analyzer", task="分析以下数据...") → 返回关键发现
4. task(name="report-writer", task="根据以下发现撰写报告...") → 返回报告
5. 主 Agent 整合输出


每一步的子 Agent 都在独立上下文中工作，主 Agent 只看到精炼的返回结果。


### 结构化输出：让子 Agent 返回 JSON


默认情况下，主 Agent 收到的是子 Agent 最后一条消息的自由文本。通过 `response_format` 字段，可以让子 Agent 返回符合 schema 的 JSON，方便主 Agent 程序化处理：


```python
class ResearchFindings(BaseModel):
    summary: str = Field(description="研究摘要")
    confidence: float = Field(description="置信度 0-1")
    sources: list[str] = Field(description="信息来源 URL 列表")

research_subagent = {
    "name": "researcher",
    "description": "研究特定主题并返回结构化发现",
    "system_prompt": "深入研究给定主题，返回你的发现。",
    "tools": [internet_search],
    "response_format": ResearchFindings,  # 结构化输出
}
# 主 Agent 收到: '{"summary": "...", "confidence": 0.87, "sources": [...]}'

```


不设置 `response_format` 时主 Agent 收到自由文本；设置后主 Agent 始终收到符合 schema 的有效 JSON。


### 子 Agent 最佳实践


#### 1. 描述要具体


主 Agent 靠 `description` 决定何时以及委派给谁。描述越具体，路由越准确：


```python
# ✅ 好的描述
"description": "执行深度网络研究，需要多次搜索、信息交叉验证和综合分析时使用"

# ❌ 差的描述
"description": "做研究"

```


#### 2. System Prompt 要详细


特别是要包含**输出格式要求**和**字数限制**——这直接影响返回给主 Agent 的内容质量：


```python
"system_prompt": """你是一位研究员。

工具使用指导：
- 用 internet_search 搜索信息，每次查询不同的关键词
- 搜索 3-5 次以获取全面的信息

输出格式：
- 摘要（2-3 段）
- 关键发现（要点列表）
- 信息来源（附 URL）

重要：返回结果控制在 500 字以内。"""

```


#### 3. 工具集要精简


最小权限原则——只给子 Agent 它需要的工具：


```python
# ✅ 精简：只给研究相关的工具
research_agent = {"tools": [internet_search]}

# ❌ 冗余：给了不需要的工具
research_agent = {"tools": [internet_search, send_email, delete_file, execute_code]}

```


#### 4. 不同子 Agent 用不同模型


根据任务特点选择合适的模型：


```python
subagents = [
    {
        "name": "quick-lookup",
        "description": "快速查询简单事实",
        "tools": [internet_search],
        "model": "轻量快速模型",
        "system_prompt": "快速查找并返回简洁答案。",
    },
    {
        "name": "deep-analyst",
        "description": "执行需要深入推理的复杂分析任务",
        "tools": [internet_search, statistical_analysis],
        "model": "强推理模型",
        "system_prompt": "深入分析并提供详细的推理过程。",
    },
]

```


#### 5. 返回结果要精炼


在 system_prompt 中明确要求子 Agent 只返回核心内容：


```python
"system_prompt": """分析数据并返回：
1. 关键洞察（3-5 条）
2. 置信度评分
3. 建议下一步行动

不要包含：原始数据、中间计算过程、详细的工具输出。
控制在 300 字以内。"""

```


这一点至关重要——如果子 Agent 把大量原始数据返回给主 Agent，就失去了上下文隔离的意义。


### 常见问题排查


| 问题 | 原因 | 解法 |
| --- | --- | --- |
| 子 Agent 没被调用 | 主 Agent 无法从 description 判断何时委派 | 让 description 更具体、更行为导向；在主 Agent 的 system_prompt 中明确指示委派 |
| 上下文依然膨胀 | 子 Agent 返回了大量原始数据 | 在子 Agent 的 system_prompt 中强制要求简洁返回；让子 Agent 把大量数据写入文件，只返回分析摘要 |
| 调用了错误的子 Agent | 多个子 Agent 的 description 过于相似 | 在 description 中明确区分各子 Agent 的使用场景 |



### 小结


子 Agent 机制的核心价值：


1. 核心动机：Context Quarantine（上下文隔离）——子 Agent 在独立上下文中工作，只返回精炼结果给主 Agent
2. 定义方式：必填字段 name + description + system_prompt；tools 默认继承，显式指定后完全替换
3. General-purpose 子 Agent：默认可用，继承主 Agent 全部能力；可禁用或覆盖
4. CompiledSubAgent：用预构建工作流图作为子 Agent，适合复杂多步骤场景
5. 结构化输出：通过 response_format 让子 Agent 返回 JSON，方便主 Agent 程序化处理
6. 最佳实践：描述要具体、提示词要详细、工具集要精简、模型按需选择、返回结果要精炼


## 异步子 Agent 与并行协同


### 同步子 Agent 的瓶颈


回顾同步子 Agent 的协作模式：


```python
# 主 Agent 调用同步子 Agent
result = task(name="researcher", task="深入调研某个技术生态")
# 此时主 Agent 在等待——可能要等 60 秒、120 秒，甚至更久
# 用户只能盯着对话框转圈

```


同步子 Agent 在两类场景下会让用户体验非常糟糕：


1. 长程任务：如深度调研、大规模代码迁移、批量数据处理，子 Agent 工作时间从分钟级到小时级
2. 可交互任务：用户在子 Agent 跑到一半时，发现需要补充约束（"换个数据源再来一次"、"加上 2024 年的数据"），但同步模式下根本插不进去


更糟的是——同步子 Agent 在被主 Agent `task()` 调用期间，**主 Agent 自己也被阻塞**。这意味着：在子 Agent 完成之前，用户无法和主 Agent 继续聊别的话题。


异步子 Agent 解决的就是这两件事：**不阻塞主线对话**，**支持中途控制**。


### 同步 vs 异步：六个维度的对比


| 维度 | 同步子 Agent | 异步子 Agent |
| --- | --- | --- |
| 执行模型 | 阻塞——主 Agent 等到完成才能继续 | 非阻塞——立即返回任务 ID |
| 并发性 | 可并行触发，但主 Agent 仍被整批阻塞 | 完全并行，主 Agent 全程不阻塞 |
| 中途追加指令 | ❌ 不支持 | ✅ 注入新指令 |
| 取消 | ❌ 不支持 | ✅ 请求取消任务 |
| 状态性 | 无状态——每次调用相互独立 | 有状态——子 Agent 拥有自己的线程，会话历史持续累积 |
| 典型场景 | 一问一答、毫秒级到秒级的快速委派 | 几分钟以上的研究、编码、迁移等长程任务 |



简单的判定法则：**子任务能在 5 秒内完成**，用同步；**子任务可能跑数分钟以上、且过程需要可交互**，上异步。


### 主 Agent 的 5 把"遥控器"


声明异步子 Agent 后，系统自动给主 Agent 注入 5 个工具——把它们当成主 Agent 操控后台子任务的"遥控器"：


| 工具 | 作用 | 返回 |
| --- | --- | --- |
| start_async_task | 启动一个新的后台任务 | 任务 ID（立即返回） |
| check_async_task | 查询任务当前状态与结果 | 状态 + 结果（若完成） |
| update_async_task | 给运行中的任务追加新指令 | 确认 + 更新后状态 |
| cancel_async_task | 终止运行中的任务 | 确认信息 |
| list_async_tasks | 列出所有任务（含实时状态） | 任务总览 |



主 Agent 像调用普通工具一样调用它们，中间件负责处理远程线程的创建、运行管理与状态持久化。


### 一次完整生命周期


把这 5 个工具串起来，就是一段标准对话：


```
用户：帮我深入调研一下某个技术架构。
主 Agent → start_async_task(description="调研技术架构", subagent_type="researcher")
           → 返回 task_id: abc-123
主 Agent ← "已经派 researcher 在后台开干，任务 ID：abc-123，
            你可以继续问别的，也可以随时让我查进度。"

用户：先帮我把这段代码格式化一下。
主 Agent ← （直接处理，researcher 仍在后台跑）

用户：刚才那个调研有进展吗？
主 Agent → check_async_task("abc-123")
           ← status: running
主 Agent ← "还在跑，已经搜了 4 个关键词，预计还要几分钟。"

用户：补一下：重点关注 supervisor / network / hierarchical 这三种拓扑。
主 Agent → update_async_task("abc-123", "重点关注三种拓扑：supervisor / network / hierarchical")
           ← 已注入新指令

用户：算了，先停一下。
主 Agent → cancel_async_task("abc-123")
           ← cancelled

```


### 5 个工具底层做了什么


理解每个工具的实际行为：


- `start_async_task`（launch）：在后台服务上新建一个线程、启动一次运行，把任务描述作为输入；返回线程 ID 作为任务 ID。主 Agent 拿到 ID 就回到对话循环，不会轮询等待。
- `check_async_task`（check）：读取运行的当前状态。若已完成，再读线程状态拿到子 Agent 的最终输出；若仍在跑，直接告诉用户"运行中"。
- `update_async_task`（update）：在同一线程上以中断策略发起一次新运行——前一次运行被打断，子 Agent 带着完整对话历史 + 新指令重新启动。任务 ID 保持不变。
- `cancel_async_task`（cancel）：调用取消接口终止远程运行，并把本地任务标记为"已取消"。
- `list_async_tasks`（list）：遍历所有跟踪中的任务。已结束的从缓存返回；未结束的并发向服务端拉取实时状态。


### 任务元数据为何要单开一个通道


主 Agent 的状态中专门有一个 `async_tasks` 通道，独立于消息历史，存放每个任务的：task ID、子 Agent 名、线程 ID、运行 ID、状态、创建时间、最后检查时间、最后更新时间。


为什么不直接放在工具消息里？因为上下文一旦逼近上限会**自动压缩对话历史**。如果任务 ID 只活在某条 ToolMessage 里，压缩后就丢了——主 Agent 会瞬间"忘了"自己派出去的所有任务，再也无法 check 或 cancel。


把元数据搬到独立通道之后：消息历史可以放心被压缩、被裁剪，主 Agent 永远能通过 `list_async_tasks` 找回**自己派过的所有任务**。


> 这是 Agent 设计的一贯哲学：**会被截断的放消息历史，必须长存的进状态通道**——和虚拟文件系统、任务清单是同一套思路。


### 两种传输模式


#### 进程内传输（同部署，推荐起手式）


不指定远程地址时，走**进程内传输**——调用直接进程内函数路由，不走网络。所有子 Agent 注册到同一个部署配置中。


优势：


- 零网络延迟：调用即函数调用
- 零额外鉴权配置：本地进程互信
- 子 Agent 仍跑在独立线程上，状态隔离不打折


绝大多数项目从这里起步就够了。


#### HTTP 传输（远程，按需切换）


加上远程地址字段就切换到 **HTTP 传输**，调用走网络发到远程服务：


```python
AsyncSubAgent(
    name="researcher",
    description="Research Agent",
    graph_id="researcher",
    url="https://my-research-deployment.example.com",  # 远程 HTTP 传输
)

```


**什么时候用 HTTP？**


- 子 Agent 需要独立扩缩容
- 子 Agent 要不一样的资源画像（GPU / 大内存）
- 子 Agent 由另一个团队维护、独立发布


### 三种部署拓扑


| 拓扑 | 形态 | 推荐场景 |
| --- | --- | --- |
| 单部署 | 所有 Agent 同部署，全部用进程内传输 | 绝大多数项目的起点：一台服务好运维、零网络延迟 |
| 拆分部署 | 主 Agent 一台，子 Agent 一台，全用 HTTP | 子 Agent 资源画像或扩缩容策略与主 Agent 显著不同 |
| 混合 | 一部分子 Agent 走进程内，另一部分走 HTTP | 大多数子 Agent 同部署省事，少数特殊子 Agent 单独扩 |



**起手式建议**：先用单部署 + 进程内传输，等遇到具体的扩缩容/团队边界问题再拆。


### 最佳实践


#### 1. 本地开发要把 Worker Pool 调大


每个活跃的运行会占用一个 Worker 槽位。一个主 Agent 同时跑 3 个子 Agent，至少需要 4 个槽位（1 主 + 3 子）。槽位不够时，新启动的任务会**排队**。常见表现包括：`start_async_task` 长时间不返回，或虽然拿到了任务 ID，但后续 `check_async_task` 长时间看不到实质进展。


#### 2. 描述要具体，行为导向


主 Agent 靠 `description` 决定派给谁：


```python
# ✅ 好
AsyncSubAgent(
    name="researcher",
    description="深度网络调研，需要多次搜索 + 信息综合时使用",
)

# ❌ 差
AsyncSubAgent(
    name="helper",
    description="帮你处理事情",
)

```


#### 3. 用 Thread ID 串联追踪


每次异步子 Agent 运行都是一次普通的运行，在追踪系统中完整可见。主 Agent 的 trace 会显示 launch / check / update / cancel / list 这些工具调用；每个子 Agent 的运行是另一条 trace，**通过 thread ID（也就是 task ID）就能把两边对上**。出问题时这条线索极其重要。


### 常见问题排查


| 问题 | 症状 | 解法 |
| --- | --- | --- |
| 刚启动就立刻轮询状态 | 主 Agent 调完 start_async_task 立刻又调 check_async_task，循环往复 | 在 system_prompt 里强化：派出异步子 Agent 之后，必须立刻把控制权交还给用户 |
| 报告了一个过时的状态 | 用户问进度，主 Agent 直接引用对话历史里某个旧状态 | 回答任务进度前，必须先调用 check_async_task 或 list_async_tasks |
| 任务 ID 被截断或改写 | 模型把完整 ID 缩写成短 ID | 始终使用完整的 task_id，不要截断、不要缩写、不要改写 |
| 启动子 Agent 长时间不返回 | start_async_task 卡住，迟迟拿不到任务 ID | worker pool 被打满，增大 worker 槽位 |
| 调用了错误的子 Agent | 多个子 Agent 的 description 过于相似 | 在 description 中明确区分各子 Agent 的使用场景 |
| 上下文依然膨胀 | 子 Agent 返回了大量原始数据 | 在子 Agent 的 system_prompt 中强制要求简洁返回 |



### 小结


异步子 Agent 的核心价值：


1. 核心动机：突破同步子 Agent 的两个瓶颈——主 Agent 不再被阻塞，任务可以中途追加指令或取消
2. 5 把遥控器：start / check / update / cancel / list，主 Agent 像调普通工具一样用它们操控后台子任务
3. 状态独立通道：任务元数据存在独立通道中，与消息历史解耦——即便上下文被压缩，任务 ID 永不丢失
4. 两种传输：默认进程内（同部署、零延迟），按需切换 HTTP（远程、可独立扩缩容）
5. 三种拓扑：单部署 / 拆分部署 / 混合，起手用单部署，按工程需要再拆
6. 避坑要点：worker pool 要足够、描述要具体、永远基于实时 check 而非对话历史报告状态


## Skills — 可复用的 Agent 能力包


> 工具（Tools）是原子操作——搜索一次、读一个文件、调一次 API。但有些能力需要的不是一次操作，而是**多步骤工作流 + 领域知识 + 模板资源**的组合。比如"按照团队规范做代码审查"、"查阅 LangGraph 最新文档并据此回答"、"生成符合公司格式的技术报告"——这些需要的不是一个工具，而是一整套流程指导。这就是 Skills 要解决的问题。


### Skills 是什么？


一个 Skill 就是一个目录，核心是一个 `SKILL.md` 文件，加上可选的脚本、参考文档和模板资源。Skills 遵循开放的 [Agent Skills 规范](https://agentskills.io/specification)，这不是 Deep Agents 的私有概念，而是一个已被广泛采纳的行业标准。


#### 规范定义的目录结构


```
skills/
└── langgraph-docs/
    ├── SKILL.md              # Required: metadata + instructions
    ├── scripts/              # Optional: executable scripts
    │   └── fetch_docs.py
    ├── references/           # Optional: detailed docs
    │   ├── api-patterns.md
    │   └── style-guide.md
    └── assets/               # Optional: templates, data files
        ├── report-template.md
        └── schema.json

```


| 目录 | 用途 | 加载时机 |
| --- | --- | --- |
| SKILL.md | 元数据 + 核心指令 | Frontmatter 启动时加载；正文匹配时加载 |
| scripts/ | 可执行脚本（Python、Bash、JS 等） | Agent 按指令需要时执行 |
| references/ | 详细参考文档（API 模式、风格指南等） | Agent 需要深入信息时按需读取 |
| assets/ | 模板、数据文件、schema 等静态资源 | Agent 需要时按需读取 |



### SKILL.md 的结构


每个 Skill 的核心是 `SKILL.md` 文件，由两部分组成：**YAML frontmatter**（元数据）和 **Markdown body**（指令正文）。


#### YAML Frontmatter


Frontmatter 定义了 Skill 的身份和约束条件。规范定义的字段如下：


| 字段 | 必填 | 说明 |
| --- | --- | --- |
| name | Yes | 小写字母、数字、连字符组成，1-64 字符。必须与父目录名一致。 |
| description | Yes | 描述 Skill 的功能和适用场景。最大 1024 字符。 |
| license | No | 许可证名称 |
| compatibility | No | 环境要求（如需要网络访问、需要特定 CLI 工具）。最大 500 字符。 |
| metadata | No | 任意键值对（author、version、entrypoint 等） |
| allowed-tools | No | 空格分隔的预授权工具列表 |



#### Markdown Body


Frontmatter 之后是 Markdown 格式的详细指令。这是 Agent 被激活该 Skill 后实际执行的"剧本"。


以下是一个完整的 `SKILL.md` 示例：


```yaml
---
name: langgraph-docs
description: Use this skill for requests related to LangGraph in order to fetch relevant documentation to provide accurate, up-to-date guidance.
---

# langgraph-docs

## Overview
This skill explains how to access LangGraph documentation to help answer questions and guide implementation.

## Instructions

### 1. Fetch the documentation index
Use the fetch_url tool to read the following URL:
https://docs.langchain.com/llms.txt

### 2. Select relevant documentation
Based on the question, identify 2-4 most relevant documentation URLs from the index. Prioritize:
- Specific how-to guides for implementation questions
- Core concept pages for understanding questions
- Tutorials for end-to-end examples
- Reference docs for API details

### 3. Fetch and synthesize
Use the fetch_url tool to read the selected documentation URLs, then answer the user's question.

```


#### description 是最重要的字段


Agent 选择 Skill 的唯一依据就是 `description` 字段——它不会提前读取正文内容。因此，description 的质量直接决定了 Skill 是否能被正确匹配。


**好的 description**——具体、明确触发条件：


```yaml
description: Use this skill for requests related to LangGraph in order to fetch relevant documentation to provide accurate, up-to-date guidance.

```


```yaml
description: 当用户要求审查代码质量、安全性或性能时使用此技能。执行结构化代码审查并输出报告。

```


**差的 description**——模糊、缺乏触发信号：


```yaml
description: A helpful skill for developers.

```


```yaml
description: 处理各种任务。

```


差的 description 会导致两种问题：该用时匹配不到（漏召回），不该用时被错误触发（误召回）。


## Progressive Disclosure：渐进式加载


Skills 最关键的设计决策是 **Progressive Disclosure（渐进式披露）**——不是一次性把所有内容塞给 Agent，而是分三个层级逐步加载：


![Skill 的三层加载结构：元数据 → 核心指令 → 辅助资源，越往下越详细、加载越晚](https://datawhalechina.github.io/deepagents-in-action/imgs/20-framework-skill-structure.png)


### 三级加载机制


| 层级 | 加载内容 | 加载时机 | 处理者 |
| --- | --- | --- | --- |
| Level 1: Metadata | name + description | Agent 启动时，所有 Skills 一起加载 | SkillsMiddleware |
| Level 2: Instructions | SKILL.md 完整正文 | 某个 Skill 被匹配激活时 | SkillsMiddleware |
| Level 3: Resources | scripts/、references/、assets/ 下的文件 | 指令中引用到某个文件时 | LLM 自行决策读取 |



工作流程：


- **启动阶段**：`SkillsMiddleware` 扫描所有 Skill 目录，只解析每个 `SKILL.md` 的 frontmatter，提取 name 和 description。这些摘要被注入到系统提示词中。如果有 20 个 Skills，大约只占用几百 token。
- **匹配阶段**：用户发送请求后，Agent 根据 description 判断是否需要某个 Skill。一旦决定使用，`SkillsMiddleware` 将该 Skill 的完整 SKILL.md 正文加载到上下文中。
- **执行阶段**：Agent 按照正文中的指令工作。如果指令中引用了 `references/` 或 `assets/` 下的文件，Agent 自行决定是否读取——这一步由 LLM 控制，不再由中间件干预。


### 匹配流程示例


![Progressive Disclosure：启动阶段只读 frontmatter，匹配阶段才加载完整 SKILL.md 内容](https://datawhalechina.github.io/deepagents-in-action/imgs/21-flowchart-progressive-disclosure.png)


```
用户："帮我查一下 LangGraph 的 interrupt 机制"

Agent 思考：
  - 扫描 Skills 列表...
  - langgraph-docs: "Use this skill for requests related to LangGraph..." ← 匹配！
  - 读取 /skills/langgraph-docs/SKILL.md 完整内容
  - 按照指令执行：fetch_url → 选择文档 → 阅读 → 回答

```


### 为什么这样设计


三个好处：


1. 节省 token：20 个 Skills 启动时只加载 20 条 description（几百 token），而不是 20 份完整指令（可能数万 token）
2. 精准匹配：只有当前任务真正需要的 Skill 才会被加载，避免无关指令干扰 LLM 的判断
3. 无限扩展：Skill 数量从 5 个增长到 50 个，启动开销只是线性增加几十条 description，不会触及上下文窗口瓶颈


## 使用方式


Skills 的加载方式取决于你使用的 Backend。Deep Agents 提供三种 Backend，各自对应不同的文件存储策略。下面逐一演示。


![Skills 的三种存储后端](https://datawhalechina.github.io/deepagents-in-action/imgs/22-arch-skills-backends.png)


### 基本用法（FilesystemBackend）


FilesystemBackend 直接从本地磁盘读取 Skills 文件，适合本地开发和 CLI 场景：


```python
from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend

backend = FilesystemBackend(root_dir="./my-project", virtual_mode=True)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=backend,
    skills=["/skills/"],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "What is LangGraph?"}]},
    config={"configurable": {"thread_id": "1"}},
)

```


关键点：


- skills 参数接受一个路径列表，每个路径指向包含 Skill 子目录的父目录
- 路径使用正斜杠（/），相对于 Backend 的根目录；上例中 /skills/ 对应本地的 ./my-project/skills/
- 本地磁盘后端建议显式传入 virtual_mode=True，与第 3 章的路径沙箱说明保持一致
- 当多个路径中存在同名 Skill 时，后面的覆盖前面的（last wins）


### StateBackend：通过 state 注入 Skills


StateBackend 将文件存储在 LangGraph 的 agent state 中。适合无磁盘环境（如 serverless 部署）或需要动态注入 Skill 内容的场景：


```python
from urllib.request import urlopen
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from deepagents.backends.utils import create_file_data
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
backend = StateBackend()

# 从远程加载 Skill（也可以本地读取）
skill_url = "https://raw.githubusercontent.com/langchain-ai/deepagents/refs/heads/main/libs/cli/examples/skills/langgraph-docs/SKILL.md"
with urlopen(skill_url) as response:
    skill_content = response.read().decode('utf-8')

skills_files = {
    "/skills/langgraph-docs/SKILL.md": create_file_data(skill_content),
}

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=backend,
    skills=["/skills/"],
    checkpointer=checkpointer,
)

result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "What is langgraph?"}],
        "files": skills_files,  # 通过 files 参数注入
    },
    config={"configurable": {"thread_id": "12345"}},
)

```


关键点：


- StateBackend 没有磁盘，所有文件存储在 LangGraph agent state 中
- 虚拟路径必须以 / 开头（绝对路径格式）
- 必须使用 create_file_data() 格式化内容——直接传入原始字符串会报错
- Skill 文件通过 invoke 的 files 参数注入，每次调用都需要传入


### StoreBackend：跨线程持久化


StoreBackend 使用 LangGraph Store 进行持久化存储。与 StateBackend 的关键区别在于：文件只需写入一次，所有线程都能访问。


```python
from urllib.request import urlopen
from deepagents import create_deep_agent
from deepagents.backends import StoreBackend
from deepagents.backends.utils import create_file_data
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()
backend = StoreBackend(namespace=lambda _rt: ("filesystem",))

skill_url = "https://raw.githubusercontent.com/langchain-ai/deepagents/refs/heads/main/libs/cli/examples/skills/langgraph-docs/SKILL.md"
with urlopen(skill_url) as response:
    skill_content = response.read().decode('utf-8')

store.put(
    namespace=("filesystem",),
    key="/skills/langgraph-docs/SKILL.md",
    value=create_file_data(skill_content),
)

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=backend,
    store=store,
    skills=["/skills/"],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "What is langgraph?"}]},
    config={"configurable": {"thread_id": "12345"}},
)

```


关键点：


- StoreBackend 使用 LangGraph Store 作为底层存储，数据跨线程持久化
- 文件通过 store.put() 写入，而非每次 invoke 时传入
- namespace 参数是一个函数，接收 runtime config 并返回命名空间元组
- 适合生产环境中多用户、多线程共享 Skills 的场景


### 多源 Skills 与优先级


你可以从多个目录加载 Skills。当同名 Skill 出现在多个源中时，**列表中后面的覆盖前面的**（last wins）：


```python
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    skills=[
        "/skills/shared/",    # 团队共享 Skills
        "/skills/project/",   # 项目专属 Skills（优先级更高）
    ],
)

```


这个设计支持分层覆盖：


- 团队级 Skills 放在 /skills/shared/，提供通用能力
- 项目级 Skills 放在 /skills/project/，针对当前项目定制
- 如果两个目录中都有 code-review Skill，/skills/project/ 中的版本生效


典型的分层策略：


| 层级 | 路径 | 内容 |
| --- | --- | --- |
| 组织级 | /skills/org/ | 公司规范、安全审查 |
| 团队级 | /skills/team/ | 团队工作流、Code Review 标准 |
| 项目级 | /skills/project/ | 项目特定的部署流程、测试策略 |



### 运行时动态加载


`skills` 参数是一个普通的 Python 列表，这意味着你可以在运行时动态构造它。典型场景：根据用户角色、租户或请求类型加载不同的 Skill 集合。


```python
from deepagents import create_deep_agent

SKILLS_BY_ROLE = {
    "engineering": ["/skills/code-review/", "/skills/testing/", "/skills/deployment/"],
    "data": ["/skills/sql-analysis/", "/skills/visualization/", "/skills/data-pipeline/"],
    "support": ["/skills/ticket-triage/", "/skills/runbook/"],
}

def create_agent_for_user(user_role: str):
    return create_deep_agent(
        model="anthropic:claude-sonnet-4-6",
        skills=SKILLS_BY_ROLE.get(user_role, []),
    )

```


动态加载的常见模式：


- 基于用户角色：工程师看到代码相关 Skills，数据团队看到分析 Skills
- 基于租户配置：SaaS 场景中不同客户启用不同的 Skill 包
- 基于请求上下文：根据用户输入的意图预先筛选相关 Skills
- 基于环境变量：开发环境加载调试 Skills，生产环境加载运维 Skills


这种模式的好处是：Agent 只加载与当前任务相关的 Skills，既节省 token 又减少误匹配。


## Skills 与子 Agent


![子 Agent 的 Skills 继承规则](https://datawhalechina.github.io/deepagents-in-action/imgs/24-arch-skills-subagent.png)


Deep Agents 支持多 Agent 协作，Skills 在主 Agent 与子 Agent 之间的继承规则如下：


- 通用子 Agent（General-Purpose Subagent）：自动继承主 Agent 的所有 Skills，无需额外配置。
- 自定义子 Agent：不继承主 Agent 的 Skills，必须在定义时通过 skills 字段显式指定。
- Skill 状态完全隔离：每个 Agent 拥有独立的 Skill 状态空间，一个 Agent 对 Skill 文件的修改不会影响其他 Agent。


```python
from deepagents import create_deep_agent

research_subagent = {
    "name": "researcher",
    "description": "Research assistant with specialized skills",
    "system_prompt": "You are a researcher.",
    "tools": [web_search],
    "skills": ["/skills/research/", "/skills/web-search/"],  # 子 Agent 专属 Skills
}

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    skills=["/skills/main/"],              # 主 Agent 和 GP 子 Agent 使用
    subagents=[research_subagent],          # researcher 只有自己的 Skills
)

```


在这个例子中，主 Agent 挂载了 `/skills/main/` 目录。当它派发任务给通用子 Agent 时，该子 Agent 也能访问 `/skills/main/` 下的所有 Skill 文件。而 `researcher` 是自定义子 Agent，它只能使用自己声明的 `/skills/research/` 和 `/skills/web-search/`，无法访问主 Agent 的 `/skills/main/`。


这种设计的好处是职责清晰：研究型子 Agent 不需要也不应该接触主 Agent 的编排类 Skill；同时状态隔离保证了并发执行时不会出现竞态条件。


## Skill 权限控制


![Skill 权限控制：共享 + 个人分层](https://datawhalechina.github.io/deepagents-in-action/imgs/23-arch-skills-permissions.png)


生产环境中，Skill 的权限管理需要关注三个维度：


1. 可见性（Visibility）：Agent 能否发现和读取某个 Skill。
2. 写入权限（Write Access）：Agent 能否修改 Skill 文件内容。
3. 审批流程（Approval）：写入操作是否需要人类确认。


### 只读 Skills（企业知识库场景）


企业场景中，运维团队维护一套经过审核的 Skill 库，Agent 只能读取和执行，不能擅自修改。使用 `FilesystemPermission` 配合 `CompositeBackend` 实现：


```python
from dataclasses import dataclass

from deepagents import FilesystemPermission, create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore


@dataclass(frozen=True)
class TenantContext:
    org_id: str


def org_skill_namespace(rt):
    org_id = getattr(rt.context, "org_id", "default-org")
    return ("curated-skills", org_id)


store = InMemoryStore()

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    context_schema=TenantContext,
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/skills/": StoreBackend(
                namespace=org_skill_namespace,
            ),
        },
    ),
    skills=["/skills/"],
    permissions=[
        FilesystemPermission(
            operations=["write"],
            paths=["/skills/**"],
            mode="deny",
        ),
    ],
    store=store,
)

```


核心逻辑：`mode="deny"` 拒绝所有对 `/skills/**` 路径的写入操作。Agent 可以正常发现和读取 Skill 内容，但 `write_file` 和 `edit_file` 调用会被直接拦截并返回权限错误。Skill 库的更新只能通过管理员代码直接操作 Store 完成。


本地调试或自托管服务中，需要在调用时传入组织上下文，例如：


```python
agent.invoke(
    {"messages": [{"role": "user", "content": "列出可用 Skills"}]},
    context=TenantContext(org_id="org-acme"),
    config={"configurable": {"thread_id": "1"}},
)

```


### 写入需审批（interrupt 模式）


某些场景下，允许 Agent 提出修改建议，但需要人类审批后才能生效。`mode="interrupt"` 提供了这种人在回路（human-in-the-loop）的能力：


```python
from deepagents import FilesystemPermission, create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    skills=["/skills/personal/"],
    permissions=[
        FilesystemPermission(
            operations=["write"],
            paths=["/skills/**"],
            mode="interrupt",
        ),
    ],
    checkpointer=MemorySaver(),  # interrupt 需要 checkpointer
)

```


当 Agent 尝试对 `/skills/**` 下的文件执行写入时，执行流会暂停（interrupt），将修改内容呈现给人类审批者。审批通过后恢复执行，拒绝则回滚操作。


注意事项：


- interrupt 模式依赖 checkpointer 保存暂停时的状态，因此必须配置 MemorySaver 或其他持久化 checkpointer。
- 此功能需要 deepagents>=0.6.8。
- 在 LangGraph Studio 中，interrupt 会自动渲染为审批 UI；API 调用时需要客户端轮询状态并提交审批结果。


### 共享 + 个人 Skills 分层


实际部署中，最常见的模式是两层结构：团队共享的只读 Skill 库 + 用户个人的可写 Skill 空间。


```python
from dataclasses import dataclass

from deepagents import FilesystemPermission, create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend


@dataclass(frozen=True)
class TenantContext:
    org_id: str
    user_id: str


def shared_skill_namespace(rt):
    org_id = getattr(rt.context, "org_id", "default-org")
    return ("curated-skills", org_id)


def personal_skill_namespace(rt):
    if rt.server_info and rt.server_info.user:
        return ("user-skills", rt.server_info.user.identity)
    user_id = getattr(rt.context, "user_id", "local-user")
    return ("user-skills", user_id)


agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    context_schema=TenantContext,
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/skills/shared/": StoreBackend(
                namespace=shared_skill_namespace,
            ),
            "/skills/personal/": StoreBackend(
                namespace=personal_skill_namespace,
            ),
        },
    ),
    skills=["/skills/shared/", "/skills/personal/"],
    permissions=[
        FilesystemPermission(
            operations=["write"],
            paths=["/skills/shared/**"],
            mode="deny",
        ),
    ],
)

```


这个配置实现了：


- /skills/shared/ 路径映射到组织级 Store，写入被 deny，只有管理员能更新。
- /skills/personal/ 路径映射到用户级 Store，无写入限制，Agent 可以自由创建和优化个人 Skill。
- 两个路径都在 skills 列表中，Agent 启动时会同时加载两处的 Skill 文件。


**同名覆盖规则**：当共享库和个人空间存在同名 Skill 时，采用 last-wins 策略——`skills` 列表中靠后的路径优先级更高。上例中 `/skills/personal/` 排在后面，因此个人版本会覆盖共享版本。这允许用户基于共享 Skill 做个性化调整，而不影响其他用户。


## 用 Skills 执行代码


![Skills 代码执行的两种模式](https://datawhalechina.github.io/deepagents-in-action/imgs/25-arch-skills-code-execution.png)


Skills 不仅能提供文本指令，还能包含**可执行代码**。Deep Agents 支持两种代码执行模式：沙箱脚本和解释器技能。


### 沙箱脚本（Sandbox Scripts）


Skills 可以在 `scripts/` 目录下包含可执行脚本。Agent 可以从任何后端**读取**脚本内容，但要**执行**脚本，则需要一个支持沙箱执行的后端（如 DaytonaSandbox）。


典型的带脚本 Skill 目录结构：


```
skills/
└── arxiv-search/
    ├── SKILL.md
    └── scripts/
        └── search.py

```


对应的 `SKILL.md`：


```yaml
---
name: arxiv-search
description: Search the arXiv preprint repository for research papers. Use when the user asks about academic papers, recent research, or scientific literature.
---

# arxiv-search

Search arXiv for papers matching the user's query.

## Instructions

1. Run `scripts/search.py` with the user's query as an argument.
2. Parse the results and present them with title, authors, abstract summary, and link.
3. If the user asks for more detail on a specific paper, fetch the full abstract.

```


**执行机制**：沙箱后端（如 DaytonaSandbox）在隔离容器中运行脚本，Agent 获取标准输出作为结果。如果 Skill 文件存储在沙箱之外（比如使用 StateBackend），需要通过自定义中间件在 Agent 运行前后同步文件：


- before_agent：将 Skill 脚本上传到沙箱环境
- after_agent：将沙箱中的输出文件下载回来


这种模式适合需要运行数据处理、API 调用、文件转换等任务的场景，同时保证了执行的安全隔离。


### 解释器技能（Interpreter Skills）


解释器技能将 Skill 中的代码模块暴露给 Agent 的代码解释器环境。Agent 可以直接 `import` 经过测试的辅助函数，而不必每次都重新生成逻辑。


> 运行前提：Interpreter Skills 需要安装 QuickJS 中间件，例如 `pip install -U "deepagents[quickjs]"` 或 `uv add "deepagents[quickjs]"`。官方文档要求 `langchain-quickjs>=0.1.0` 且 Python `>=3.11`。解释器运行在 QuickJS 内存环境中，适合导入确定性的 JS/TS helper；如果需要执行 Shell、安装包或访问完整文件系统，应使用沙箱后端。


要让一个 Skill 可被导入，需要三步配置：


1. 在 frontmatter 的 metadata.entrypoint 中指定入口文件（JS/TS）
2. 配置 CodeInterpreterMiddleware 使用相同的后端
3. Agent 在代码中通过 await import("@/skills/<name>") 导入


目录结构示例：


```
skills/
└── order-helpers/
    ├── SKILL.md
    └── scripts/
        └── index.ts

```


`SKILL.md`：


```yaml
---
name: order-helpers
description: Helper functions for normalizing and grouping order records.
metadata:
  entrypoint: scripts/index.ts
---

# order-helpers

Use this skill when order records need deterministic cleanup or aggregation.

Import these utilities into the REPL:

```typescript
const { groupByStatus } = await import("@/skills/order-helpers");
groupByStatus(...);

```


```

TypeScript 模块实现：

```typescript
// skills/order-helpers/scripts/index.ts
interface Order {
  id: string;
  status: string;
}

export function groupByStatus(orders: Order[]) {
  return orders.reduce((acc, order) => {
    acc[order.status] = acc[order.status] ?? [];
    acc[order.status].push(order);
    return acc;
  }, {});
}

```


Agent 配置：


```python
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain_quickjs import CodeInterpreterMiddleware

backend = StateBackend()

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=backend,
    skills=["/skills/"],
    middleware=[CodeInterpreterMiddleware(skills_backend=backend)],
)

```


解释器技能的优势在于**确定性**——经过测试的函数不会因为 LLM 重新生成而出现偏差，同时也节省了 token（Agent 只需要写一行 import 而不是几十行实现代码）。


## Skills、Memory 与 Tools 对比


Skills、Memory（`AGENTS.md`）和 Tools 是 Deep Agents 中三种不同的能力注入方式。它们服务于不同的目的：


|  | Skills | Memory（AGENTS.md） | Tools |
| --- | --- | --- | --- |
| 用途 | 按需加载的领域能力（渐进式披露） | 启动时加载的持久上下文 | Agent 可调用的编程操作 |
| 加载时机 | Agent 判断相关时才读取 | Agent 启动时加载 | 每轮都可用 |
| 格式 | 命名目录中的 SKILL.md | AGENTS.md 文件 | 绑定到 Agent 的函数 |
| 优先级 | 后来者覆盖（last wins） | 用户级 + 项目级合并 | 创建时定义 |
| 适用场景 | 任务专属、可能很大的指令集 | 始终相关的全局规范和偏好 | Agent 需要执行操作，或没有文件系统时 |



**实用决策规则**：


- "所有对话都需要的" → Memory（如编码规范、语言偏好、项目架构说明）
- "特定任务才需要的专业指令" → Skills（如 LangGraph 文档查询流程、代码审查清单）
- "需要执行的原子操作" → Tools（如搜索、读写文件、发送 HTTP 请求）


值得注意的是，Skills 和 Memory 处于一个**连续光谱**上。Agent 可以在工作过程中更新自己的 Skills（就像更新记忆一样），因此 Skills 也可以充当**渐进式披露的记忆**——只在需要时才加载的领域知识库。


## 编写高效 Skills 的最佳实践


根据 Agent Skills 规范和实践经验，以下是编写高质量 Skills 的指南：


### 1. Frontmatter 保持精简


Frontmatter 中的 `description` 是 Agent 决定是否使用此 Skill 的唯一依据。写得具体、准确，避免泛泛而谈。


好的写法：


```yaml
description: 当用户询问 LangGraph 的节点定义、状态管理、中断机制或部署配置时使用此技能。获取最新官方文档并提供代码示例。

```


差的写法：


```yaml
description: 帮助用户解决编程问题。

```


### 2. SKILL.md 正文控制在 5000 tokens / 500 行以内


正文指令应当聚焦核心流程。超出部分应拆分到 `references/` 目录：


```
skills/
└── api-design/
    ├── SKILL.md              # 核心流程（< 500 行）
    └── references/
        ├── rest-conventions.md   # 详细参考：REST 规范
        └── error-codes.md        # 详细参考：错误码定义

```


在 `SKILL.md` 中引用这些文件，Agent 会在需要时按需加载。


### 3. 为 Agent 而非人类写结构


Agent 擅长执行清晰的步骤化指令。Skill 内容应当包含：


- 步骤化流程：明确的 1-2-3 步骤，而非段落式描述
- 决策标准：遇到分支时如何选择（if X then A, else B）
- 输入/输出示例：展示期望的输入格式和输出格式
- 边界情况处理：常见异常如何应对


### 4. 管控 Skill 数量


少量定义清晰的 Skills 优于大量定义模糊的 Skills。当 Skill 数量过多时：


- Agent 需要在更多 description 中做选择，容易误匹配
- 重叠的 Skill 会让 Agent 困惑该用哪个


建议：定期审查 Skills 列表，合并重叠的、删除过时的、拆分过大的。


## 小结


本章我们深入学习了 Deep Agents 的 Skills 机制，核心要点：


1. Skills 结构：一个目录 + SKILL.md + 可选的 scripts/references/assets，遵循开放的 Agent Skills 规范，可跨框架复用
2. Progressive Disclosure 三级加载：元数据（启动时）→ 指令正文（匹配时）→ 辅助资源（按需），最大化 token 效率
3. 三种存储后端：StateBackend（通过 files 参数注入）、StoreBackend（持久化存储）、FilesystemBackend（直接读磁盘）
4. 子 Agent 继承规则：General-purpose 子 Agent 自动继承主 Agent 的 Skills，自定义子 Agent 需显式配置，状态完全隔离
5. 权限控制：deny 模式完全禁止、interrupt 模式人工审批，适用于生产环境的安全部署
6. 代码执行：沙箱脚本在隔离容器中运行外部脚本，解释器技能让 Agent 直接 import 经过测试的代码模块
7. Skills vs Memory vs Tools：三者各司其职——Skills 是按需加载的领域知识，Memory 是始终生效的全局上下文，Tools 是可执行的原子操作


下一章，我们将学习长期记忆——让 Agent 拥有跨对话、跨会话的持久化记忆。


---


## 通用 Agent 设计视角：可复用能力包（Skills / 可加载知识）


> 这一节把 Skills 机制从具体框架（Deep Agents、Claude Code、Cursor…）中抽离，提取它作为**Agent 通用设计模式**的内核。理解这一层后，任何 Agent 框架都可以用同样的思路来设计"能力分发"子系统。


### 1. 核心问题：为什么需要"Skills"这一层？


Agent 的能力注入有三种粒度：


| 层级 | 形态 | 类比 | 加载时机 |
| --- | --- | --- | --- |
| Tool | 原子函数（一次操作） | 系统调用 | 每轮可用 |
| Memory | 持久上下文（AGENTS.md 等） | /etc/profile | 启动时一次性加载 |
| Skill | 多步工作流 + 领域知识 + 模板资源 | npm 包 / VS Code 扩展 | 按需加载 |



**Skills 解决的是"超出原子工具、又不适合常驻上下文"的那一层能力**——它把"专业领域的完整操作流程"封装成一个可命名、可分发、可复用的单元。


设计决策：**始终相关**的内容放 Memory；**特定任务才需要**的专业流程放 Skill；**需要执行的原子操作**放 Tool。三者构成连续光谱。


### 2. 渐进式披露（Progressive Disclosure）：Agent 上下文工程的通用模式


**这是 Skills 机制最有价值的通用设计思想**。它不只属于 Skills——任何"Agent 加载外部知识"的设计都可以套用这个三层结构：


```
Level 1 · 摘要（始终可见）
  └─ 启动时全量加载，仅占几百 token
  └─ Agent 据此判断"要不要用"

Level 2 · 指令（匹配后可见）
  └─ 触发条件命中后才加载完整指令
  └─ 通常是 SKILL.md / System Prompt 子模块

Level 3 · 资源（按需引用）
  └─ 模板、参考文档、可执行脚本
  └─ 由 LLM 自行决定何时读取

```


**为什么这个模式放之四海而皆准？**


1. Token 经济性：把"几十份完整文档"的成本压到"几十条 description"的成本
2. 匹配精准性：只有真正用到的内容才进入上下文，避免无关指令干扰判断
3. 无限扩展性：数量从 5 增长到 500，启动开销仅线性增加摘要，不会撑爆上下文窗口
4. 职责分离：Level 1 归中间件/系统管，Level 2 归中间件管，Level 3 归 LLM 管——每层有清晰的所有者


> 这是 Agent 设计中"如何管理无限知识 vs 有限上下文"这对核心矛盾的**标准解法**。


### 3. 描述（Description）是命门


Agent 选不选某个能力包，**唯一依据就是它的"摘要"字段**。这意味着：


- 摘要必须具体、有明确触发条件："当用户询问 X、Y、Z 场景时使用此技能"
- 摘要必须避免泛化："帮助用户解决编程问题" 等于没写
- 摘要质量直接决定漏召回（该用没用）和误召回（不该用却用了）两个核心指标


**通用原则：摘要的写作目标是让 LLM 零样本判断"该不该调我"**——它不是给人看的文档，是给模型的匹配信号。


### 4. 能力包的组织方式：分层 + 覆盖


任何支持多源加载的 Agent 框架，都会自然形成这种分层结构：


```
组织级 / 共享层    （只读、由管理员维护）
  └─ 公司规范、安全审查标准
  └─ 团队 Code Review 流程
        ↓
项目级 / 主题层    （只读、由项目 Owner 维护）
  └─ 项目特定的部署流程、测试策略
        ↓
个人级 / 扩展层    （可写、由 Agent/用户动态创建）
  └─ 用户专属的工作流、个性化模板

```


**覆盖规则**：后加载的覆盖先加载的（last-wins）。这让"个人化定制"和"组织规范"可以共存——共享底座 + 个人 patch。


### 5. 三种存储策略的取舍（设计模式层）


把"能力包放哪"这个问题抽象出来，本质是三种**持久化与可见性**的取舍：


| 策略 | 持久性 | 可见性 | 适用场景 |
| --- | --- | --- | --- |
| 文件后端 | 进程外（磁盘） | 全局共享 | 本地开发、CLI、单机工具 |
| 状态后端 | 进程内（agent state） | 单次会话 | Serverless、无盘环境、临时注入 |
| 存储后端 | 跨进程（独立 store） | 跨会话/跨租户 | 生产环境、多用户共享 |



**设计启示**：Agent 框架应把这层做成**可插拔后端**（同一种接口、多种实现），让上层业务逻辑不用关心技能包究竟存在哪里。


### 6. 权限模型：能力包也是"数据"


能力包一旦可写，就需要权限模型。Agent 系统中通常需要三个维度的控制：


1. 可见性：哪些 Agent 能看到这个能力包
2. 写入权限：哪些主体能修改能力包
3. 审批流程：写入是否需要人类确认


三种典型模式：


- Deny（完全禁止）：能力包是只读的知识库（企业规范、审计标准）
- Interrupt（人工审批）：能力包可被 Agent 提议修改，但写入前需人类确认
- Allow（自由写入）：个人空间，Agent 可以自由创建/优化自己的技能包


**通用原则：能力包本身就是 Agent 系统的"数据资产"**，需要和数据一样的访问控制、审计、版本管理。


### 7. Agent 协作时的能力包继承


多 Agent 系统中，"能力包如何在主 Agent 和子 Agent 之间流动"是一个核心设计问题。两种主流模式：


- 隐式继承：通用子 Agent 自动继承主 Agent 的能力包（适合"主 Agent 做编排、子 Agent 做执行"的架构）
- 显式声明：子 Agent 必须自己声明能力包（适合"职责完全隔离的领域 Agent"）


关键设计取舍：


- 隐式继承 → 简单、零配置，但有"能力泄漏"风险（子 Agent 能用上不该用的工具）
- 显式声明 → 安全、职责清晰，但配置成本高
- 状态隔离是底线：任何模式下，每个 Agent 对能力包的修改都不能影响其他 Agent（避免并发竞态）


### 8. 把"可执行代码"作为能力包的一部分


能力包不仅能包含"自然语言指令"，还能包含**可执行代码**。两种模式：


- 沙箱脚本：把脚本作为资源，Agent 决定何时、在哪个沙箱中执行（适合需要副作用的操作）
- 解释器模块：把代码作为可导入的模块，Agent 直接 import 进来用（适合确定性辅助函数）


**设计启示**：能力包的"内容"不限于文档——它可以是**可调用、可执行、可导入**的任何形态。这是 Agent 框架从"提示词工程"走向"软件工程"的关键一步。


### 9. 通用设计清单


设计任何一个 Agent 的"能力分发"子系统时，问自己这几个问题：


- 是否支持渐进式披露三层加载？
- 摘要字段是否具体到可零样本匹配？
- 是否支持多源 + 覆盖的分层组织？
- 存储后端是否可插拔（同接口多实现）？
- 是否定义了权限模型（可见性 / 写入 / 审批）？
- 多 Agent 协作时，能力包如何继承 + 如何隔离？
- 能力包内容是否可执行（不只文档）？
- 是否有数量治理机制（合并重叠、删除过时、拆分过大）？


### 10. 核心心智模型


> **能力包（Skill）= 命名 + 摘要 + 触发条件 + 指令流程 + 可选资源。**
> 
> 
> 它是 Agent 系统中"可被按需加载的可复用能力单元"——介于"原子工具"和"常驻上下文"之间，把专业领域的完整工作流封装成可分发、可复用、可治理的标准模块。
> 
> 
> 本质上，它是**Agent 世界里的"包管理器"**。  
> ```


## 长期记忆 — 让 Agent 拥有跨对话的记忆

> 前几章我们学习了 Deep Agents 的核心能力：虚拟文件系统、任务规划、子 Agent、Skills。但这些能力都有一个共同的局限——**对话结束后，一切都丢失了**。本章学习如何让 Agent 拥有跨对话、跨会话的持久化记忆。

### Memory 的工作原理

Deep Agents 将记忆作为**一等公民**——Agent 以文件形式读写记忆，你用 Backend 控制这些文件存储在哪里。整个流程分三步：

1. **指定记忆文件路径**：通过 `memory=` 参数传入文件路径列表，也可以通过 `skills=` 传入程序性记忆（Skills）
2. **Agent 读取记忆**：启动时加载到系统提示词，或对话过程中按需读取
3. **Agent 更新记忆（可选）**：学到新信息时，用内置的 `edit_file` 工具更新记忆文件，变更持久化到下次对话

最常见的两种模式：**Agent 级记忆**（所有用户共享）和**用户级记忆**（按用户隔离）。

### Agent 的两种"记忆"

人类有短期记忆和长期记忆——你记得今天的对话内容（短期），也记得你的名字和偏好（长期）。Agent 也一样，但需要不同的技术来实现。

#### 短期记忆：Thread-scoped

在第 3 章我们学过，默认的 `StateBackend` 将文件存在 LangGraph 的 Agent State 中。这是一种**短期记忆**：

- 同一个对话线程（thread）内持久化
- 多轮对话不丢失（通过 Checkpointer 机制）
- **对话结束后消失**——换一个 thread_id，之前的文件就没了

这就像你的工作桌面——当前任务的资料都摊在上面，但下班清理后就干净了。

#### 长期记忆：Cross-thread

有些信息需要在不同对话间保留：

- 用户的偏好设置（"我喜欢简洁的代码风格"）
- 项目的背景知识（"我们用 React + TypeScript"）
- 累积的研究成果（多次对话中逐渐收集的资料）
- Agent 从反馈中学到的改进指令

这些信息不应该随着对话结束而消失。这就是**长期记忆**——它需要一种能跨线程持久化的存储方式。

![Agent 的两种记忆：短期记忆（Checkpointer，同一对话内有效）vs 长期记忆（Store，跨对话持久化），CompositeBackend 将两者组合](https://datawhalechina.github.io/deepagents-in-action/imgs/26-comparison-memory-types.png)

### Checkpointer：短期记忆的基础

在深入长期记忆之前，先理解 Checkpointer——它是 LangGraph 的短期记忆机制。

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

agent = create_deep_agent(
    model=model,
    checkpointer=checkpointer,
)

# 同一个 thread_id 内，Agent 记得之前的对话
config = {"configurable": {"thread_id": "conversation-001"}}
agent.invoke({"messages": [{"role": "user", "content": "我叫张三"}]}, config=config)
agent.invoke({"messages": [{"role": "user", "content": "我叫什么名字？"}]}, config=config)
# Agent 能回答"你叫张三"

# 换一个 thread_id，Agent 不记得了
config2 = {"configurable": {"thread_id": "conversation-002"}}
agent.invoke({"messages": [{"role": "user", "content": "我叫什么名字？"}]}, config=config2)
# Agent 不知道你是谁
```

Checkpointer 的工作原理：

- 每次 Agent 执行完一步，自动保存当前状态（消息历史、文件系统状态、任务清单等）
- 下次调用时，如果 `thread_id` 相同，自动恢复上次的状态
- 开发用 `MemorySaver`（内存，重启丢失），生产用 `PostgresSaver`（数据库，持久化）

**关键限制**：Checkpointer 只在同一个 `thread_id` 内有效。不同的对话（不同 thread_id）之间，状态完全隔离。

#### 短期记忆的管理策略

随着对话越来越长，消息历史可能超出 LLM 的上下文窗口。LangChain 提供了三种应对策略：

| 策略 | 做法 | 适用场景 |
| --- | --- | --- |
| **Trim（裁剪）** | 只保留最近 N 条消息，丢弃更早的 | 简单粗暴，适合不需要历史上下文的场景 |
| **Delete（删除）** | 用 `RemoveMessage` 精确删除特定消息 | 需要选择性清理（如删除敏感信息） |
| **Summarize（总结）** | 用 LLM 将旧消息压缩为摘要 | 需要保留历史语义，是最推荐的方式 |

在 Deep Agents 中，**Summarize 策略已经自动内置**（第 3 章和第 4 章讲过的 `SummarizationMiddleware`）。当上下文达到模型窗口的 85% 时，自动触发总结。

如果你需要自定义裁剪逻辑，可以用 LangChain 的 `@before_model` 中间件：

```python
from langchain.messages import RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langchain.agents import AgentState
from langchain.agents.middleware import before_model
from langgraph.runtime import Runtime

@before_model
def trim_messages(state: AgentState, runtime: Runtime) -> dict | None:
    """只保留最近几条消息，防止上下文溢出。"""
    messages = state["messages"]
    if len(messages) <= 3:
        return None  # 不需要裁剪

    first_msg = messages[0]  # 保留第一条（通常是系统消息）
    recent = messages[-3:]   # 保留最近 3 条
    return {
        "messages": [
            RemoveMessage(id=REMOVE_ALL_MESSAGES),
            first_msg,
            *recent,
        ]
    }

# 在 create_agent 或 create_deep_agent 中通过 middleware 参数添加
agent = create_deep_agent(
    model=model,
    middleware=[trim_messages],
)
```

> `@before_model` 是 LangChain 的中间件装饰器——它在每次模型调用**之前**执行，可以修改传给模型的消息。对应地还有 `@after_model`（模型调用之后执行）。这和第 4 章讲的中间件机制是同一套体系。

#### 进阶：自定义 AgentState

LangChain 允许你扩展默认的 `AgentState`，添加自定义字段：

```python
from langchain.agents import create_agent, AgentState

class CustomAgentState(AgentState):
    user_id: str          # 用户 ID
    preferences: dict     # 用户偏好

agent = create_agent(
    model=model,
    tools=[get_user_info],
    state_schema=CustomAgentState,
    checkpointer=checkpointer,
)

# 自定义状态可以在 invoke 时传入
result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "你好"}],
        "user_id": "user_123",
        "preferences": {"theme": "dark"},
    },
    {"configurable": {"thread_id": "1"}},
)
```

工具可以通过 `ToolRuntime` 读写这些自定义状态字段。`ToolRuntime` 是一个隐藏参数——模型看不到它，但工具可以用它访问 Agent 的完整状态：

```python
from langchain.tools import tool, ToolRuntime

@tool
def get_user_info(runtime: ToolRuntime) -> str:
    """查询当前用户信息。"""
    user_id = runtime.state["user_id"]  # 从 Agent State 中读取
    # 根据 user_id 查询用户信息
    if user_id == "user_123":
        return "用户：张三，VIP 会员，偏好简洁风格"
    return "未知用户"

@tool
def update_preferences(new_theme: str, runtime: ToolRuntime):
    """更新用户偏好设置。"""
    from langgraph.types import Command
    from langchain.messages import ToolMessage

    current_prefs = runtime.state.get("preferences", {})
    current_prefs["theme"] = new_theme
    # 通过 Command 写回 Agent State
    return Command(update={
        "preferences": current_prefs,
        "messages": [
            ToolMessage("偏好已更新", tool_call_id=runtime.tool_call_id)
        ]
    })
```

关键点：`runtime.state` 是**读**状态，`Command(update={...})` 是**写**状态。这样工具不仅能返回结果给模型，还能直接修改 Agent 的短期记忆。

### CompositeBackend：长期记忆的核心方案

第 3 章我们已经介绍过 `CompositeBackend` 的概念——不同路径路由到不同后端。现在我们用它来实现长期记忆。

#### 运行时身份与 namespace

`StoreBackend` 通过 `namespace` 区分不同用户、Agent 或组织的数据。部署到 LangSmith / LangGraph Server 时，`rt.server_info` 可以提供 `assistant_id` 和登录用户信息；但在本地 `agent.invoke()` 或自托管环境中，`server_info` 可能为空。因此，示例代码最好先封装一层兜底逻辑：

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class MemoryContext:
    user_id: str = "local-user"
    org_id: str = "default-org"


def assistant_namespace(rt):
    if rt.server_info:
        return (rt.server_info.assistant_id,)
    return ("local-agent",)


def user_namespace(rt):
    if rt.server_info and rt.server_info.user:
        return (rt.server_info.user.identity,)
    user_id = getattr(rt.context, "user_id", "local-user")
    return (user_id,)


def org_namespace(rt):
    org_id = getattr(rt.context, "org_id", "default-org")
    return (org_id,)
```

本地调试时，可以通过 `context_schema=MemoryContext` 声明上下文，并在调用时传入：

```python
agent.invoke(
    {"messages": [{"role": "user", "content": "记住我喜欢简洁风格"}]},
    context=MemoryContext(user_id="user-123", org_id="org-acme"),
    config={"configurable": {"thread_id": "1"}},
)
```

#### Agent 级记忆（Agent-scoped）

Agent 级记忆在所有用户间**共享**。Agent 通过每次对话积累知识、完善自身。关键在于 namespace 设为 `(assistant_id,)`——同一个 Agent 的所有对话读写同一份记忆：

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    context_schema=MemoryContext,
    memory=["/memories/AGENTS.md"],          # 启动时自动加载的记忆文件
    skills=["/skills/"],                      # 程序性记忆（Skills）
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=assistant_namespace,
            ),
            "/skills/": StoreBackend(
                namespace=assistant_namespace,
            ),
        },
    ),
)
```

> `memory=` 参数接受一个路径列表，Agent 启动时会自动将这些文件内容加载到系统提示词中。这是 Deep Agents 0.5.0+ 的新特性——比手动在 system_prompt 里引导 Agent 读文件更优雅。

#### 用户级记忆（User-scoped）

每个用户拥有独立的记忆文件。namespace 使用 `(user_id,)` 确保 A 用户的偏好不会泄露给 B 用户：

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    context_schema=MemoryContext,
    memory=["/memories/preferences.md"],
    skills=["/skills/"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=user_namespace,
            ),
            "/skills/": StoreBackend(
                namespace=user_namespace,
            ),
        },
    ),
)
```

![记忆的三种作用域：Agent 级（所有用户共享 AGENTS.md）、用户级（按 user_id 隔离 preferences.md）、组织级（全组织共享 compliance.md，通常只读）](https://datawhalechina.github.io/deepagents-in-action/imgs/28-arch-scoped-memory.png)

#### 路径路由的工作方式

配置好 `CompositeBackend` 后，Agent 的文件操作会根据路径**自动路由**：

```python
# 临时文件 → StateBackend（对话结束后丢失）
write_file("/workspace/draft.txt", "草稿内容...")
write_file("/notes.txt", "临时笔记...")

# 持久化文件 → StoreBackend（跨对话保留）
write_file("/memories/preferences.md", "用户偏好：简洁代码风格")
write_file("/memories/project/tech-stack.md", "React + TypeScript")
```

对 Agent 来说，操作方式**完全一样**——都是调用同样的 `write_file`、`read_file` 工具。区别只在于路径前缀：以 `/memories/` 开头的文件会被持久化。

#### 跨对话访问

长期记忆的核心价值在于**跨线程可访问**：

```python
from langchain_core.utils.uuid import uuid7

# 对话 1：保存用户偏好
config1 = {"configurable": {"thread_id": str(uuid7())}}
agent.invoke({
    "messages": [{"role": "user", "content": "记住我的偏好：代码注释用中文，变量名用英文"}]
}, config=config1)
# Agent 将偏好写入 /memories/preferences.md

# 对话 2（全新的对话！）：读取之前保存的偏好
config2 = {"configurable": {"thread_id": str(uuid7())}}
agent.invoke({
    "messages": [{"role": "user", "content": "帮我写一个排序函数"}]
}, config=config2)
# Agent 读取 /memories/preferences.md，用中文注释、英文变量名
```

![跨对话记忆工作流程：对话 1 将偏好写入 /memories/，持久化存储保留数据，对话 2 读取之前保存的偏好——不同对话共享持久化文件](https://datawhalechina.github.io/deepagents-in-action/imgs/27-flowchart-cross-thread.png)

### 四种实用场景

#### 1. 用户偏好记忆

最直接的用法——让 Agent 记住用户的个人偏好：

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    context_schema=MemoryContext,
    memory=["/memories/preferences.md"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=user_namespace,
            ),
        },
    ),
)
```

Agent 启动时自动加载 `preferences.md`，当用户告诉它新偏好时，用 `edit_file` 更新。

#### 2. 自我改进的 Agent

Agent 可以根据用户反馈**更新自己的指令**：

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    context_schema=MemoryContext,
    memory=["/memories/AGENTS.md"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=assistant_namespace,
            ),
        },
    ),
)
```

随着时间推移，`AGENTS.md` 会不断积累从每次对话中学到的知识——Agent 发展出自己的专业能力、完善沟通风格，变得越来越"懂"这个领域。

#### 3. 知识库累积

跨多次对话逐渐构建知识库：

```python
# 对话 1：收集项目信息
# Agent 保存到 /memories/project/tech-stack.md

# 对话 2：补充更多信息
# Agent 读取已有内容，追加新的信息

# 对话 3：利用积累的知识
# Agent 基于完整的项目知识回答问题
```

#### 4. 研究项目持续推进

大型研究任务跨多次对话进行：

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    context_schema=MemoryContext,
    memory=[
        "/memories/research/sources.md",
        "/memories/research/notes.md",
        "/memories/research/report.md",
    ],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=user_namespace,
            ),
        },
    ),
)
```

Agent 启动时加载所有研究文件，每次对话结束后更新进度。多个 memory 路径让研究可以跨对话持续推进。

### 高级用法

#### 记忆的六个维度

官方文档将记忆系统拆分为六个可独立配置的维度：

| 维度 | 核心问题 | 选项 |
| --- | --- | --- |
| **持续时间** | 保留多久？ | 短期（单次对话）/ 长期（跨对话） |
| **信息类型** | 记什么？ | 情景记忆（过去经历）/ 程序性记忆（Skills）/ 语义记忆（事实） |
| **作用域** | 谁能看？ | 用户级 / Agent 级 / 组织级 |
| **更新策略** | 何时写入？ | 对话中（默认）/ 对话间（后台整合） |
| **检索方式** | 如何读取？ | 启动加载（memory=）/ 按需读取（Skills） |
| **权限控制** | Agent 能写吗？ | 读写（默认）/ 只读（共享策略） |

#### 组织级记忆（Organization-level）

组织级记忆跨所有用户和 Agent 共享，通常设为**只读**以防止注入攻击：

```python
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    context_schema=MemoryContext,
    memory=[
        "/memories/preferences.md",
        "/policies/compliance.md",
    ],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=user_namespace,
            ),
            "/policies/": StoreBackend(
                namespace=org_namespace,
            ),
        },
    ),
)
```

从应用代码中填充组织级记忆：

```python
from langgraph_sdk import get_client
from deepagents.backends.utils import create_file_data

client = get_client(url="<DEPLOYMENT_URL>")

await client.store.put_item(
    (org_id,),
    "/compliance.md",
    create_file_data("""## 合规政策
- 不得披露内部定价
- 金融建议必须附加免责声明
"""),
)
```

使用 [Permissions](https://docs.langchain.com/oss/python/deepagents/permissions) 确保组织级记忆只读。

#### 情景记忆（Episodic Memory）

情景记忆存储过去的**完整经历**——发生了什么、按什么顺序、结果如何。与语义记忆（事实和偏好）不同，情景记忆保留对话全貌，让 Agent 能回忆"如何解决问题"而不仅是"学到了什么"。

Deep Agents 的 Checkpointer 天然支持情景记忆——每次对话都被完整持久化。要让过去的对话变得可搜索，可以包装一个搜索工具：

```python
from langgraph_sdk import get_client
from langchain.tools import tool, ToolRuntime

client = get_client(url="<DEPLOYMENT_URL>")


def current_user_id(runtime: ToolRuntime) -> str:
    if runtime.server_info and runtime.server_info.user:
        return runtime.server_info.user.identity
    user_id = getattr(runtime.context, "user_id", None)
    if user_id:
        return user_id
    raise ValueError("需要在 server_info 或 runtime.context 中提供 user_id")


@tool
async def search_past_conversations(query: str, runtime: ToolRuntime) -> str:
    """搜索过去的对话以获取相关上下文。"""
    user_id = current_user_id(runtime)
    threads = await client.threads.search(
        metadata={"user_id": user_id},
        limit=5,
    )
    results = []
    for thread in threads:
        history = await client.threads.get_history(thread_id=thread["thread_id"])
        results.append(history)
    return str(results)
```

这对执行复杂多步任务的 Agent 尤为有用——比如代码 Agent 可以回溯上次调试过程，直接跳到可能的根因。

#### 后台记忆整合（Background Consolidation）

默认情况下 Agent 在对话中实时写入记忆（热路径）。另一种模式是在**对话间**后台处理——部署一个独立的"整合 Agent"来审查最近对话、提取关键事实、合并到记忆存储中：

| 方式 | 优点 | 缺点 |
| --- | --- | --- |
| **热路径**（对话中写入） | 即时可用，对用户透明 | 增加延迟，Agent 需同时处理多任务 |
| **后台整合**（对话间写入） | 无用户感知延迟，可跨多次对话综合 | 下次对话才可用，需额外 Agent |

整合 Agent 示例：

```python
from datetime import datetime, timedelta, timezone
from deepagents import create_deep_agent
from langchain.tools import tool, ToolRuntime
from langgraph_sdk import get_client

sdk_client = get_client(url="<DEPLOYMENT_URL>")


def current_user_id(runtime: ToolRuntime) -> str:
    if runtime.server_info and runtime.server_info.user:
        return runtime.server_info.user.identity
    user_id = getattr(runtime.context, "user_id", None)
    if user_id:
        return user_id
    raise ValueError("需要在 server_info 或 runtime.context 中提供 user_id")


@tool
async def search_recent_conversations(query: str, runtime: ToolRuntime) -> str:
    """搜索过去 6 小时内该用户的对话。"""
    user_id = current_user_id(runtime)
    since = datetime.now(timezone.utc) - timedelta(hours=6)
    threads = await sdk_client.threads.search(
        metadata={"user_id": user_id},
        updated_after=since.isoformat(),
        limit=20,
    )
    conversations = []
    for thread in threads:
        history = await sdk_client.threads.get_history(thread_id=thread["thread_id"])
        conversations.append(history["values"]["messages"])
    return str(conversations)

consolidation_agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    system_prompt="审查最近对话并更新用户记忆文件。合并新事实、移除过期信息、保持简洁。",
    tools=[search_recent_conversations],
)
```

用 Cron Job 定时触发：

```python
from langgraph_sdk import get_client

client = get_client(url="<DEPLOYMENT_URL>")

cron_job = await client.crons.create(
    assistant_id="consolidation_agent",
    schedule="0 */6 * * *",  # 每 6 小时
    input={"messages": [{"role": "user", "content": "整合最近的记忆。"}]},
)
```

> 注意：Cron 间隔必须与整合 Agent 的回溯窗口匹配。上例每 6 小时运行，Agent 也回溯 6 小时——两者必须同步。

#### 读写权限控制

| 权限 | 适用场景 | 实现方式 |
| --- | --- | --- |
| **读写**（默认） | 用户偏好、自我改进、Skills 学习 | Agent 通过 `edit_file` 更新 |
| **只读** | 组织策略、合规规则、共享知识库 | 应用代码写入 + Permissions 禁止 Agent 写入 |

安全注意事项：

- 如果一个用户能写入另一个用户读取的记忆，恶意用户可以注入指令
- **默认使用用户级 namespace** `(user_id,)`，除非有明确理由需要共享
- 共享策略用**只读模式**（通过应用代码填充，不让 Agent 写入）
- 敏感路径写入前添加 **Human-in-the-Loop** 审批

#### 并发写入

多个线程可以并行写入记忆，但对**同一文件**的并发写入可能产生 last-write-wins 冲突。对用户级记忆这种情况很少（用户通常一次只有一个活跃对话）。对 Agent 级或组织级记忆，考虑用后台整合来序列化写入，或将记忆按主题拆分成独立文件以减少冲突。

更稳妥的做法是把"写入热路径"和"整理冷路径"分开：

- **按主题拆文件**：把 `/memories/preferences.md`、`/memories/project/tech-stack.md`、`/memories/research/sources.md` 拆开，减少多个线程同时改同一文件的概率
- **追加式记录，再后台合并**：对话中先写入 `/memories/events/2026-xx-xx-thread-id.md` 这类追加日志，后台整合 Agent 定期去重、合并到稳定记忆文件
- **共享记忆只让后台任务写入**：Agent 级、组织级记忆尽量只读；普通对话只提交候选更新，由后台整合任务串行审核后写入
- **敏感记忆加审批**：涉及组织策略、安全规则、长期偏好覆盖时，用 Permissions 或 Human-in-the-Loop 阻止未经确认的直接覆盖

### 从开发到生产：Store 的升级路径

#### 开发阶段：InMemoryStore

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()  # 数据在内存中，重启丢失
```

适合本地开发和测试。优点是零配置，缺点是重启后数据丢失。

#### 生产阶段：PostgresStore

先安装 Postgres Store 依赖：

```bash
pip install langgraph-checkpoint-postgres
```

```python
from langgraph.store.postgres import PostgresStore
import os

with PostgresStore.from_conn_string(os.environ["DATABASE_URL"]) as store:
    # 第一次连接该数据库时调用，用于创建 Store 所需表结构
    store.setup()

    agent = create_deep_agent(
        model="google_genai:gemini-3.5-flash",
        context_schema=MemoryContext,
        memory=["/memories/AGENTS.md"],
        store=store,
        backend=CompositeBackend(
            default=StateBackend(),
            routes={
                "/memories/": StoreBackend(
                    namespace=assistant_namespace,
                ),
            },
        ),
    )
```

PostgresStore 提供真正的持久化——数据写入 PostgreSQL 数据库，即使应用重启也不会丢失。上面的 `with` 写法适合脚本和示例；如果是 Web 服务或常驻进程，通常在应用启动生命周期中初始化 Store，并在服务关闭时统一释放连接。

#### LangSmith 部署

如果通过 LangSmith 部署，**不需要手动配置 Store**——平台会自动为你的 Agent 配置持久化存储：

```python
# LangSmith 部署时，省略 store 参数
agent = create_deep_agent(
    model="google_genai:gemini-3.5-flash",
    context_schema=MemoryContext,
    memory=["/memories/AGENTS.md"],
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=assistant_namespace,
            ),
        },
    ),
    # store 由平台自动提供
)
```

### 文件存储格式与外部写入

通过 `StoreBackend` 存储的文件使用以下 JSON 格式。`deepagents>=0.5` 默认使用 v2 格式，`content` 是完整字符串，并通过 `encoding` 标明文本或二进制编码：

```json
{
    "content": "第一行\n第二行\n第三行",
    "encoding": "utf-8",
    "created_at": "2024-01-15T10:30:00Z",       # 创建时间
    "modified_at": "2024-01-15T11:45:00Z"       # 最后修改时间
}
```

旧版本中 `content` 可能是 `list[str]`，但该格式只是向后兼容。不要手写底层 JSON，Agent 外部（后端服务、初始化脚本）预填记忆时应使用 `create_file_data` 辅助函数：

```python
from deepagents.backends.utils import create_file_data
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# 预填 Agent 记忆
store.put(
    ("my-agent",),                          # namespace
    "/memories/AGENTS.md",                  # 文件路径
    create_file_data("""## Response style
- Keep responses concise
- Use code examples where possible
"""),
)

# 预填一个 Skill
store.put(
    ("my-agent",),
    "/skills/langgraph-docs/SKILL.md",
    create_file_data("""---
name: langgraph-docs
description: Fetch relevant LangGraph documentation to provide accurate guidance.
---

# langgraph-docs

Use the fetch_url tool to read https://docs.langchain.com/llms.txt, then fetch relevant pages.
"""),
)
```

> 使用 LangSmith 部署时，也可以通过 SDK 远程写入：`await client.store.put_item(namespace, key, value)`

### 最佳实践

#### 1. 使用描述性路径

给持久化文件起有意义的路径名，方便组织和检索：

```
/memories/AGENTS.md                 # Agent 自身知识（Agent-scoped）
/memories/preferences.md            # 用户偏好（User-scoped）
/memories/project/tech-stack.md     # 项目技术栈
/memories/research/topic-a/notes.md # 研究笔记
/policies/compliance.md             # 组织合规策略（只读）
```

#### 2. 用 `memory=` 声明而非 System Prompt

优先使用 `memory=` 参数声明记忆文件，而不是在 system_prompt 中引导 Agent 手动读取。前者让框架自动管理加载时机：

```python
# ✅ 推荐
agent = create_deep_agent(
    memory=["/memories/AGENTS.md", "/memories/preferences.md"],
    ...
)

# ❌ 不推荐（旧模式）
agent = create_deep_agent(
    system_prompt="启动时先读取 /memories/preferences.md...",
    ...
)
```

#### 3. 按主题拆分文件

将记忆按主题拆分成独立文件，而不是一个大文件。这减少并发写入冲突，也让 Agent 能按需加载特定主题。

#### 4. 多 Agent 部署隔离

在同一部署中运行多个 Agent 时，在 namespace 中加入 `assistant_id` 确保记忆互不干扰：

```python
StoreBackend(
    namespace=lambda rt: (
        assistant_namespace(rt)[0],
        user_namespace(rt)[0],
    ),
)
```

#### 5. 选择合适的 Store

| 场景 | 推荐 Store | 理由 |
| --- | --- | --- |
| 本地开发 | InMemoryStore | 零配置，快速迭代 |
| 生产环境 | PostgresStore | 真正持久化，可伸缩 |
| LangSmith 部署 | 平台自动配置 | 无需手动管理 |

#### 6. 用 LangSmith 审计记忆写入

每次文件写入都作为 tool call 出现在 LangSmith trace 中。对敏感记忆路径，开启 tracing 审计 Agent 写了什么。

### 小结

本章我们学习了 Deep Agents 的长期记忆能力：

1. **Memory 一等公民**：通过 `memory=` 参数声明记忆路径，Agent 启动时自动加载到系统提示词
2. **三种作用域**：Agent 级（共享知识）、用户级（个人偏好）、组织级（合规策略）
3. **CompositeBackend 路由**：`/memories/` 路径路由到 StoreBackend，namespace lambda 控制隔离粒度
4. **高级特性**：情景记忆（搜索过去对话）、后台整合（Cron + 整合 Agent）、读写权限控制
5. **升级路径**：InMemoryStore（开发）→ PostgresStore（生产）→ LangSmith 平台自动配置
6. **外部预填**：`store.put()` + `create_file_data()` 从应用代码初始化记忆和 Skills

下一章，我们将学习 Human-in-the-Loop——如何为敏感操作添加人工审批，构建安全的人机协作流程。

---

## 通用 Agent 设计视角 — 长期记忆

把 ch08 的具体实现抽离出来，看 Agent 系统中"持久化知识"这个子系统的**通用设计模式**。

### 1. 记忆是分层级的

任何需要"跨时间"工作的 Agent，都需要把记忆按**持续时间**拆成至少两层：

```
短期（单次会话）    ——  临时、量大、对话内可丢弃
  └─ 任务上下文、当前对话历史、过程产物

长期（跨会话）      ——  精选、量小、需要治理
  └─ 用户偏好、累积知识、学到的指令
```

**设计启示**：短期层追求"完整保真"（不能丢过程信息），长期层追求"精炼可检索"（不能有冗余）。两者的存储策略、读写权限、淘汰机制完全不同——**不能混在同一个存储里**。

### 2. 命名空间是隔离的最小单位

长期记忆一旦被多个主体共享，就必须有隔离机制。Agent 系统中通常用 **namespace（命名空间）** 这个抽象：

| 隔离维度 | 命名空间内容 | 典型用途 |
| --- | --- | --- |
| **用户级** | `(user_id,)` | 个人偏好、个人草稿 |
| **Agent 级** | `(assistant_id,)` | Agent 自身积累的知识 |
| **组织级** | `(org_id,)` | 团队规范、共享知识库 |
| **混合级** | `(assistant_id, user_id,)` | 同一部署多 Agent 多用户互不干扰 |

**核心原则**：

1. **默认用最细粒度的 namespace**（用户级），需要共享时再升级粒度
2. **namespace 是元数据，不是文件内容**——所有同名文件在不同 namespace 下是完全独立的数据
3. **升级粒度意味着扩大攻击面**——共享越多，被注入/污染的风险越大

### 3. 路径路由：让 Agent 无感

最优雅的"短期 vs 长期"切换，不是让 Agent 调不同的 API，而是**根据路径前缀自动路由**：

```
/workspace/   →  临时存储（StateBackend）    对话结束清空
/notes/       →  临时存储
/memories/    →  持久化存储（StoreBackend）  跨对话保留
/policies/    →  持久化存储 + 只读权限
```

**对 Agent 而言，永远只调 `write_file` / `read_file` 同一个工具接口，路径前缀就是"分类标签"**。

**设计启示**：

- 用**约定优于配置**：路径前缀就是"该存哪"的暗示
- 用**层级命名反映主题**：`/memories/project/tech-stack.md` 比 `/project_tech.md` 更易治理
- 路由层应该是**可插拔后端**——业务代码不知道"持久化"具体是 Postgres、Redis 还是 S3

### 4. 加载策略：自动 vs 按需

长期记忆不可能一次性全塞进上下文，必须有**分级加载**：

| 策略 | 触发时机 | 适合内容 | 风险 |
| --- | --- | --- | --- |
| **启动加载**（`memory=`） | 每次 Agent 启动时 | 必读的核心知识（用户偏好、安全规则） | 数量失控会撑爆上下文 |
| **按需读取**（Skills / 工具调用） | Agent 推理时决定 | 专业领域文档、参考资料 | 检索不准会导致漏读 |
| **混合** | 核心自动 + 长尾按需 | 真实生产环境 | 实现复杂度上升 |

**设计启示**：

- 把"必读"和"按需"在**配置层分开声明**（`memory=` vs `skills=`），不要让 Agent 自己判断
- 自动加载的内容要做**大小硬限制**（如 5000 tokens），超出就拆文件或转按需

### 5. 热写 vs 冷整合

长期记忆的写入策略，业界分两派：

```
热路径（对话中实时写入）            冷路径（对话间后台整合）
  ├─ 优点：即时可用                  ├─ 优点：无用户感知延迟
  ├─ 缺点：增加对话延迟              ├─ 缺点：下次对话才生效
  └─ 适用：少量关键信息              └─ 适用：批量信息整合
```

**生产级设计**通常是**混合模式**：

- 对话中只做**轻量追加**（写到事件日志 `/memories/events/<date>-<thread>.md`）
- 后台整合 Agent 定期**去重、合并、清理**事件日志 → 写入稳定记忆
- 关键记忆（涉及覆盖、删除）走 **Human-in-the-Loop** 审批

**为什么需要冷路径？**因为：

1. 对话中实时合并多个事实非常消耗 token
2. 实时写入的"重要性判断"质量不高（Agent 还在对话中，没空反思）
3. 后台可以**批量、异步、可重试**，质量更高

### 6. 并发与一致性

长期记忆通常是**多线程并发写**的，必须设计冲突处理策略：

| 策略 | 做法 | 适用场景 |
| --- | --- | --- |
| **Last-Write-Wins** | 后写覆盖先写 | 用户级记忆（单用户低并发） |
| **主题拆分** | 按主题拆文件，缩小冲突面 | Agent 级知识库 |
| **追加式 + 整合** | 先追加日志，再后台整合 | 组织级 / 共享记忆 |
| **Human-in-the-Loop** | 关键变更走审批 | 涉及覆盖/删除的敏感操作 |

**设计启示**：把"高并发低风险"（用户级）和"低并发高风险"（组织级）的策略**分开设计**——前者追求性能，后者追求可控。

### 7. 记忆类型三分类

把"记什么"这个问题抽象出来，对应人类认知的三种记忆：

| 类型 | 记什么 | 类比人类 | Agent 中的实现 |
| --- | --- | --- | --- |
| **语义记忆** | 事实、概念、偏好 | "我知道 Python 是动态类型" | 记忆文件 + 检索 |
| **情景记忆** | 过去的具体经历 | "我上次怎么 debug 那个 bug" | Checkpointer + 对话搜索工具 |
| **程序性记忆** | "如何做"的技能 | "我会骑自行车" | Skills 机制 |

**设计启示**：三者在 Agent 系统中是**完全不同的技术实现**——用同一种存储（同一种 schema）会丢信息。**对 Agent 来说，三者要分系统设计，不能揉在一起。**

### 8. 从开发到生产的演进路径

任何持久化子系统都有一条**自然的升级路径**：

```
开发自测                  小规模内测                 生产部署
  │                          │                         │
  ▼                          ▼                         ▼
InMemoryStore           PostgresStore            平台托管 Store
(进程内、零配置)         (单实例、本地)            (跨实例、自动扩缩)
```

**设计启示**：

- **接口先行**：先用 `StoreBackend` 这种抽象接口，写业务代码
- **后端可换**：开发用 InMemory，测试用 Postgres，生产用 LangSmith 托管——**业务代码一行不改**
- **平台接管是终极形态**：当部署到托管平台时，存储细节完全透明——这就是"无服务器存储"的设计目标

### 9. 记忆的治理清单

设计任何长期记忆子系统前，问自己这 10 个问题：

1. **分层了吗？** 短期和长期是否物理隔离？
2. **命名空间粒度？** 默认用户级还是 Agent 级还是组织级？
3. **路径语义？** 是否用路径前缀暗示存储类型？
4. **加载策略？** 启动加载 vs 按需读取 vs 混合？
5. **写入策略？** 热路径实时写 vs 冷路径后台整合？
6. **并发模型？** 是否设计了冲突处理（拆分/追加/审批）？
7. **记忆类型？** 语义/情景/程序性是否分开存储？
8. **权限模型？** 哪些记忆只读？哪些需要审批？
9. **生命周期？** 是否有淘汰/合并/归档机制？
10. **可观测性？** 记忆写入是否可审计（trace / log）？

### 10. 核心心智模型

> **长期记忆 = 命名空间 + 路径路由 + 加载策略 + 治理规则。**
>
> 它是 Agent 系统中"让知识跨越对话边界持续存在"的子系统——通过**分层存储**（短期/长期）、**多维隔离**（namespace）、**路径约定**（/memories/）、**分级加载**（自动/按需），把"过程信息"和"沉淀知识"清晰分开。
>
> 本质上，它是 **Agent 世界里的"知识库 + 知识图谱 + 记忆宫殿"**——把"无限生成的过程"压缩成"有限精选的知识"，并让它在时间维度上持续累积。

## Human-in-the-Loop — 构建安全的人机协作流程

> Agent 越自主，就越需要安全边界。当 Agent 准备删除文件、发送邮件或调用付费 API 时，你是否希望它先"问一声"？本章学习 Human-in-the-Loop（人机协作），为敏感操作添加人工审批。

### 为什么需要 Human-in-the-Loop？

Agent 的自主性是一把双刃剑：

- **好处**：能独立完成复杂任务，减少人工干预
- **风险**：可能执行危险操作——删错文件、发错邮件、调用昂贵的 API

在实际项目中，完全自主和完全人工之间，需要一个**可控的中间地带**：

- 删除文件前，先让用户确认
- 发送邮件前，让用户检查收件人和内容
- 修改生产配置前，必须获得审批

这就是 Human-in-the-Loop（HITL）——Agent 在执行特定操作前**暂停**，等待人类**审批、修改、拒绝或直接响应**，然后再继续执行。

### `interrupt_on` 配置

Deep Agents 通过 `interrupt_on` 参数配置哪些工具需要人工审批。设置后，Deep Agents 会在默认中间件栈中加入 `HumanInTheLoopMiddleware`；如果运行在工具返回前被中断或取消，同一栈里的 `PatchToolCallsMiddleware` 会自动修复消息历史。

```python
import os
from langchain_openai import ChatOpenAI
from langchain.tools import tool
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

model = ChatOpenAI(
    model=os.environ.get("MODEL_NAME", "Pro/zai-org/GLM-5.1"),
    api_key=os.environ["SILICONFLOW_API_KEY"],
    base_url="https://api.siliconflow.cn/v1",
)

@tool
def delete_file(path: str) -> str:
    """删除指定文件。"""
    return f"已删除 {path}"

@tool
def read_file(path: str) -> str:
    """读取文件内容。"""
    return f"{path} 的内容..."

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """发送邮件。"""
    return f"邮件已发送至 {to}"

# Checkpointer 是 HITL 的必要条件
checkpointer = MemorySaver()

agent = create_deep_agent(
    model=model,
    tools=[delete_file, read_file, send_email],
    interrupt_on={
        "delete_file": {"allowed_decisions": ["approve", "edit", "reject"]},
        "read_file": False,    # 无需中断
        "send_email": {"allowed_decisions": ["approve", "reject"]},  # 只能审批或拒绝，不能修改
    },
    checkpointer=checkpointer,  # 必须配置！
)
```

#### 三种配置值

| 配置值 | 含义 |
| --- | --- |
| `True` | 启用中断，允许所有决策（approve / edit / reject / respond） |
| `False` | 不中断，Agent 直接执行 |
| `{"allowed_decisions": [...]}` | 启用中断，只允许指定的决策类型 |

#### 四种决策类型

| 决策 | 含义 | 场景 |
| --- | --- | --- |
| `approve` | 批准执行，使用 Agent 提出的原始参数 | "确认删除这个文件" |
| `edit` | 修改参数后执行 | "收件人改一下再发" |
| `reject` | 跳过此次工具调用，并把拒绝原因反馈给 Agent | "不要删除，取消" |
| `respond` | 不执行工具，把人的 `message` 当作一次成功的合成工具结果返回 | `ask_user` 这类"询问用户"工具 |

注意：**拒绝副作用工具时用 `reject`，不要用 `respond`**。`respond` 的内容会被模型当作一次成功的 ToolMessage，更适合人类临时代替工具回答问题；删除文件、发送邮件、部署上线这类工具应该用 `reject` 明确告诉 Agent 工具没有执行。

可以把它记成三条规则：

- **不同意执行**：用 `reject`，并在 `message` 里说明原因和下一步
- **同意但要改参数**：用 `edit`，只修改必要参数
- **工具本来就是问人**：用 `respond`，让人的回答成为工具结果

### 条件中断：只拦截真正危险的调用

默认情况下，只要工具名出现在 `interrupt_on` 里，每次调用都会暂停。如果你只想拦截某些参数组合，可以在配置中加入 `when` 谓词函数。该函数接收 `ToolCallRequest`，返回 `True` 表示中断，返回 `False` 表示自动放行。

> 条件中断需要 `langchain>=1.3.3`。

```python
from deepagents import create_deep_agent
from langchain.agents.middleware import ToolCallRequest
from langgraph.checkpoint.memory import MemorySaver


def writes_outside_workspace(request: ToolCallRequest) -> bool:
    """只有写入工作区外的路径时才暂停。"""
    path = request.tool_call["args"].get("file_path", "")
    return not path.startswith("/workspace/")


agent = create_deep_agent(
    model=model,
    interrupt_on={
        "write_file": {
            "allowed_decisions": ["approve", "edit", "reject"],
            "when": writes_outside_workspace,
        },
    },
    checkpointer=MemorySaver(),
)
```

当 `when` 返回 `False` 时，这次工具调用不会加入中断批次；审批界面只需要展示真正需要人工决策的动作。

### 中断与恢复：完整流程

当 Agent 调用一个配置了 `interrupt_on` 的工具时，执行流程变为：

**1. Agent 正常运行，直到调用敏感工具**
**2. 执行暂停，返回中断信息**
**3. 用户检查中断内容，做出决策**
**4. 用相同的 `thread_id` 恢复执行**

![Human-in-the-Loop 执行流程：Agent 运行 → 判断是否中断 → 用户决策（approve/edit/reject/respond）→ 执行工具或返回 ToolMessage → 恢复执行](https://datawhalechina.github.io/deepagents-in-action/imgs/17-flowchart-hitl-flow.png)

代码实现：

```python
import uuid
from langgraph.types import Command

# 创建一个 thread_id（恢复时必须使用同一个）
config = {"configurable": {"thread_id": str(uuid.uuid4())}}

# Step 1: 发起请求
result = agent.invoke(
    {"messages": [{"role": "user", "content": "删除 temp.txt 文件"}]},
    config=config,
    version="v2",
)

# Step 2: 检查是否中断
if result.interrupts:
    interrupt_value = result.interrupts[0].value
    action_requests = interrupt_value["action_requests"]
    review_configs = interrupt_value["review_configs"]
    config_map = {cfg["action_name"]: cfg for cfg in review_configs}

    # 展示给用户
    for action in action_requests:
        review_config = config_map[action["name"]]
        args = action.get("arguments", action.get("args", {}))
        print(f"工具: {action['name']}")
        print(f"参数: {args}")
        print(f"可选决策: {review_config['allowed_decisions']}")

    # Step 3: 用户做出决策
    decisions = [
        {"type": "approve"}  # 用户批准删除
    ]

    # Step 4: 恢复执行（必须用相同的 config！）
    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,     # 同一个 thread_id
        version="v2",
    )

# 获取最终结果
print(result.value["messages"][-1].content)
```

#### 关键要求

- **必须配置 Checkpointer**：HITL 依赖状态持久化，没有 Checkpointer 无法恢复
- **必须使用相同的 `thread_id`**：中断和恢复必须在同一个线程中
- **必须使用 `version="v2"`**：HITL 需要 v2 版本的 invoke 接口
- **决策数量和顺序必须匹配**：`decisions` 要和 `action_requests` 一一对应，顺序不能乱

> 字段名说明：Deep Agents 文档示例里常见 `action_request["args"]`，LangChain 标准 `HumanInTheLoopMiddleware` 示例里展示的是 `action_request["arguments"]`。如果你的审批界面要兼容两种入口，可以像上面的代码一样读取 `arguments`，没有时再回退到 `args`。但恢复 `edit` 决策时，`edited_action` 仍然使用 `args`。

### 拒绝时写清楚反馈

当用户返回 `reject` 时，Deep Agents 会跳过该工具调用，并把拒绝反馈返回给 Agent。如果不传 `message`，默认反馈会告诉模型工具没有执行、不要重复调用同一个工具。对于敏感工具，建议写清楚下一步应该怎么做：

```python
decisions = [{
    "type": "reject",
    "message": "用户拒绝删除该文件。不要再次尝试删除，请询问是否改为归档文件。",
}]
```

### 直接响应：只用于问用户的工具

`respond` 不是"软拒绝"，而是"人类亲自返回工具结果"。它适合专门设计成占位的 `ask_user` 工具：工具调用本身不执行，人的回答直接作为成功的工具结果交还给 Agent。

```python
from langchain.tools import tool


@tool
def ask_user(question: str) -> str:
    """向用户提问；真实回答由 HITL 的 respond 决策提供。"""
    return "等待用户回答"


agent = create_deep_agent(
    model=model,
    tools=[ask_user],
    interrupt_on={
        "ask_user": {"allowed_decisions": ["respond"]},
    },
    checkpointer=checkpointer,
)

decisions = [{
    "type": "respond",
    "message": "使用季度维度，并排除测试数据。",
}]
```

这里的 `message` 会被 Agent 当作 `ask_user` 的成功返回值。如果人的意思是"不要执行删除/发送/部署"，仍然应该用 `reject`；如果只是改收件人、路径或 SQL 条件，应该用 `edit`。

### 编辑工具参数

当决策类型包含 `edit` 时，用户可以修改工具的参数再执行：

```python
if result.interrupts:
    interrupt_value = result.interrupts[0].value
    action_request = interrupt_value["action_requests"][0]

    # Agent 原始参数
    original_args = action_request.get("arguments", action_request.get("args", {}))
    print(original_args)
    # {"to": "all@example.com", "subject": "通知", "body": "..."}

    # 用户决定修改收件人
    decisions = [{
        "type": "edit",
        "edited_action": {
            "name": action_request["name"],  # 必须包含工具名
            "args": {
                "to": "team@example.com",    # 修改后的收件人
                "subject": "通知",
                "body": "...",
            }
        }
    }]

    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v2",
    )
```

编辑时尽量只做保守修改，例如改收件人、路径或 SQL 条件。大幅改写工具参数可能让模型重新评估原计划，进而重复调用工具或走向你没有预期的动作。

### 批量工具调用的中断处理

当 Agent 同时调用多个需要审批的工具时，所有中断会**打包成一个**。你需要按顺序为每个工具提供决策：

```python
# 用户请求："删除 temp.txt 并发邮件通知 admin"
result = agent.invoke(
    {"messages": [{"role": "user", "content": "删除 temp.txt 并发邮件通知 admin@example.com"}]},
    config=config,
    version="v2",
)

if result.interrupts:
    action_requests = result.interrupts[0].value["action_requests"]
    # action_requests[0] = delete_file(path="temp.txt")
    # action_requests[1] = send_email(to="admin@example.com", ...)

    # 按顺序提供决策
    decisions = [
        {"type": "approve"},  # 批准删除
        {
            "type": "reject",
            "message": "用户拒绝发送邮件。不要重试这次发送动作。",
        },
    ]

    result = agent.invoke(
        Command(resume={"decisions": decisions}),
        config=config,
        version="v2",
    )
```

### 子 Agent 的中断配置

子 Agent 可以有**独立的** `interrupt_on` 配置，覆盖主 Agent 的设置：

```python
agent = create_deep_agent(
    model=model,
    tools=[delete_file, read_file],
    interrupt_on={
        "delete_file": True,
        "read_file": False,    # 主 Agent 读文件不需要审批
    },
    subagents=[{
        "name": "file-manager",
        "description": "管理文件操作",
        "system_prompt": "你是文件管理助手。",
        "tools": [delete_file, read_file],
        "interrupt_on": {
            "delete_file": True,
            "read_file": True,  # 子 Agent 读文件也需要审批！
        }
    }],
    checkpointer=checkpointer,
)
```

这样设计的场景很实际：主 Agent 是你信任的，但子 Agent 可能操作更敏感的数据，需要更严格的审批策略。

### 按风险等级分层的最佳实践

不是所有工具都需要同等程度的审批。推荐按风险等级分三层配置：

```python
interrupt_on = {
    # === 高风险：审批 + 修改 + 拒绝，不开放 respond ===
    "delete_file": {"allowed_decisions": ["approve", "edit", "reject"]},
    "send_email": {"allowed_decisions": ["approve", "edit", "reject"]},
    "execute_sql": {"allowed_decisions": ["approve", "edit", "reject"]},
    "deploy_to_production": {"allowed_decisions": ["approve", "edit", "reject"]},

    # === 中风险：审批或拒绝（不允许修改参数）===
    "write_file": {"allowed_decisions": ["approve", "reject"]},
    "call_external_api": {"allowed_decisions": ["approve", "reject"]},

    # === 低风险：无需中断 ===
    "read_file": False,
    "ls": False,
    "grep": False,
    "glob": False,

    # === 人工输入型：人类就是工具结果 ===
    "ask_user": {"allowed_decisions": ["respond"]},
}
```

![按风险等级分层配置：低风险（只读，无需中断）→ 中风险（写入，审批/拒绝）→ 高风险（删除/发送，完全控制）](https://datawhalechina.github.io/deepagents-in-action/imgs/18-infographic-risk-levels.png)

| 风险等级 | 工具类型 | 配置 | 理由 |
| --- | --- | --- | --- |
| 高风险 | 删除、发送、部署 | `approve/edit/reject` | 操作不可逆或影响外部系统，避免 `respond` 被误当成成功结果 |
| 中风险 | 写入、外部调用 | `approve/reject` | 可审批但不需要修改参数 |
| 低风险 | 读取、搜索、列表 | `False` | 只读操作，安全无副作用 |
| 人工输入型 | 询问偏好、补充缺失信息 | `respond` | 工具本来就是让人回答，人的 `message` 会成为成功工具结果 |

### 文件系统权限中断

除了 `interrupt_on`，Deep Agents 的内置文件系统工具也可以通过权限规则触发中断。这个能力需要 `deepagents>=0.6.8`。当 `write_file` 或 `edit_file` 命中 `mode="interrupt"` 的权限规则时，Deep Agents 会抛出和普通工具审批相同格式的 HITL 中断：

```python
from deepagents import FilesystemPermission, create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

agent = create_deep_agent(
    model=model,
    permissions=[
        FilesystemPermission(
            operations=["write"],
            paths=["/secrets/**"],
            mode="interrupt",
        ),
    ],
    checkpointer=MemorySaver(),
)
```

恢复方式和普通工具一致：检查 `result.interrupts[0].value["action_requests"]`，然后用 `Command(resume={"decisions": [...]})` 继续执行。文件系统权限中断会和你传入的 `interrupt_on` 合并，因此一次人工审查可以同时覆盖自定义工具和受保护文件路径。

### 揭开引擎盖：LangGraph 的中断机制

`interrupt_on` 的底层是 LangGraph 的**中断（Interrupt）**原语。当你在工具中直接调用 `interrupt()` 函数时，可以实现更灵活的审批逻辑：

```python
from langgraph.types import interrupt

@tool
def request_approval(action_description: str) -> str:
    """请求人工审批。"""
    # interrupt() 暂停执行，返回值是 Command(resume=...) 传入的数据
    approval = interrupt({
        "type": "approval_request",
        "action": action_description,
        "message": f"请审批：{action_description}",
    })

    if approval.get("approved"):
        return f"操作 '{action_description}' 已获批准，继续执行..."
    else:
        reason = approval.get("reason", "未提供原因")
        return f"操作 '{action_description}' 被拒绝，原因：{reason}"
```

恢复时传入审批结果：

```python
# 审批通过
result = agent.invoke(
    Command(resume={"approved": True}),
    config=config,
    version="v2",
)

# 审批拒绝
result = agent.invoke(
    Command(resume={"approved": False, "reason": "时机不对，延后执行"}),
    config=config,
    version="v2",
)
```

`interrupt()` 是 LangGraph 的底层能力，`interrupt_on` 是 Deep Agents 在此基础上封装的更易用的配置接口。

#### 运行时视角：一次中断到底保存了什么？

从 LangGraph 的运行时机制看，`interrupt()` 不是普通的 `input()`。它会把控制权从图执行器交还给调用方，并把恢复所需的信息保存下来：

1. 当前节点调用 `interrupt(value)`
2. 运行时把 `value` 包装成 `Interrupt` 对象，里面包含给人类审查的数据和一个稳定的 `id`
3. 运行时通过 Checkpointer 保存当前线程状态、下一步节点、待恢复中断等信息
4. 这次执行暂停，调用方拿到 `stream.interrupts` 或 `result.interrupts`
5. 人类返回 `Command(resume=...)`
6. 运行时根据同一个 `thread_id` 找回 checkpoint，把恢复值送回对应的 `interrupt()` 调用

所以，HITL 的关键不是"弹一个确认框"，而是让工作流在任意时间跨度后仍然能安全恢复：几秒后恢复、几小时后恢复，甚至换一个进程恢复，只要 Checkpointer 还在、`thread_id` 还一致。

![LangGraph 中断机制：节点调用 interrupt() 后生成中断对象，Checkpointer 保存状态，人类用 Command(resume=...) 返回结果，并通过同一 thread_id 恢复执行，恢复时节点会从头重放](https://datawhalechina.github.io/deepagents-in-action/imgs/29-flowchart-interrupt-state-resume.png)

#### 单个中断 vs 并行中断

如果同一时间只有一个 `interrupt()` 暂停，`Command(resume=...)` 可以直接传入一个值：

```python
from langgraph.types import Command

# interrupt("是否继续？") 的返回值会变成 "yes"
graph.invoke(Command(resume="yes"), config=config)
```

但如果并行分支同时触发多个中断，就不要依赖顺序了。更稳妥的做法是用 `Interrupt.id` 建立映射：

```python
from langgraph.types import Command

# stream.interrupts = (Interrupt(value="question_a", id="..."),
#                      Interrupt(value="question_b", id="..."))
resume_map = {
    intr.id: f"answer for {intr.value}"
    for intr in stream.interrupts
}

graph.invoke(Command(resume=resume_map), config=config)
```

这就是运行机制比界面呈现更底层的地方：界面可以显示成两个审批卡片，但恢复时最好让每个答案绑定到自己的中断 ID，避免并行节点、子图或重排导致回答错配。

#### 如何检查暂停在哪里？

当图暂停后，你可以查看 thread 的状态快照。状态快照通常包含：

- `values`：当前图状态
- `next`：下一步待执行节点
- `interrupts`：当前 step 中待解决的 `Interrupt` 对象
- `checkpoint`：当前 checkpoint 标识

在本地 `CompiledStateGraph` 里，可以用同一个 config 查询：

```python
snapshot = graph.get_state(config)

print(snapshot.values)      # 当前状态
print(snapshot.next)        # 下一步节点
print(snapshot.interrupts)  # 待处理的中断
```

在 LangGraph Platform / SDK 场景，则可以通过 thread API 查询同一件事：

```python
thread_state = client.threads.get_state(thread_id="thread-1")
print(thread_state["values"])
print(thread_state["next"])
```

这对排查"为什么没有继续执行"很有用：如果 `interrupts` 还在，说明还缺 resume；如果 `thread_id` 不对，你看到的会是另一个线程的状态。

#### `interrupt()` 的工作原理

理解 `interrupt()` 的内部机制，能帮你避免常见的坑：

1. **暂停方式**：`interrupt()` 通过**抛出一个特殊异常**来暂停执行。这个异常会沿调用栈向上传播，被 LangGraph 运行时捕获
2. **状态保存**：运行时通过 Checkpointer 保存当前图状态（消息、文件、任务清单等）
3. **恢复方式**：当你调用 `Command(resume=...)` 时，LangGraph 加载保存的状态，**从节点的开头重新执行**
4. **返回值**：`Command(resume=...)` 中的值成为 `interrupt()` 的返回值

关键点在第 3 步：**恢复时节点从头重新执行**，而不是从 `interrupt()` 那一行继续。这意味着 `interrupt()` 之前的代码会**再跑一次**。

#### `interrupt()` 的使用规则

基于上面的原理，有几条重要的规则：

**规则 1：不要用 try/except 包裹 interrupt()**

因为 `interrupt()` 通过异常暂停，裸的 `try/except` 会吞掉这个异常：

```python
# ❌ 错误：裸 except 会捕获 interrupt 异常
try:
    result = interrupt("请审批")
except Exception as e:
    print(e)  # 这会吞掉 interrupt！

# ✅ 正确：使用具体的异常类型
try:
    result = interrupt("请审批")
    fetch_data()
except NetworkError as e:  # 只捕获特定异常
    print(e)
```

**规则 2：interrupt() 之前的副作用必须是幂等的**

因为恢复时节点从头执行，`interrupt()` 之前的代码会再跑一次：

```python
# ❌ 错误：interrupt 前创建记录，恢复时会创建重复记录
def node(state):
    db.create_log("操作开始")  # 每次恢复都会再创建一条！
    approved = interrupt("请审批")
    return {"approved": approved}

# ✅ 正确：用 upsert（幂等操作），或把副作用放到 interrupt 之后
def node(state):
    approved = interrupt("请审批")
    if approved:
        db.create_log("操作已审批")  # 只在审批后执行一次
    return {"approved": approved}
```

**规则 3：不要动态改变 interrupt() 的调用顺序**

同一个节点中多个 `interrupt()` 的匹配是**按索引**的：

```python
# ✅ 正确：每次执行顺序一致
def node(state):
    name = interrupt("你叫什么名字？")
    age = interrupt("你多大了？")
    return {"name": name, "age": age}

# ❌ 错误：条件跳过会导致索引错位
def node(state):
    name = interrupt("你叫什么名字？")
    if state.get("need_age"):     # 这个条件可能在恢复时变化！
        age = interrupt("你多大了？")
    city = interrupt("你在哪个城市？")  # 索引错位
```

**规则 4：并行中断用 ID 映射恢复**

同一个节点内多个 `interrupt()` 依赖调用顺序；多个并行节点同时中断时，应该用 `Interrupt.id` 映射恢复值：

```python
resume = {
    intr.id: ui_answers[intr.id]
    for intr in stream.interrupts
}

graph.invoke(Command(resume=resume), config=config)
```

这样界面可以自由排序审批卡片，但恢复执行时仍然知道每个答案属于哪一个中断。

**规则 5：resume 之后会从节点开头重放**

这条和规则 2 类似，但更偏底层执行机制：恢复不是从 `interrupt()` 的下一行继续执行，而是加载 checkpoint 后重放当前节点。`interrupt()` 会用已有恢复值直接返回，不再暂停。

因此，节点代码要能承受"中断前逻辑被再次执行"。凡是不能重复执行的动作，都应该放在 `interrupt()` 之后，或者做成幂等操作。

#### 更多模式：输入验证

如果要做人类输入校验，不要在同一个节点里写 `while True` 然后反复调用 `interrupt()`。因为每次恢复都会从节点开头重放，循环里的前几轮也会跟着重跑，输入越多，重复执行越明显。

更稳的做法是：每次节点执行只调用一次 `interrupt()`，把下一轮要问的问题写回状态，再用条件边决定是否回到同一个节点：

```python
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt


class FormState(TypedDict):
    age: int | None
    pending_question: str | None


def collect_age(state: FormState):
    question = state.get("pending_question") or "请输入你的年龄："
    answer = interrupt(question)  # 每次节点执行只暂停一次

    if isinstance(answer, int) and answer > 0:
        return {"age": answer, "pending_question": None}

    return {
        "pending_question": f"'{answer}' 不是有效年龄，请输入正整数。"
    }


def route(state: FormState):
    return END if state.get("age") is not None else "collect_age"


builder = StateGraph(FormState)
builder.add_node("collect_age", collect_age)
builder.add_edge(START, "collect_age")
builder.add_conditional_edges("collect_age", route)
```

这样每次恢复只处理一次回答。回答无效时，图通过条件边回到 `collect_age`，下一次中断会展示更新后的提示；回答有效时，流程结束。

#### 静态中断：调试利器

除了 `interrupt()` 函数（动态中断），LangGraph 还支持**静态中断**——在编译时指定哪些节点前后暂停，用于调试：

```python
# 在 node_a 之前暂停，在 node_b 之后暂停
graph = builder.compile(
    interrupt_before=["node_a"],
    interrupt_after=["node_b"],
    checkpointer=checkpointer,
)

config = {"configurable": {"thread_id": "debug-001"}}
graph.invoke(inputs, config=config)   # 执行到 node_a 前暂停
graph.invoke(None, config=config)     # 传入 None 继续执行
```

静态中断适合开发阶段的逐步调试，**不推荐**用于生产环境的人机协作——那应该用 `interrupt()` 函数。

#### 什么时候直接使用底层 interrupt()？

Deep Agents 的 `interrupt_on` 已经覆盖了大多数"工具调用前审批"场景。只有当你要控制**图节点级别**的流程时，才需要直接使用 `interrupt()`：

| 场景 | 推荐方式 | 原因 |
| --- | --- | --- |
| 给某个工具加审批 | `interrupt_on` | 配置简单，自动生成 action request 和 ToolMessage |
| 按工具参数决定是否审批 | `interrupt_on` + `when` | 保留 Deep Agents 的工具审查格式 |
| 在节点中收集缺失信息 | 直接调用 `interrupt()` | 不是工具审批，而是业务流程缺字段 |
| 做多轮表单/输入验证 | 直接调用 `interrupt()` + 条件边 | 每次只暂停一次，无效输入通过状态回路重新提问 |
| 调试图执行路径 | `interrupt_before` / `interrupt_after` | 静态断点不需要改节点代码 |
| 并行人工任务汇总 | 底层 `interrupt()` + ID 到恢复值映射 | 需要精确绑定多个并行中断 |

理解了这些底层机制，你就可以构建更复杂的审批工作流——多级审批、条件审批、带验证的人工输入、并行人工任务，甚至跨子图的中断传播。

### 小结

本章我们学习了 Deep Agents 的人机协作能力：

1. **为什么需要 HITL**：Agent 越自主，越需要安全边界——敏感操作前暂停，等待人类决策
2. **`interrupt_on` 配置**：按工具名映射中断策略，四种决策类型（approve / edit / reject / respond）
3. **条件中断**：用 `when` 谓词只拦截真正需要人工审查的工具调用
4. **中断与恢复流程**：Agent 暂停 → 用户决策 → `Command(resume=...)` 恢复，必须同一个 `thread_id`
5. **子 Agent 独立配置**：子 Agent 可以有比主 Agent 更严格的审批策略
6. **按风险分层**：高风险审批/修改/拒绝、中风险审批/拒绝、低风险无需中断
7. **文件系统权限中断**：用 `FilesystemPermission(..., mode="interrupt")` 保护敏感路径
8. **底层机制**：`interrupt()` 通过异常暂停 + Checkpointer 保存状态 + 恢复时节点从头执行。核心规则：不要裸 try/except、副作用要幂等、不要动态改变调用顺序，并行中断用 ID 映射恢复
9. **扩展模式**：输入验证（单次 interrupt + 条件边回到节点）、静态中断（调试用 interrupt_before/after）

下一章，我们将学习沙箱执行——让 Agent 在受控环境中安全地运行代码。

---

## 通用 Agent 设计视角 — Human-in-the-Loop

把 ch09 的具体实现抽离出来，看 Agent 系统中"人机协作"这个安全子系统的**通用设计模式**。

### 1. 自主性的本质是"授权范围"问题

Agent 越自主，意味着它能调用的工具越多、影响面越广。但**完全的自主和完全的人工都是极端**——真实系统永远在中间地带：

```
完全人工                HITL（可控自主）              完全自主
  │                          │                          │
  ▼                          ▼                          ▼
每步都问              关键操作前暂停               无任何审批
慢、安全              快 + 关键点可控              快、危险
```

**设计启示**：HITL 的本质是给不同操作**划定不同的"授权范围"**——读取类工具全权委托，写入类工具需要审批，删除/发送/部署类工具必须人工确认。

### 2. 四种决策类型是完备的

`approve / edit / reject / respond` 这四种决策覆盖了所有可能的人类意图：

| 决策 | 意图 | 本质动作 |
| --- | --- | --- |
| `approve` | 同意原计划 | 放行 |
| `edit` | 同意但微调 | 改参数后放行 |
| `reject` | 不同意 | 中断并反馈原因 |
| `respond` | 工具本就是问人 | 人类亲自回答 |

**核心区别**：

- `reject` 是"告诉 Agent 不要做"（反馈给模型）
- `respond` 是"人类顶替工具返回结果"（结果给模型）

**设计启示**：任何审批系统都应支持这 4 种（或类似）操作——只支持"同意/拒绝"的系统会让用户没有"修改参数"的逃生口；只支持"修改"则无法表达"彻底不同意"。

### 3. 中断 = 序列化 + 持久化 + 恢复

HITL 的技术实现可以拆成三步：

```
1. 序列化：把"中断时刻"的全部上下文（消息、文件、任务清单）打包
2. 持久化：写到 Checkpointer（数据库/Redis/内存）
3. 恢复：用同一个 thread_id 找回上下文 + 用户的决策 → 继续执行
```

**关键不变量**：

- `thread_id` 必须稳定——这是恢复的唯一钥匙
- 恢复时**节点从头重放**——意味着 `interrupt()` 之前的副作用必须幂等
- 决策和中断的**数量 + 顺序必须匹配**——靠索引或 ID 映射

**设计启示**：HITL 的核心不是"UI 层弹个确认框"，而是**让工作流能跨越任意时间边界、任意进程边界安全恢复**。几秒后、几小时后、换台机器都能续上。

### 4. 风险分层是治理核心

不是所有工具都需要同等审批——按风险等级分层是行业共识：

| 等级 | 典型操作 | 推荐决策集 | 理由 |
| --- | --- | --- | --- |
| **高风险** | 删除、发送、部署 | `approve/edit/reject`（不开 `respond`） | 不可逆，误用 `respond` 会被当成"成功" |
| **中风险** | 写入、外部调用 | `approve/reject` | 可审批但不需要改参数 |
| **低风险** | 读取、搜索、列表 | 不中断 | 纯只读，无副作用 |
| **人工输入型** | 询问偏好、补充信息 | `respond` | 工具本就是问人 |

**设计启示**：

- **决策集的"开放程度"本身就是治理信号**——`respond` 开放 = "这个工具允许人类顶替结果"，`edit` 开放 = "允许修改参数"
- 高风险工具**禁止 `respond`**——避免人类误用 respond 被系统当作"成功执行"
- 治理规则要**集中配置**（`interrupt_on` 字典），避免散落在每个工具里

### 5. 条件中断：让"该问的问，不该问的不问"

最朴素的"工具名匹配"会过度中断。一个好的 HITL 系统应该支持**谓词函数**：

```python
# 只在写入工作区外时才中断
"write_file": {
    "allowed_decisions": ["approve", "edit", "reject"],
    "when": lambda req: not req.args["file_path"].startswith("/workspace/"),
}
```

**设计模式**：用"白名单/黑名单/参数条件/运行时上下文"等多维度谓词组合，让中断策略**精确匹配实际风险**。

**为什么重要？** 频繁的不必要中断会**疲劳用户**——用户对所有中断麻木后，反而会忽略真正危险的中断。"**精确中断比全量中断更安全**"。

### 6. 异常机制作为通用暂停原语

LangGraph 的 `interrupt()` 用**异常机制**实现暂停，这是个非常优雅的设计：

```
interrupt() 抛特殊异常
  ↓
沿调用栈向上传播
  ↓
被运行时捕获 → 保存状态 → 返回给调用方
  ↓
用户决策 → Command(resume=...) → 重新执行该节点
```

**优点**：

- 对业务代码透明——像普通函数返回值一样用
- 自动支持嵌套调用、子图、跨进程
- 运行时统一处理状态保存

**关键约束**（5 条铁律）：

1. **不要裸 `try/except`**——会吞掉 interrupt 异常
2. **interrupt 前的副作用必须幂等**——节点会重放
3. **不要动态改变 interrupt 调用顺序**——按索引匹配
4. **并行中断用 ID 映射**——不用索引
5. **多轮表单用条件边回到节点**——不要 `while True` 套 interrupt

**设计启示**：把"暂停"建模为"异常 + 序列化状态"是经典模式。任何需要"任意点暂停 + 任意时刻恢复"的系统（工作流引擎、CI/CD、长任务）都可以借鉴。

### 7. 并行中断的"ID 映射"模式

当多个并行分支同时中断时，**不能用索引恢复**（顺序不可控），必须用稳定的 `Interrupt.id`：

```python
# ❌ 错误：按位置恢复
graph.invoke(Command(resume=["answer_a", "answer_b"]), config=config)

# ✅ 正确：按 ID 映射
resume_map = {intr.id: ui_answers[intr.id] for intr in stream.interrupts}
graph.invoke(Command(resume=resume_map), config=config)
```

**设计启示**：UI 层可以自由排序审批卡片，但**执行层必须用稳定 ID 绑定**——这是分布式系统里"幂等键"的同款思想。

### 8. 输入验证模式：单次 interrupt + 条件边

要做"多轮人工输入"（如填表、参数确认），**不要在节点里写 `while True` + interrupt**——因为每次恢复都会重放整段循环。

**正确模式**：

```
collect_age 节点
  ↓
interrupt(显示问题)
  ↓
人类回答
  ↓
判断：有效？ → 写状态 → END
       无效？ → 写"错误提示"到 pending_question → 回到 collect_age
```

**关键技巧**：

- 每次节点执行只 `interrupt()` 一次
- 无效输入写回**状态**而不是重弹问题
- 用**条件边**决定是否回到同一节点

**设计启示**：所有"用户多轮交互"的场景都应遵循"**单点暂停 + 状态驱动 + 条件路由**"——避免在节点内部做循环（重放成本太高）。

### 9. 治理清单

设计任何 HITL 子系统前，问自己这 10 个问题：

1. **风险分层了吗？** 读取/写入/删除是否用不同的审批强度？
2. **决策类型完整吗？** 是否支持 approve/edit/reject/respond 四种？
3. **可配置吗？** 是否通过 `interrupt_on` 字典集中配置？
4. **条件中断支持吗？** 是否能用 `when` 谓词缩小中断范围？
5. **持久化有吗？** Checkpointer 是否配置？没有则无法恢复
6. **thread_id 稳定吗？** 恢复时能否找回原线程？
7. **节点幂等吗？** interrupt 前是否有副作用？是否幂等？
8. **并行安全吗？** 多个并行中断用 ID 映射还是索引？
9. **可观测吗？** 是否能查"当前暂停在哪里、还缺什么决策"？
10. **权限边界清楚吗？** 主 Agent 和子 Agent 的中断策略是独立还是继承？

### 10. 核心心智模型

> **HITL = 中断原语 + Checkpointer 持久化 + thread_id 寻址 + 决策映射。**
>
> 它是 Agent 系统中"在自主性和安全性之间划清边界"的子系统——通过**风险分层**（读取/写入/删除不同强度）、**决策配置**（approve/edit/reject/respond）、**异常暂停**（`interrupt()` + Checkpointer）、**精确恢复**（thread_id + ID 映射），让"自主 Agent"和"人类监督"在任意时间跨度上协同工作。
>
> 本质上，它是 **Agent 世界里的"权限系统 + 工作流引擎 + 状态机"**——把"Agent 想做什么"翻译成"人类授权后 Agent 才能做什么"，并在执行过程中保留随时回滚或修正的能力。

