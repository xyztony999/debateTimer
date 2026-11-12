# Gate 1 验证报告 — 设计→代码门控（debate-timer 全量补档）

| 属性 | 值 |
|------|-----|
| 模块 | debate-timer（全工作区：D1 三文档 / D2 11 篇 PRD / D3 11 模块 13 文档 / D4 8 篇 PageSpec / common-spec 3 池文件，共 38 份设计文档） |
| 检查时间 | 2026-11-11 |
| 检查方式 | 38 份设计文档全量读取 + 逆向归档抽查（PRD/API/PageSpec 声明 vs 代码常量逐条比对） |
| 编号源 | `.claude/rules/engine-rules.md` G1-01~G1-11（唯一编号源）；检查块展开遵循 validation skill（PRD 就绪 / API 完整性 / 前后端契约） |
| 判定 | **WARN**（无 CRITICAL 阻断项；3 项建议项待确认后继续） |

## 一、G1-01~G1-11 逐项判定

| 编号 | 检查项 | 判定 | 依据（本次实际读取/执行） |
|------|--------|------|--------------------------|
| G1-01 | 架构文档与模块设计一致 | PASS | BA 3 L2/6 L3 → AA 4 域 11 模块（`00-architecture/application-arch.md:44-47` 分层表）→ FL 5 用户 18 菜单组；D2 各 PRD「上游依据」逐一引用对应 BA/AA/FL 节号且子模块划分一致（如 C-01 PRD 子模块 01~05 = AA 2.1.1.1~2.1.1.5；C-02 01~04 = AA 2.1.2.1~2.1.2.4）；P-01~P-03 AA「纯技术机制不标注用户类型」与三篇 PRD/API 的「裁剪深度」声明一致 |
| G1-02 | PRD 覆盖所有业务场景和角色 | PASS | 11 篇 PRD 对 AA 11 模块一一覆盖；FL 5 类用户在各 PRD §角色定义全部出现（计时操作员 C-01/C-02/S-04、注册用户 S-02/S-03/S-04、管理员 D-01/S-01-03/S-03-04、访客 S-01-01/S-03-02、大屏观众 C-02-02/C-01-04 呈现侧）；FL 2.3.2.2 预置导入 → D-02 PRD FR-2；FL 声明「S-04-01 为自动行为依附备注、P 域不入清单」与 PRD 依附行为章节一致 |
| G1-03 | API 设计完整（路径/请求/响应/错误码） | PASS | 11 模块 API 文档每个端点均有方法+路径、请求体/参数、响应包络（`{success,data?,message?,code?}`）、状态码+错误 message 表（S-01 §3.4 全量 11 行、S-02 §3.4、S-03 §3.4、S-04 §3.4、C-02 §3.4 含 `session_taken`、D-01 §3.4、D-02 §3.4）；C-01 显式归档「HTTP 接口清单为空」（纯前端域，`server/routes/` 七路由文件实测无计时端点）、P-03 显式归档「无 HTTP API 面」——缺席为如实归档而非缺失 |
| G1-04 | 交互设计覆盖所有页面类型 | PASS | 8 篇 PageSpec 覆盖：列表（S-03 卡片网格/S-04 卡片流/D-01 admin 双台账）、表单（login 双模式/settings 9 Card/admin 创建用户内联/配对 Dialog）、详情（S-04 明细表/gallery 详情 Dialog）、实时控制台（code：timer-console/remote-controller/display-follow）；审批类页面不存在——11 篇 PRD T3 全部显式标注「不适用（无审批流）」，属如实裁剪非遗漏；FL 18 菜单组 ↔ 8 PageSpec 对照闭合（FL 概览声明的两处豁免：S-04-01 自动行为、P 域纯技术） |
| G1-05 | API 字段与交互规格字段对齐 | PASS | 每篇 PageSpec Action 表逐条标注 API 编码（admin 13 Action ↔ A1~A6/S1/S2/GAL-UNPUBLISH/LOGOUT，FX-137 自检+本次对读复核；S-04 9 Action ↔ ML-*；S-02 16 Action ↔ CFG-*；timer-console §6 ↔ C-02 API-1/2/3/5/9 + S-04 ML-SAVE + S-02 CFG-GET/STREAM）；列表/详情字段与 VO 投影一致（如 S-04 列表项 8 字段 = `toListItem`（`server/lib/matchLogs.js` 投影）、admin AdminListItem 投影、admin-page §4.3 如实登记「createdAt/updatedAt/source 返回但未展示」为现状取舍） |
| G1-06 | 状态机定义完整 | PASS | C-01 单侧相位机（running/grace/locked + 触发条件 + 铃声语义，PRD §6.1 = API §4.2 = 代码 `src/timer/engine.js:9-16` 文件头注释与常量实测一致）；C-02 五组状态机（会话生命周期/控制端 sessionState/横幅/直连链路/冲突仲裁，PRD §6.1~6.5 + API §4.2）；S-03 二元可见性流转含 4 个触发角色与「保存抹除」路径（§4.2）；S-01/S-02/S-04 无状态机均显式声明为简化/不适用（T2 项如实标注） |
| G1-07 | 枚举统一无冲突 | **WARN** | 取值集全库一致无冲突（16 组枚举三处核对：池 ↔ API 文档 ↔ PageSpec，代码抽查证实池登记准确，见 §四）； WARN 见发现 W-2（池收敛登记未执行 + 4 个派生/客户端枚举未入池） |
| G1-08 | 接口路径规范（/domain/resource/action） | **WARN** | 部分端点非三段式：`/api/auth/*` 两段式、`/api/gallery`、`/api/match-logs`、`/api/configurations/:name` 资源段两段（既有现网路径）；7 篇 API 文档 M2 自检均如实标注「⚠️ 部分符合：已上线事实，逆向归档不改路径」，C-02 §3.1 明确「新增接口应遵循三段式」。属已声明的既定豁免（见发现 W-3） |
| G1-09 | 设计文档 changelog 已填写 | PASS | 38 份文档逐一核对均含「更新记录/变更记录」节且含 v1.0 initial 行：D1 三文档（BA:244-246、AA:367-371、FL:315-319）、11 篇 PRD、11 篇 API 文档 §6（C-01/C-02 另附独立 changelog.md，含结构化变更类型词汇表与版本号规则）、8 篇 PageSpec §9/§12、3 份池文件 |
| G1-10 | 状态索引模块状态已更新 | PASS（本次更新后） | INDEX.md 阶段状态 D1~D4 四行与产物实测一致（文件清单 38 份与 `find workspace -type f` 结果吻合，`.mimosa/` 2 个工具状态文件除外）；Gate 1 行由本次检查写入判定（见 §六） |
| G1-11 | 跨阶段模型一致性 | PASS | (a) API 领域对象 ↔ D2 领域模型：C-01 API §1.4 = PRD §5.2/§12（6 对象一致）；C-02 API §1.4 = PRD §5.2/§12（TimerSession/Snapshot/RemoteCommand/pendingCommands/PairingCode + 客户端投影）；S-01/S-02/S-03/S-04 聚合根与值对象划分两档一致；D-01/D-02/P-01/P-02/P-03「无聚合根」声明一致。(b) PageSpec Action ↔ API 接口：8 篇全部对齐（见 G1-05），无未归档接口调用（admin-page FX-137 声明 + 本次对读证实） |

