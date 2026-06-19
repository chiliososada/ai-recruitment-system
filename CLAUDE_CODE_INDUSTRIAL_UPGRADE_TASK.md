# Claude Code 自主升级任务：在不改变现有功能的前提下，将 AI 招聘匹配系统升级为工业级产品

## 1. 角色与目标

你是本项目的首席产品工程师、设计系统负责人、前端架构师、后端架构师、安全工程师、SRE 和测试负责人。

当前仓库已经实现 `CLAUDE_CODE_TASK.md` 中的 FR-01～FR-10。你的任务不是重做 MVP，也不是增加无关业务功能，而是：

1. **完整保留现有业务功能、数据语义、权限边界和主要用户流程；**
2. 在此基础上，把产品升级为可面向真实企业客户的工业级 SaaS；
3. 系统性提升 UI/UX、可访问性、响应式体验、性能、安全、可靠性、可观测性、可扩展性、CI/CD、生产部署与运维文档；
4. 直接修改当前仓库、运行应用和浏览器、查看截图、补测试、修复问题，并持续迭代，直到全部验收条件真实满足。

不要只输出方案、审计报告、设计稿、伪代码或 TODO。必须完成真实代码和验证。

---

## 2. 不可违反的约束

### 2.1 功能冻结与兼容性

- FR-01～FR-10 的功能必须全部保留，不得删除、弱化、隐藏或用静态 mock 替代。
- 先读取 `CLAUDE_CODE_TASK.md`、`README.md`、`CLAUDE.md`、`docs/`、数据库迁移、OpenAPI、测试和现有实现，建立“功能与接口基线”。
- 先运行现有全部质量门禁并记录基线；已有测试未经充分理由不得修改断言以适配错误实现。
- 不得无必要地重写已稳定模块、迁移框架或替换技术栈。优先渐进式重构。
- API、DTO、数据库字段、路由和状态语义默认保持向后兼容。确需调整时，必须提供兼容层、迁移和回滚方案，并补契约测试。
- 数据库变更必须版本化、可审查、尽量 additive；禁止破坏性清库或修改已有生产迁移历史。
- 不修改或覆盖用户未提交的内容；不执行 `git reset --hard`、`git clean -fd`、force push、真实生产部署或其他破坏性操作。

### 2.2 真实性

- 不得用硬编码成功、静态假数据、关闭权限、跳过测试、删除断言、滥用 `any`、隐藏错误或降低质量门槛来完成任务。
- 本地可以使用确定性 provider/mock，但生产路径必须明确连接真实 Supabase、Realtime、Storage、LLM、embedding、病毒扫描及监控 adapter；生产不得默认为 mock 或跳过安全检查。
- 缺少外部凭据不得停工：实现可替换 adapter、确定性本地模式、`.env.example` 和真实接入文档，并完成本地可验证部分。
- 不提交真实密钥、token、履历、邮箱、电话号码或其他个人信息。

---

## 3. 首轮必须建立的升级账本

在编码前完成，但不要停在规划阶段：

- `docs/implementation/industrial/BASELINE.md`：当前架构、页面、接口、功能、测试、性能和已知风险基线。
- `docs/implementation/industrial/FEATURE_PARITY.md`：FR-01～FR-10 → 当前实现 → 升级后实现 → 回归测试证据。
- `docs/implementation/industrial/TASKS.md`：原子任务、优先级、依赖、状态、验收标准和对应测试；状态仅允许 `TODO`、`IN_PROGRESS`、`DONE`、`BLOCKED_EXTERNAL`。
- `docs/implementation/industrial/DESIGN_AUDIT.md`：信息架构、一致性、响应式、可访问性、i18n 和关键页面问题。
- `docs/implementation/industrial/ARCHITECTURE_AUDIT.md`：安全、可靠性、性能、可观测性、数据库、AI、部署和运维风险。
- `docs/implementation/industrial/DECISIONS.md`：设计与架构决策记录。
- `docs/implementation/industrial/VERIFICATION.md`：最终命令、退出码、截图、性能、可访问性和安全证据。

先执行并记录：安装、format、`git diff --check`、lint、typecheck、unit、integration、RLS/DB、E2E、migration、production build。使用现有 seed 启动真实应用并捕获升级前关键页面截图，作为视觉基线。

---

## 4. 产品设计方向

