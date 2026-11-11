# 本地部署配置器：依据、定价与验收范围

2026-10-13；dev-board#1238。用户要求先核清主仓服务，再制作官网交互清单，后明确授权结合市场定优惠价，并特别要求服务器等成本由客户自行承担，不能让人误解。

## 核验基线

- 主仓 `AI-WorkDeck/aiworkdeck`，本机 HEAD `1ba0a59b647eb43498a9ff9b27eaf2a57f4ff1d9`。只读源码与部署文档；没有做客户环境、吞吐或 GPU 性能实测。
- 官网从 `3a1e35a` 的主线建立独立工作树；旧当前目录是过时分支，不能据其流水线判断当前行为。最新 CI 已将部署限制为 workflow_dispatch，本任务不部署。
- 外部服务唯一权威总表已按用户指定入口读取；本文不复制配置、账户、地址或凭据，只记录本任务的能力判断。
- 共享规则读取 shared commit `472061480be3730bf0a7ff3d92580a647b0babc1`，公共副本干净且 ff-only 同步。

## 能力与约束（路径相对主仓）

| 项目 | 原始依据 | 配置器口径 |
|---|---|---|
| 模型 | `backend/src/main/java/com/checkba/service/ai/ChatModelFactory.java`（354、637 附近）；`OpenRouterStreamingChatModel.java` | 云调用有实现；Ollama 仅实验 ASK，完整 Agent/PLAN/图像/计量不能直接承诺。私有模型与混合模式均需专项验收 |
| 用户 token | `service/ai/TokenUsageService.java`、`PlatformUsageAccountant.java`、`model/entity/TokenUsage.java`（均位于 backend/src/main/java/com/checkba） | 有 userId/projectId/conversationId/model 输入输出记录；没有 usage 时跳过记录。平台金额以 OpenRouter key 累计对账，BYOK 本地估算；不宣称已有通用企业网关实账 |
| 数据库/Embedding | `backend/src/main/resources/application.yml`、`application-cloud.yml`、`application-case.yml`、`application-desktop.yml`、`config/PgVectorConfig.java` | 团队 PG、桌面 H2；pgvector/embedding 单独列依赖；不是“买了主模型自动有向量服务” |
| 文件 | `backend/src/main/java/com/checkba/storage/StorageServiceFactory.java` | 唯一实现 local；不把 S3/MinIO 宣传为现成项目文件后端。NAS 需验证 |
| Git | `deploy/case/README.md`、`version/cloud/GitHttpController.java` | 内置 JGit smart-HTTP、设备令牌与成员权限；基础协作不需额外 Git 产品。关联外部参考文件不等于替代团队仓库 |
| 身份许可 | `deploy/web/README.md`、`service/LicenseService.java` | 桌面账号/许可仍有外连；自建服务器连接、许可发放与更新源需交付确认。全离线不等同于文件在本地 |
| 平台代采 | `service/platform/ExternalProviderResolver.java` | 服务端非 local-mode 默认 BYOK，不能自动继承官方桌面平台代采 |
| OCR | `service/OcrService.java` | 现有阿里云路径，通用本地 OCR 需适配；不能用 MinerU 覆盖这一承诺 |
| 转写/TTS | `asr-service/app.py`、`service/meeting/LocalAsrClient.java`、`MeetingOssClientImpl.java`、`service/TtsService.java`、`kokoro-service/app.py` | 云听悟+OSS可选；本地 faster-whisper 为单独验证方案；TTS 为本地 Kokoro，无需默认 ElevenLabs |
| 解析 | `docker-compose.yml`、`pptx-service/backend/services/file_parser_service.py` | 扫描 PDF 经 PPTX 服务调用 MinerU；compose MinerU 8 GB 预留/16 GB 上限，仅是组件配置，非全系统容量证明 |
| 搜索/数据 | `service/ai/tools/WebTools.java`、`backend/src/main/resources/application.yml` | 博查、企查查、北大法宝、Tushare 按实际接口采购；分别核权限/额度，不计入许可费 |
| 手机中转 | `service/mobile/MobileRelayStorageConfig.java` | OSS 专用链路；本地回退不意味着移动端端点/身份已私有化 |
| 硬件/高可用 | `deploy/cloud/aiworkdeck-cloud.service`、`deploy/case/aiworkdeck-case.service`、`service/addin/PaneRegistry.java` | 既存 systemd 堆配置不代表人数压测。表中的 CPU/RAM、磁盘为规划起点；高可用/多实例需专项评估 |
| 客户端 | `deploy/cloud/README.md`、`deploy/web/README.md` | 桌面或 Office/WPS 插件 + 私有服务；不承诺纯浏览器完整工作台已可部署 |