## 二、D2 PRD 完备性（第一/二/三层检查块）

11 篇 PRD 全部自附「PRD 完备性检查报告（D2-1）」并经本次抽读复核：

| PRD | G1~G5 | 适用 T 项 | N1~N4 | 结论 |
|-----|-------|----------|-------|------|
| C-01 比赛计时 | ✓（§2.1/3/2.2/5.2/5.1） | T1/T1a/T2 ✓；T3~T5/T6~T9 不适用（如实标注 6 项） | ✓ | 通过 |
| C-02 大屏同步 | ✓ | T1/T1a/T2/T6/T7/T8 ✓（seq/commandSeq 幂等） | ✓ | 通过 |
| S-01 账号与准入 | ✓ | T1/T1a/T2(简化)/T9 ✓；T3~T8 不适用 | ✓（N4 如实记录仅 createdAt/开关 updatedBy） | 通过 |
| S-02 赛制模板管理 | ✓ | T1/T1a/T9 ✓；T2/T3/T4~T8 不适用 | ✓ | 通过（T2 布尔标志翻转无状态机，如实） |
| S-03 模板广场 | ✓ | T1/T1a/T2/T4/T8(简化)/T9 ✓ | ✓（N4 如实记录无审计） | 通过 |
| S-04 比赛记录与复盘 | ✓ | T1/T1a/T2(简化)/T4(简化)/T5/T9 ✓；T8 不适用如实 | ✓ | 通过 |
| D-01 用户治理 | ✓ | T1/T1a ✓；T2~T9 大多不适用 | N4 ⚠️ 建议项（无审计日志，不阻塞，PRD 自评） | 通过 |
| D-02 系统配置 | ✓ | T1/T1a/T7/T8/T9 ✓ | N4 部分 | 通过 |
| P-01 实时通道 | ✓（零业务对象如实） | T1~T5 不适用（通道帧结构已在 FR 详列） | ✓ | 通过（平台域裁剪） |
| P-02 接口防护 | ✓ | T1~T9 不适用 | ✓ | 通过（平台域裁剪） |
| P-03 离线壳 | ✓ | T1~T9 不适用 | ✓ | 通过（平台域裁剪） |