把产品做成**克制、可信、现代、数据密集但不拥挤的企业级招聘 SaaS**，适合日本企业与国际用户。不要照抄任何现有品牌，也不要使用泛滥的“全屏紫色 AI 渐变”。

### 4.1 视觉语言

- 建立语义化 design tokens：品牌色、中性色、成功/警告/危险/信息色、背景层级、文字层级、边框、阴影、圆角、间距、字体、字号、行高、动效与 z-index。
- 色彩应沉稳、专业、可访问；可使用深蓝/靛青作为主色、青绿作为积极状态，并以高质量中性色支撑数据界面。
- 采用清晰的 4/8px 间距体系、稳定栅格、统一控件高度、边框和阴影；禁止页面间出现风格漂移。
- 图标使用统一、可 tree-shake 的图标库；不得用 emoji 代替正式功能图标。
- 动效轻量、有意义，并遵守 `prefers-reduced-motion`。
- 品牌名称、Logo、主色和环境标识应可配置，不把临时品牌硬编码到业务组件。

### 4.2 设计系统与组件

优先复用现有可维护方案。若仓库没有成熟设计系统，则建立基于 CSS variables 的 token 层，并使用成熟、可访问的 headless primitives（例如 Radix 风格组件）构建，不盲目引入重型 UI 框架。

至少形成经过文档和测试的组件：

- Button、IconButton、Link、Input、Textarea、Select、Combobox、Checkbox、Radio、Switch
- FormField、FieldError、Date/Time 控件、FileUpload
- Card、StatCard、Badge、Avatar、Tooltip、Popover、Dropdown、Dialog、Drawer
- Tabs、Breadcrumb、Pagination、DataTable、FilterBar、Search、Sort、Column empty state
- Toast、InlineAlert、Skeleton、Progress、Spinner、ErrorState、EmptyState、ConfirmDialog
- AppShell、Sidebar、Topbar、MobileNav、PageHeader、SectionHeader
- 图表容器、匹配分数、技能雷达图的文本等价信息

组件必须覆盖 default/hover/active/focus/disabled/loading/error/success 状态，避免在页面中重复手写样式。

### 4.3 页面与信息架构

完成角色化导航和清晰的信息层级：

**求职者侧**
- 登录/注册/邮箱验证：简洁可信、清晰说明安全与隐私。
- Dashboard：个人资料完成度、履历处理状态、核心技能、推荐职位、申请进度、近期消息/通知。
- 履历与 AI 分析：上传步骤、异步处理进度、失败重试、技能证据、雷达图、职业建议、更新时间/模型版本提示。
- 职位推荐与浏览：高质量卡片/表格切换、筛选、排序、匹配分数解释、收藏/申请状态（仅使用现有业务能力，不虚构新后端功能）。
- 企业/职位详情：结构清楚，薪资、地点、工作方式、语言、技能要求易扫描。
- 申请、面试、消息与通知：状态明确，移动端可用。

**企业侧**
- Dashboard：公开职位、候选人、申请阶段、待处理面试、未读消息等真实 KPI。
- 企业资料与职位 CRUD：分区表单、即时校验、草稿/公开状态明显，防止误操作。
- 人才搜索：专业筛选栏、可分页 DataTable/卡片、AI 推荐高亮、匹配解释。
- 候选人详情与比较：信息密度高但易读，敏感信息权限提示明确。
- 招聘流程：申请阶段可视化、面试安排、状态历史和批量操作只在现有权限与 API 支持范围内实现。
- 消息/通知：稳定的会话列表、未读状态、发送失败重试和空状态。

**公共与系统页面**
- 公共企业/职位页面、404、403、500、离线/网络错误、维护状态均应有完整体验。

### 4.4 响应式和多语言

- 至少验证 320px、390px、768px、1024px、1440px 宽度；不得出现非预期横向滚动、遮挡、不可点击或表格崩坏。
- 数据表在移动端采用合理的卡片、优先列或可控横向滚动，不简单缩小桌面界面。
- `ja`、`en`、`zh-CN`、`zh-TW` 四种语言的所有用户可见文案、验证、状态和错误保持完整；不得新增硬编码字符串。
- 验证日文和中文长文本、英文长单词、日期/数字/货币格式、时区显示和文本截断。
- 切换语言不丢失当前路由、筛选、未提交表单和认证状态。

---

## 5. 前端工业化要求