主任务自行回读了模型分支、存储工厂、计量代码、case/cloud 部署说明与平台代采分支。其余行由同宿主 Codex 子代理只读核查；并非第二身份批准或运行时复现。

## 市场参照与优惠决策

检索日期 2026-10-13，使用厂商原始页面：

- [FastGPT 商业版](https://doc.fastgpt.io/en/guide/version/commercial)：自托管需询价；公开技术服务参考 ¥2,000–3,000/人天。托管 ¥120,000/年起含资源，与本项目客户自备资源不属于相同范围，不拿它做等价降价比较。
- [Dify 定价](https://dify.ai/pricing)：云端与自托管分别陈列；云端价格不能直接当作私有化许可价格。
- [阿里云模型定价](https://help.aliyun.com/zh/model-studio/model-pricing)：输入/输出分别按 token 计价，受模型、地区与上下文影响。因此不把某个单价写成所有模型统一采购价。

这不是市场均价调查，以下是用户授权后制定的、针对单机构单环境内部使用的优惠方案；与既有标准授权询价表并存。集中数字在 `lib/pricing.ts` 的 `DEPLOYMENT_PRICING`，不改 SaaS/支付扣款。

| 总人数上限 | 许可年费（CNY） | 标准部署一次性（CNY） |
|---|---:|---:|
| 20 | 9,800 | 6,000 |
| 50 | 19,800 | 10,000 |
| 100 | 39,800 | 16,000 |
| 200 | 49,800 | 24,000 |
| >200 | 待报价 | 待报价 |

均为未税预算、单环境现有组件；标准部署包括基础联调、一次恢复演示、一次管理员培训、30 天交付问题跟进；不含长期运维/驻场/高可用/定制开发。专项适配参考 ¥2,000/人天，不自动填假工作量。续年同范围沿用当前优惠年费测算，扩容按届时范围报价。

**收费主体必须分开**：AI WorkDeck 许可/部署/适配服务，与客户直接采购的服务器/存储/GPU/模型/数据/运维人工各自小计；首年整体投入不是给 AI WorkDeck 的订单总额。AGPLv3 路径许可计零，服务费仍单列。

## 估算算法与证据等级

- 默认 20 人，3 并发；模型每人月输入 2M、输出 0.5M，输入 ¥2/M、输出 ¥8/M。单价是可编辑预算假设，不对应供应商承诺。云比例云端 100%、混合可编辑、本地 0%。
- 基础应用资源初始预算 ¥500/月，备份/存储/流量 ¥100/月，运维人工 0 表示客户既有人员无新增现金支出；均是规划输入，不是采购报价。
- 硬件规划按人数/并发给出 4c8G、8c16G、16c32G 起点；不保证人数容量。解析增加 16 GB 规划量。磁盘 100 GB + 每人 5 GB，向上取整到 100 GB，独立备份从两倍起算。GPU 不按人数硬配。
- GPU/适配/搜索/数据/手机中转/外部 Git 默认空白，结果始终显示待询价，未知项不充作免费。填 0 是客户明确填入的“已有资源/无新增支出”。
- 本地模型、离线、外部 Git 或高规模即使填全金额仍保留技术评估提示。完全离线与云服务冲突保持可见，不默默取消用户选择。
- 解析选项只计算既有解析组件的资源规划，图像生成模型、短信/邮件与额外适配另列，最终报价前核齐。
- 清单导出包含配置、单价、假设、两类费用、首年与次年口径、待询价项、冲突、要求与人员责任。无登录、无后台提交、无服务采购动作。

## 验证记录

- `npx tsx scripts/verify-deployment-planner.mts` 通过：档位边界、首年/续年拆分、资源复用、隐藏费用剔除、未知传播、离线冲突、并发资源与手机适配。已接入官网 CI。
- `npm run typecheck`、新增 TS/TSX 的定向 ESLint、`npm run build` 均通过。
- Chromium 实际从定价页入口进入中文部署页，核对 20→21 人跨档；清空 OCR 价格保留空白并显示待询价；本地模型 + 离线 + 云 OCR 提示冲突，取消 OCR 后清除冲突但保留专项评估。
- 实际下载 Markdown 清单并读回；金额、空白项、离线冲突、服务要求与分工齐全，无 null/NaN/undefined 文本。
- 英文页 30 人快捷方案实测整体预算 ¥45,880、我方费用 ¥29,800，英文 Markdown 下载成功。
- 1440×1050 桌面与 390×844 手机截图，手机 document.scrollWidth=390，无页面横向溢出；控制台无错误。
- 同宿主 Codex 子代理复核发现“清空价格当零”和“手机适配漏计”两项 P2，已修复并复核、重跑回归通过；不称为第二身份审批。
- 客户服务器部署、供应商付费调用、GPU/并发性能均未执行；未发布官网。