无一篇 PRD 存在必检项缺失；所有「不适用」均给出理由（对照 validation skill 第二层 T1~T9 适用类型表逐项成立）。

## 三、D3 领域对象 ↔ D2 领域模型 & D4 Action ↔ D3 接口（G1-11 展开核对）

**领域模型一致性（逐模块）**：

| 模块 | D2 聚合根 | D3 领域对象总览 | 一致性 |
|------|----------|----------------|--------|
| C-01 | 计时引擎状态 TimerEngineState | API §1.4 六对象（引擎状态/方侧时钟/告警偏好/AlertEvent/ClockAnchor/StageProjection）+ 实绩采集子流程 | 一致（字段表同源引用 PRD §5.2） |
| C-02 | 同步会话 TimerSession | API §1.4 五对象 + 2 子流程 + 4 关联对象 | 一致（聚合根字段 10 项逐字段同 PRD §5.2） |
| S-01 | 账号 | API §1.4 账号/登录会话/注册开关（托管）/登录态(P2) | 一致 |
| S-02 | 赛制模板 | API §1.4 模板/阶段条目/队名/共享凭证/PID 装饰 + S-03 寄居字段 | 一致 |
| S-03 | 无（投影+寄居字段） | API §1.4 同构 | 一致 |
| S-04 | 比赛记录 | API §1.4 MatchRecord/StageEntry/summary/采集缓冲(P7)/游标(P4) | 一致 |
| D-01/D-02/P-01/P-02/P-03 | 无聚合根 | API 各档同构声明 | 一致 |

**Action ↔ 接口一致性（CT-001~004 摘要）**：8 篇 PageSpec 共 60+ Action 逐条对读，全部映射到已归档接口或显式标注「无接口」（本地 state/路由跳转）；路径、请求体、响应字段三处（PageSpec ↔ API 文档 ↔ 代码常量）无出入。代表性核对：admin-page 开关切「受控时序 PUT 成功才位移」↔ D-02 S2 upsert 语义 ↔ `AdminPage.jsx:114-125`；S-04 CSV 客户端组装（BOM+公式防护）↔ S-04 API §4.4 BD-6 ↔ `src/utils/matchRecordCsv.js`。

## 四、逆向归档抽查：PRD/API 声明 vs 代码常量（本次实际执行的命令与结果）