- 保持 React + TypeScript 现有架构，整理 feature/module 边界，避免超大组件和跨层耦合。
- 统一服务端状态、缓存键、错误处理、请求取消、重试、乐观更新和失效策略；不得无限重试。
- 建立全局错误边界、路由级错误边界、404/403/500 页面和统一可国际化错误映射。
- 页面/大组件按路由或功能进行合理 code splitting，四个 locale 可按需加载，避免一次性加载全部语言与重型图表。
- 表单使用共享 schema，处理脏状态、离开确认、重复提交、保存中、成功、冲突和服务器字段错误。
- 所有异步页面具备 skeleton/loading、empty、error、retry 和 stale 状态。
- 所有列表由服务端分页/筛选/排序，不把大量数据拉到浏览器。
- 消除不必要重渲染、N+1 请求、竞态、过时响应覆盖和重复副作用。
- 禁止在生产 UI 中暴露调试信息、内部 ID、原始 stack、token 或 provider 错误。
- 浏览器控制台在两条主 E2E 流程中无未处理异常、React warning 和失败网络请求。

---

## 6. 可访问性要求

目标达到 WCAG 2.2 AA 的可验证实践：

- 使用语义 HTML、正确 heading 层级、landmark、label、description、error association 和可访问名称。
- 全部核心流程可仅用键盘完成；焦点顺序合理，dialog/drawer 正确锁定与恢复焦点。
- 显著 focus-visible；不通过颜色单独表达状态。
- 正文、控件、图表和状态色满足 AA 对比度。
- loading、toast、验证、消息到达等动态变化使用适当 live region，但避免重复播报。
- 图表必须有可读文本/表格等价信息。
- Playwright + axe（或仓库等价工具）对关键页面执行自动化扫描，关键/严重违规为 0。

---

## 7. 后端、异步任务与 API 工业化

在保持现有外部行为的前提下审计并加固：

- 统一 request ID/correlation ID、结构化错误、超时、取消、有限重试、幂等性和速率限制。
- 对注册、登录、上传、消息、申请、面试和 AI 任务等写操作处理重复请求与并发竞争。
- 对履历解析、LLM 分析、embedding 和匹配重算使用可恢复的异步任务模型；若当前为同步/进程内任务，升级为可持久化队列或等价机制，至少具备：状态、幂等 key、租约/锁、重试次数、指数退避、超时、失败原因、dead-letter/人工重试、worker graceful shutdown。生产不得依赖单进程内存队列。
- 外部 provider 具备超时、错误分类、有限重试、熔断/降级策略和可观测指标；不得在未知状态下重复产生副作用。
- API 继续使用共享 schema 和一致分页/排序；OpenAPI 与真实路由同步，并增加契约测试。
- 增加 `/health`、`/ready`（及适合架构的版本/commit 信息），readiness 必须检测关键依赖而不是永远返回成功。
- 服务器支持 graceful shutdown，关闭期间停止接收新任务并安全释放连接。

---

## 8. 数据库、Supabase 与数据生命周期

- 复核全部表、外键、唯一约束、检查约束、索引、删除策略、时间字段和多租户边界。
- 用真实查询计划或可重复基准检查职位列表、人才搜索、消息、申请管道、匹配召回等高频查询；补必要组合/部分索引，避免无依据堆索引。
- RLS、API 权限和 UI 可见性形成纵深防御；补匿名、求职者、本企业成员、其他企业成员和越权 IDOR 测试。
- Storage 使用不可预测路径、MIME/魔数校验、大小限制、隔离/扫描状态、短期 signed URL 和严格 bucket policy。
- 明确履历、解析文本、AI 结果、消息、审计事件的保留/删除策略；提供账号删除和数据清理的运维流程文档，不虚构未实现的用户功能。
- 新迁移可在空库和已有旧版本数据库上前向执行；提供验证、备份、回滚/前滚方案。
- pgvector 召回与规则评分保持可解释、版本化和可复现；升级不得改变既有分数语义，除非版本化并保留旧结果可追踪性。

---

## 9. 安全与隐私加固

执行威胁建模并落实代码与测试，至少覆盖：