| # | 声明出处 | 代码核对命令 | 结果 |
|---|---------|-------------|------|
| 1 | S-02 API §1.3「PUT 整档替换抹除 isPublic/creditName/galleryCopyCount」 | `sed -n '85,130p' server/routes/configurations.js` | **证实**：payload 仅回填 createdAt/shareToken/shareEnabled，`replaceOne` 整档替换 → 抹除发布寄居字段。**据此 S-02 PRD §3.1「保留…共享/发布标志」与实现矛盾 → W-1** |
| 2 | EP-TIMER-01 stageMode 三值白名单 | `sed -n '1,20p' server/lib/timerSessions.js` | 证实：`STAGE_MODES = {single,double,free}`（:3） |
| 3 | EP-TIMER-01 口径差异①（数字 2 不接受） | `sed -n '20,32p' server/lib/configDocs.js` | 证实：`TIMER_SETTING_VALUES` 仅含 `0:'single',1:'double'`，无数字 2 |
| 4 | EP-TIMER-02 phase 白名单 + grace⇔graceMs 不变式 | `timerSessions.js` :5 与 :345-360 | 证实：`TIMER_PHASES` 三值；`(phase==='grace')!==(graceMs>0)` 即 400 |
| 5 | EP-SESSION-06 指令类型 / EP-TIMER-06 wire 试音两档 / EP-TIMER-04 指令侧 | `timerSessions.js` :14-16 | 证实：6 指令类型 / `warn30,end` / `single,aff,neg` |
| 6 | EP-PROTECT-02 配额（容量 100/心跳 30s/指令队列 32/信令 32KB） | `timerSessions.js` :17,20,75 | 证实全部数值一致 |
| 7 | EP-PROTECT-01 四组限流默认值 | `cat server/lib/rateLimits.js` | 证实：login 900_000ms/20、register 3_600_000ms/10、display 60_000/60、gallery 60_000/120 |
| 8 | EP-IDENT-01 首用户 admin | `sed -n '85,96p' server/routes/auth.js` | 证实：`role: isFirstUser ? 'admin' : 'user'`（:93） |
| 9 | EP-IDENT-02 三参判定优先级 | `sed -n '1,30p' server/lib/authPolicy.js` | 证实：`userCount===0`→true ＞ `adminSetting!==undefined` ＞ env（:11-23），与 S-01 PRD §5.1 表逐行一致 |
| 10 | EP-SESSION-11 配对码 4 位（1000-9999）+ 同码去重 | `timerSessions.js` :112-137 | 证实 |
| 11 | EP-TIMER-07 自动推进 3 秒 + 臂动五条件 | `sed -n '463,483p' src/timer/useDebateTimer.js` | 证实：`SET_ADVANCE value:3`（:478）；臂动条件五项齐备 |
| 12 | BR-C01-03 追拍封顶 300 | `sed -n '123,128p' src/timer/engine.js` | 证实：`MAX_CATCHUP_BEATS = 300` |
| 13 | BR-C01-02 闪烁窗口 30/27 | `engine.js` :23-24 | 证实：`BLINK_WINDOW_HIGH=30/LOW=27` |
| 14 | C-01 相位机注释（running→grace→locked） | `engine.js` :9-16 | 证实文件头注释与常量逐字一致 |
| 15 | S-04 记录常量与字段区间 | `sed -n '1,5p' + '95,106p' server/lib/matchLogs.js` | 证实：`MAX_STAGES=64`、`MAX_RECORD_BYTES=64KB`、planned 1-3600/grace 0-300/actual 0-86400/overrun 0-99 |
| 16 | EP-CONFIG-06 广场排序白名单 | `sed -n '60,67p' server/routes/gallery.js` | 证实：`SORTS={updated,copies}`，未知回落 updated |
| 17 | P-03 API 永不缓存 + autoUpdate + injectRegister null + 主题色 | `sed -n '30,58p' vite.config.js` | 证实：`navigateFallbackDenylist:[/^\/api\//]`、`registerType:'autoUpdate'`、`injectRegister:null`、`theme_color:'#1a237e'`、standalone |
| 18 | SP-01/02/03 铃声/告警节点/TTS 缺省 | `sed -n '1,35p' src/services/soundPrefs.js` | 证实：`ALERT_NODES` 三节点、`SOUND_OPTIONS` 四方案、`DEFAULT_SOUND_PREFS` split/timeup/notify、`TTS_NODES` 含 handover、总开关缺省 false 分开关全 true |
| 19 | EP-I18N-01 三语支持 | `sed -n '18,30p' src/i18n.js` | 证实：`supportedLngs ['en','fr-CA','zh-Hans']`、`fallbackLng:'en'` |
| 20 | C-02 会话开启前置 shareEnabled+shareToken、superseded 顶替、容量 409 | `timerSessions.js` :118-130 | 证实（create 函数逐行核对） |

抽查结论：**20/20 抽查点代码事实与文档声明一致，唯一例外为发现 W-1（S-02 PRD 一处表述，其实现事实已被下游三份文档正确归档）**。枚举池 20+ 处来源行号引用抽核全部准确。

## 五、发现清单（按严重度）

### W-1（WARN，建议项）：S-02 PRD §3.1 一处表述与已上线实现矛盾
- **矛盾点**：S-02 PRD「模板保存 | 覆盖保存当前模板；upsert 语义，保留首次创建时间与**共享/发布标志**」（`02-detailed/prd/S-02-赛制模板管理.md:38`）——实现为 `replaceOne` 整档替换且不回填发布寄居字段，保存已发布模板会**抹除 isPublic/creditName/galleryCopyCount**（`server/routes/configurations.js:95-112`，本次 sed 实测）。
- **缓解事实**：该实现行为已在下游三份文档如实归档且互相引用闭合：S-02 API §1.3 差异注记、S-03 API §1.3+§4.2（isPublic 流转含「保存抹除」路径）、S-02 PageSpec §5.2 联动注记（「保存已发布模板会抹除…本页无专项预警」）。
- **建议**：修订 S-02 PRD §3.1 该行为「保留 createdAt/shareToken/shareEnabled；发布寄居字段随保存抹除（详见 S-02 API §1.3 注记）」，或按用户决策将「保存退场」升格为待变更需求。

### W-2（WARN，建议项）：枚举池「建池后登记收敛」未执行（G1-07）
- 7 篇 API 文档（S-01 §3.4 / S-02 §3.4 / S-03 §3.4 / S-04 §3.4 / D-01 §3.4 / D-02 §3.4 / P-01 §4.4.4）仍写有「common-spec 枚举池当前尚未建立，待建立后归并」，而 `01-solution/common-spec/enum-pool.md` v1.0 已建立并自声明为「D3 枚举章节唯一引用来源」——API 文档未回填 EP 编号引用（D4 的 admin-page/login PageSpec 已按 EP 编号引用，D3 反而未收敛，方向倒挂）。
- 4 个派生/客户端枚举未入池：`registrationSource`/`source`（env/admin，S-01 API 与 D-02 API 各自定义、取值一致）、`visibilityState`（unpublished/published，S-03 派生视图）、上报失败处置（yield/end/recover/ignore/retry，C-02 客户端）、`rtcState`（off/connecting/open）。均为派生展示或客户端态，非 wire 业务枚举，不构成取值冲突。
- **核对结论**：全库枚举**无取值冲突**（16 组池内枚举在 池↔API↔PageSpec↔代码 四处取值一致，见 §四 #2~#19）；同名枚举跨文档重复定义已通过显式互引收敛（S-03/S-04 显式引用 S-02 §3.4 定义）。
- **建议**：执行一次枚举收敛 pass：API 文档枚举节回填 EP 编号引用 + 将上述 4 个派生枚举按「派生类」补入池或标注「不入池理由」。

### W-3（WARN，建议项）：G1-08 三段式路径为已声明的既定豁免
- `/api/auth/register|login|logout|status|me`（两段式）、`/api/gallery`、`/api/match-logs`（单段列表/保存）、`/api/configurations/:name`（资源两段）等非三段式路径为**已上线现网事实**；7 篇 API 文档 M2 自检统一标注「⚠️ 部分符合：已上线事实不改路径」，C-02 API §3.1 明确「新增接口应遵循三段式」。
- **建议**：在引擎/profile 层将「逆向归档既有路径豁免、新增接口三段式」固化为明文规则（当前仅为各文档分散声明），避免后续 Gate 复检反复人工判断。

### INFO（不阻塞）
- I-1：S-04 PRD §3.1「手动保存」行实现锚点存在笔误残片「`src/DebateSetting`…」（`02-detailed/prd/S-04-比赛记录与复盘.md:38`），应为 `src/TimerControlPage.jsx:359-362`，行为描述本身正确。
- I-2：C-01/remote-controller 已如实登记「桌面时钟面重置不经历 fire 指令中转（作用于本地引擎）」的实现差异（timer-console §2.4 注记）——遥控横屏态行为一致性属已知现状，非文档矛盾。
- I-3：S-02 PageSpec §5.7 注记「已有阶段无改名/改三语名入口」——AA 2.2.2.1「阶段名支持多语言」在创建环节成立，PRD 功能点表述（新增含三语名）与实现一致，无矛盾。
- I-4：admin-page §8.13 自登记 G1~G4 现状缺口（重置密码无 UI 入口/台账无时间列/开关无来源展示/无加载空态）——接口能力与 UI 面差异均已双向归档，非文档缺陷。

## 六、门控判定与状态索引写入

- **判定：WARN** —— CRITICAL 项（PRD 必检项、API 完整性、跨阶段模型一致性、枚举取值无冲突、逆向归档声明与代码事实一致）全部通过；3 项 WARN 均为建议项（W-1 一处 PRD 表述修订、W-2 枚举收敛 pass、W-3 路径豁免规则固化），不阻断 D4→B1 流程。
- 按 validation skill 门控语义：WARN = 列出建议项，用户确认后继续。上述 W-1~W-3 即待确认项。
- 已按协议将本判定写入 `workspace/INDEX.md`（阶段状态 Gate 1 行 + 门控记录 gates.gate1 节 + 更新记录），该写入为本次任务唯一允许的 INDEX 变更。