- Auth/session/token 存储、账号枚举、暴力尝试、权限提升、跨租户、IDOR、CSRF（适用时）、CORS、XSS、CSP、点击劫持、开放重定向。
- 输入验证、SQL 注入、日志注入、文件名/路径、MIME 欺骗、Zip bomb/恶意 DOCX、超大文件和病毒扫描失败时的 fail-closed 行为。
- 履历/职位内容的 prompt injection、LLM 输出 schema 校验、敏感信息泄漏、provider 日志与模型追踪隐私。
- 日志、错误、追踪和 analytics 不记录密码、token、完整履历、完整 prompt 或敏感联系方式；建立集中 PII redaction。
- 生产安全 headers、严格 CORS allowlist、最小权限环境变量、secret rotation 指南。
- `npm audit`/依赖扫描、secret scan、SAST 中不得存在未解释的 high/critical 生产风险；无法即时修复的风险必须有可审计缓解措施和负责人/复查日期，不得静默忽略。
- 新增 `docs/SECURITY.md`：威胁模型、信任边界、数据分类、安全配置、漏洞响应和生产检查清单。

---

## 10. 可观测性与运维

- 统一结构化日志字段：timestamp、level、service、environment、requestId、user/tenant 的非敏感标识、route、latency、status、errorCode；默认脱敏。
- 增加 metrics/tracing adapter；本地可输出或 mock，生产可接 OpenTelemetry/Prometheus/Sentry 等等价方案，不与单一供应商强耦合。
- 至少度量：请求率/错误率/延迟、DB pool、队列深度/等待时间/重试/死信、上传/解析成功率、LLM/embedding 调用延迟与错误、消息发送、匹配任务。
- 关键链路跨 API、worker、DB 和 provider 保留 correlation；错误能定位但不泄露 PII。
- 定义 SLI/SLO、告警建议、dashboard 字段、on-call 排查步骤和常见故障 runbook。
- 新增 `docs/OPERATIONS.md` 与 `docs/RUNBOOK.md`，涵盖健康检查、扩缩容、队列积压、provider 故障、数据库迁移失败、回滚、备份恢复和事故处理。

---

## 11. 性能、可靠性与容量

- 建立可重复的本地/CI 性能基线和预算，不仅凭主观判断。
- 对关键页面测量 bundle、首屏、交互和布局稳定性；实施路由拆包、资源懒加载、合理缓存和避免 layout shift。
- 配置 Lighthouse CI 或等价检查。对公共页面目标：Accessibility ≥ 95、Best Practices ≥ 95、SEO ≥ 90；Performance 设为基线不回退并力争移动端 ≥ 85、桌面端 ≥ 90。认证页面至少通过 a11y 和性能预算检查。
- 设置并验证前端 bundle budget；避免单一初始 chunk 无限制增长，超预算必须拆分或在文档中给出可审计理由。
- 为代表性 seed 数据建立 API/DB 基准或轻量负载测试，记录 p50/p95、吞吐、错误率和环境；对列表、人才搜索、消息和匹配路径设定合理预算并修复明显瓶颈。
- 检查连接池、超时、backpressure、批处理、缓存失效、并发 worker 和 graceful degradation。
- 所有基准结果记录在 `docs/PERFORMANCE.md`，明确硬件/环境，禁止伪造生产容量结论。

---

## 12. CI/CD、供应链与部署

- 固定并记录受支持的 Node/npm 版本；锁文件可重复安装。
- 提供 GitHub Actions 或仓库现有 CI 的等价流水线：install/cache、format、diff、lint、typecheck、unit、integration、RLS/DB、migration、build、E2E、a11y、security scan。
- 生产 Dockerfile 使用 multi-stage、非 root、最小运行镜像、healthcheck、明确启动命令和 graceful shutdown；本地开发可一键启动所需依赖。
- 生成或支持生成 SBOM；配置依赖更新策略和 secret scanning。
- 建立 staging/production 环境变量矩阵、迁移顺序、发布检查、smoke test、回滚和 feature flag/kill switch（仅用于外部 AI 等风险能力，不用于绕过核心测试）。
- 不实际推送、不创建云资源、不执行生产部署，除非用户明确授权。
- 更新 `README.md`、`docs/DEPLOY.md`、`docs/ARCHITECTURE.md`，使新工程师可从零安装、验证、启动、部署和排障。

---

## 13. 测试与视觉验证

保留现有测试并补齐：

1. 单元测试：design tokens/组件状态、格式化、校验、错误映射、幂等、重试/退避、队列状态机、日志脱敏。
2. 组件测试：表单、dialog、table、筛选、移动导航、上传、图表文本、loading/empty/error/retry、四语言。
3. API/集成测试：兼容性、并发、重复提交、超时、provider 失败、worker 重试、健康检查。
4. RLS/Storage 测试：匿名、求职者、本企业、其他企业、会话非成员、未公开职位、敏感文件。
5. E2E：现有两条主路径全部通过，并加入关键错误恢复与移动端流程。
6. 可访问性：关键页面 axe 扫描，严重/关键违规为 0；键盘完成核心流程。
7. 视觉回归：使用 Playwright 在至少桌面 1440×900 和移动 390×844 捕获关键页面截图；对求职者和企业端核心页面检查布局、溢出、截断、焦点、loading/empty/error、四语言。稳定区域可建立 screenshot assertions；动态字段需固定 seed/时钟或合理 mask，不能用大面积 mask 掩盖问题。
8. 浏览器质量：E2E 期间 console error、pageerror、未预期 4xx/5xx、资源加载失败均导致测试失败。
9. 性能/负载：可重复脚本和真实输出，不用手写结论。

至少验证这些关键页面：认证、求职者 Dashboard、履历/AI 分析、职位推荐/浏览/详情、申请/面试、消息、企业 Dashboard、企业/职位管理、人才搜索、候选人详情/比较、招聘流程、通知、403/404/500。

---

## 14. 自主执行循环

每轮严格执行：

1. 读取工业升级 `TASKS.md`、`PROGRESS`/验证记录、失败日志和 `git diff`。
2. 选最高优先级、最小可闭环的任务，标记 `IN_PROGRESS`。
3. 先复现/增加测试，再完成真实实现。
4. 运行最小相关测试，修复根因；定期运行全部门禁。
5. 对 UI 改动必须启动应用、使用真实 seed、在浏览器中查看桌面/移动截图；不能只凭代码判断美观。
6. 每完成一个区域，执行一次功能回归、a11y、视觉、权限、性能和维护性自审。
7. 只有真实证据存在才标 `DONE`，并更新 `FEATURE_PARITY.md` 与 `VERIFICATION.md`。
8. 立即进入下一任务，不因输出阶段总结、上下文变长或某个页面完成而停止。

可使用 subagent/agent team 做独立的 UI、security、performance 和 regression review，但最终必须由主 agent 自己复核所有结果。若连续两轮无实质进展，改变策略、缩小复现、增加诊断或重新设计，不重复同一无效动作。

---

## 15. 完成条件

仅当以下全部成立，才允许输出 `FINAL_STATUS: COMPLETE`：

- FR-01～FR-10 的功能与权限全部保留，`FEATURE_PARITY.md` 每项都指向真实代码和自动化证据。
- 工业升级任务没有未完成核心项；没有未解释的 TODO/FIXME、placeholder、静态成功或生产 mock。
- 关键页面形成一致、精致、响应式的设计系统；桌面与移动截图已人工/自动审查，四语言无明显溢出或缺键。
- 关键页面自动 a11y 检查无 critical/serious 违规，核心流程可键盘完成。
- API、DB、RLS、Storage、异步任务、AI/provider、安全、可观测性和健康检查达到本文件要求。
- 全部现有与新增的 install/format/diff/lint/typecheck/unit/integration/RLS/DB/migration/build/E2E/a11y/visual/security/performance 门禁成功退出 0；确实不适用的项必须在验证文档中给出可审计理由。
- 生产构建可运行，Docker/CI/环境变量/迁移/回滚/runbook 文档完整；没有真实发布或推送。
- `docs/implementation/industrial/VERIFICATION.md` 记录精确命令、退出码、测试数量、截图路径、性能结果和已知限制。
- 最终执行 `git status --short`、`git diff --check`、secret scan 和完整 diff review；没有误改无关文件或泄露秘密。

最终回复必须包含：

1. `FINAL_STATUS: COMPLETE`
2. “原功能 → 升级位置 → 回归证据”摘要
3. “UI/UX → 截图与 a11y 证据”摘要
4. “安全/性能/可靠性/运维 → 验证证据”摘要
5. 全部质量门禁的实际命令与退出码摘要
6. 仍需真实云凭据才能完成的外部步骤（如有），但不得把本地可完成工作留作待办

只要任一条件未满足，就继续下一轮，不得提前宣称完成。