## 附：本次执行的检查命令清单

| 类别 | 命令 |
|------|------|
| 文档全量读取 | Read 工具逐份读取 38 份设计文档（D1×3、PRD×11、API×13、PageSpec×8、池×3）+ INDEX.md |
| 文件清单核验 | `find workspace -type f`；`wc -l` 全部设计文档（合计 8617 行） |
| 代码抽查 | `sed -n` 行段读取：`server/routes/configurations.js:85-130`、`server/lib/timerSessions.js:1-20/70-80/112-140/345-362`、`server/lib/authPolicy.js:1-30`、`server/lib/rateLimits.js`（全文）、`src/timer/engine.js:1-30/123-128`、`server/routes/auth.js:85-96`、`server/lib/matchLogs.js:1-5,95-106`、`server/lib/configDocs.js:20-32`、`src/timer/useDebateTimer.js:463-483`、`server/routes/gallery.js:60-67`、`vite.config.js:30-58`、`src/services/soundPrefs.js:1-35`、`src/i18n.js:18-30` |
| 目录准备 | `mkdir -p workspace/05-reports` |

未执行项（如实声明）：本 Gate 为设计→代码门控，不要求编译/测试执行；文档内引用的 `bun test server/` 85 pass 等验证结论系归档会话（D2/D3 阶段）自述，本次未重跑，不影响本 Gate 判定项。

## 附：WARN 处置记录（2026-11-11，主会话裁决 proceed=true 后立即修复）

裁决：**WARN 确认后继续交付**；三项修复在交付后由主会话执行完毕，逐项验证如下：

| # | 处置 | 验证 |
|---|------|------|
| W-1 | 修订 `02-detailed/prd/S-02-赛制模板管理.md` §3.1「模板保存」行——改为「upsert 语义为整档替换，仅保留 createdAt/shareToken/shareEnabled；已发布模板的 isPublic/creditName/galleryCopyCount 会被抹除（保存后广场退场，见 S-03 §1.3）」，与 configurations.js:88-129 实际行为及 S-02 API §1.3、S-03 API §1.3/§4.2、S-02 PageSpec §5.2 三处归档一致 | PRD 该行与实现归档四处口径闭合 |
| W-2 | ①enum-pool.md 增补 4 个派生枚举：EP-IDENT-04 `source`（env/admin）、EP-CONFIG-08 `visibilityState`（unpublished/published）、EP-SESSION-12 `rtcState`（off/connecting/open）、EP-SESSION-13 `reportFailure`（yield/end/recover/ignore/retry），各带 file:line 来源；②7 篇 API 文档（S-01/S-02/S-03/S-04/D-01/D-02/P-01）枚举定义节回填 EP 编号引用，池编号逐一映射（stageTimingMode→EP-TIMER-01、pidStationType→EP-CONFIG-02、pidLineColor→EP-CONFIG-04、pidIconId→EP-CONFIG-03、gallerySort→EP-CONFIG-06、userRole→EP-IDENT-01、disabled→EP-IDENT-03、registrationOpen→EP-IDENT-02、commandType→EP-SESSION-06、soundCheckKind→EP-TIMER-06、commandSide→EP-TIMER-04、signalTarget→EP-SESSION-07、activeSide→EP-TIMER-03、phase→EP-TIMER-02、stageMode→EP-TIMER-01；shareActionParams 标注接口参数语义不入池；recordSide 标注 EP-TIMER-04 取值子集） | grep 全域无「尚未建立/待归并」残留；池↔文档编号一一对应 |
| W-3 | 新建 `01-solution/common-spec/api-path-rules.md` v1.0：既有路径豁免（2026-11-11 现网路由为准）+ 新增接口三段式 + 变更走 changelog 三条规则；INDEX 架构速览与文档清单同步登记 | 规则文件入池，INDEX 已登记 |
| INFO I-1 | 顺手修复 `02-detailed/prd/S-04-比赛记录与复盘.md:38` 锚点残片「`src/DebateSetting`…」→ 仅留 `src/TimerControlPage.jsx:359-362` | 锚点指向正确实现 |

I-2~I-4 为现状注记（非矛盾），维持原样不处置。
