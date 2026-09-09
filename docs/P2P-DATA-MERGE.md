# StudyFlow P2P 数据合并与 QR 同步 — 技术说明

> 版本：v3.21 · 更新日期：2026-09-09
> 适用范围：`build/share/index.html`（P2P 合并引擎 + 平台门控 + 摄像头前置检查），本文档面向开发与维护者。

***

## 1. 功能定位与平台矩阵

QR P2P 同步是**双设备均离线**场景下的兜底同步通道：两台设备通过屏幕上的二维码直接交换加密数据包，不经过服务器。它与云端双模同步（在线自动同步 + 离线缓存上传）互补，共同构成完整的数据链路。

| 平台                     | QR 生成 | QR 扫码 | 说明             |
| ---------------------- | :---: | :---: | -------------- |
| 手机端（竖屏）                |   ✅   |   ✅   | 底部菜单 QR 标签页    |
| 平板端（横屏）                |   ✅   |   ✅   | 左侧菜单 QR Sync 项 |
| 桌面端（Electron / PC 浏览器） |   ❌   |   ❌   | 入口隐藏，仅使用云端同步   |

### 1.1 桌面端移除扫码的实现（平台门控）

桌面端没有摄像头，扫码无法成立；而"只生成不扫描"会造成单向数据流（对端合并后本端收不到回传），因此桌面端整体移除 QR 入口，统一走云端同步。

判定函数 `isDesktopDevice()`（index.html）：

```js
function isDesktopDevice() {
  // Electron 桌面版：preload 注入的桥接对象一定存在
  if (typeof window !== 'undefined' && window._ftDesktop) return true;
  // 无触摸环境（典型 PC：鼠标 + 键盘、无摄像头）
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const touchPoints = navigator.maxTouchPoints || 0;
  return !coarsePointer && touchPoints === 0;
}
```

判定优先级：

1. **Electron 桥接**（`window._ftDesktop`，由 `desktop-electron/preload.js` 注入）——桌面版打包环境最可靠的信号，即使跑在带触摸屏的笔记本上也算桌面端；
2. **触摸能力检测**——`pointer: coarse`（粗指针 = 触屏主输入）或 `maxTouchPoints > 0` 任一成立即视为手机/平板。

门控生效点（三处，缺一不可）：

| 生效点     | 位置                                  | 行为                                                                 |
| ------- | ----------------------------------- | ------------------------------------------------------------------ |
| 菜单入口    | `applyPlatformGating()` 在 INIT 时调用  | 桌面端将左侧菜单 `#navQrItem` 设为 `display:none`                            |
| 视图守卫    | `switchView('qr')` 开头               | 桌面端重定向到 `sync` 视图并提示 "QR sync is available on phone & tablet only" |
| 手机端不受影响 | 底部菜单栏 `.bottom-tab[data-view="qr"]` | 仅在手机竖屏布局渲染，无门控逻辑                                                   |

***

## 2. QR 数据包格式

### 2.1 载体格式

```
STUDY2:<ivBase64>.<cipherTextBase64>   ← 标准格式（Web Crypto 可用时）
STUDY1:<base64(JSON(payload))>         ← 兼容格式（非安全上下文降级，明文 + 密钥哈希校验）
```

`STUDY1:` 仅为在不支持 `crypto.subtle` 的环境（如 plain-HTTP 非 localhost）下的降级，payload 内带 `kh`（同步密钥的简单哈希）供对端校验密钥一致性。

### 2.2 Payload 结构（v3）

```jsonc
{
  "v": 3,                          // 载荷版本
  "did": "QD6K-AVB9",              // 来源设备 ID
  "ts": 1788770764000,             // 生成时间戳（毫秒）
  "sessions": [                    // 本机全部学习记录（本地格式）
    {
      "id": "s_1788770764_a1b2",   // 全局唯一 ID（创建时间 + 随机后缀）
      "type": "work",              // work | break
      "duration": 25,              // 分钟
      "subject": "Math",           // 科目（≤200 字符）
      "date": "2026-09-06",        // 本地日期（热力图聚合键）
      "completedAt": "2026-09-06T10:25:00.000Z",
      "updated_at": "2026-09-06T10:25:00.000Z",  // LWW 冲突锚点
      "completed": true            // false = 中断的部分会话
    }
  ],
  "tombstones": {                  // v3 新增：删除墓碑
    "s_1788123456_c3d4": "2026-09-05T20:00:00.000Z"   // id -> 删除时刻
  }
}
```

> v1/v2 旧载荷（无 `tombstones`、会话可能无 `updated_at`）仍可正常导入，合并引擎对缺失字段有回退逻辑（见 §3.1）。

### 2.3 加密

- **算法**：AES-256-GCM（Web Crypto API）

- **密钥派生**：PBKDF2-SHA256，100,000 轮迭代，固定盐 `studyflow-p2p-salt`

- **IV**：每次导出随机生成 12 字节，随密文一起 Base64 编码

- 两台设备必须在 Sync 页设置**相同的同步密钥**才能互解；密钥错误时 GCM 认证失败，导入直接报错，不会产出损坏数据。

***

## 3. 数据合并引擎

核心函数：`mergeRemoteSessions(remoteSessions, remoteTombstones)`（index.html）。任何一次扫码导入都经过以下流水线：

```
扫码得到 STUDY2/STUDY1 载荷
   │
   ├─ 解密/解码 → payload
   ├─ 结构校验（sessions 必须为数组，≤ 20000 条）
   ├─ 合并前备份（backupBeforeP2PMerge）
   ▼
┌─────────────── mergeRemoteSessions �───────────────┐
│ pass 1  逐条清洗（sanitizeP2PSession）+ LWW 合并    │
│ pass 2  应用远端墓碑（删除本地行）                    │
│ pass 3  收养远端墓碑到本地注册表                     │
│ pass 4  变更行扇出到云端上传队列                      │
└───────────────────────────────────────────────────┘
   │
   ├─ 有变更 → 排序 + saveData + 重渲染
   └─ Toast 汇总（added / updated / removed / skipped）
```

### 3.1 数据清洗（sanitizeP2PSession）

导入的每条记录先规范化，**非法记录直接丢弃并计数**，不会进入本地数据集：

| 校验项         | 规则                                                 |
| ----------- | -------------------------------------------------- |
| id          | 必须是非空字符串，≤64 字符                                    |
| type        | 仅接受 `work` / `break`，其余归一为 `work`                  |
| duration    | 数值化、四舍五入，钳制到 \[0, 1440] 分钟                         |
| 完成时间        | `completedAt` 或 `completed_at`（云端格式）任一，非法日期整体丢弃    |
| 幻影行         | 已完成且时长为 0 的 work 会话直接丢弃（`completed:false` 的部分会话保留） |
| subject     | 截断到 200 字符                                         |
| updated\_at | 缺失时回退为 `completedAt`（旧格式数据兼容）                      |

### 3.2 LWW 冲突解决（Last-Write-Wins）

同一条记录（相同 `id`）在两端都存在时，以 `updated_at`（ISO 字符串字典序比较，等价于时间序）决胜：

- 远端 `updated_at` **>** 本地 → 本地被覆盖（`updated`）

- 远端 `updated_at` **≤** 本地 → 丢弃远端（`skipped`）

- 本地不存在 → 插入（`added`）

新会话在创建时（番茄钟完成、部分会话保存）即打上 `updated_at` 时间戳，保证任意两端的比较粒度一致。

### 3.3 墓碑与删除传播（v3 核心增强）

**问题**：旧实现只做"不存在才添加"，若设备 A 删除了一条记录、随后与设备 B 做 P2P 同步，B 会把这条"僵尸记录"重新灌回 A —— 删除被撤销。

**方案**：本地维护墓碑注册表 `localStorage.studyflow_tombstones_v1`（`{ id: 删除时刻 }`，90 天自动清理）：

1. **写入**：`deleteSession()` 删除本地记录时，同时写入墓碑（时间取记录的 `updated_at` 或当前时刻）；
2. **导出**：`generateExportCode()` 的 payload v3 携带 `tombstones`；
3. **导入**（三层防护）：

   - **远端墓碑 vs 本地行**：墓碑时间晚于本地行的 `updated_at` → 删除本地行；

   - **本地墓碑 vs 远端行**：本地墓碑时间晚于远端行的 `updated_at` → 跳过该行（**防止复活**）；

   - **载荷内自洽**：远端墓碑晚于载荷内同 id 行的 `updated_at` → 该行是过期快照，跳过；
4. **收养**：远端墓碑合并进本地注册表（取较新时刻），随下次导出继续向下游传播。

> 若一条记录在删除之后又被重新产生（`updated_at` 晚于墓碑时刻，例如云端恢复场景），新记录正常合并——墓碑只拦截"比删除更旧"的数据。

### 3.4 云端队列联动（P2P → 云 扇出）

P2P 合并产生的**变更行**（新增/更新）会立即通过 `markSessionDirty()` 进入云端上传队列（`studyflow_sync_queue_v3:用户名`）。这样：

- 离线两台设备互相同步后，任一台恢复网络都会把合并结果推上云端；

- 云端 LWW 与 P2P LWW 使用同一套 `updated_at` 语义，三方（本机 / 对端 / 云）最终收敛一致。

注意：P2P 合并对删除行不扇出到云端队列——删除的云端传播由 `deleteSession()` 本身的墓碑入队完成，P2P 只负责把"对端的删除"落到本地。

### 3.5 合并前备份

每次导入执行前，`backupBeforeP2PMerge()` 将当前数据集快照写入 `localStorage.studyflow_p2p_backup_v1`（滚动保留一份）。若合并结果异常，可通过控制台手动恢复：

```js
// 回滚最近一次 P2P 合并（在应用控制台执行）
const b = JSON.parse(localStorage.getItem('studyflow_p2p_backup_v1'));
appData.sessions = b.sessions;
saveData(appData);
renderAll();
```

### 3.6 幂等与上限

- **幂等**：重复扫描同一张二维码 = 全部 `skipped`，提示 "already up to date"，无副作用；

- **上限**：载荷 > 20000 条记录直接拒绝（"Sync code too large"），防止构造恶意超大二维码拖垮浏览器。

***

## 4. 交互流程（手机/平板）

1. 两台设备在 **Sync** 页设置相同的 Sync Key；
2. 设备 A 进入 **QR Sync → Generate QR**，生成加密二维码；
3. 设备 B 进入 **QR Sync → Scan QR**，摄像头扫码（jsQR 解析）；
4. 扫码成功自动触发 `importSyncCode()` → 解密 → 清洗 → 合并 → 渲染，Toast 输出汇总：
   `Merged from <设备ID>: +3 added, 1 updated, -1 removed`；
5. A、B 互换角色重复一次即可完成双向同步（每次合并只传输"生成端"的数据集）。

### 4.1 摄像头前置条件（v3.21 新增）

扫码依赖 `getUserMedia`，它有三个硬性前提，任缺其一摄像头都不会启动：

| 前提                 | 说明                                                                                                 | 缺失时的表现                                             |
| ------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **安全上下文**          | 必须是 HTTPS、`localhost` 或 `file://`。手机通过 `http://192.168.x.x:3000` 访问属于非安全上下文            | `navigator.mediaDevices` 为 `undefined`，旧版直接抛 TypeError |
| **Android 运行时权限**  | Android 6+（minSdk 24）光在 `AndroidManifest.xml` 声明 `CAMERA` **不够**，还必须在运行时向用户申请                 | `NotAllowedError`，且**系统不弹任何权限框** —— 表现为"点了没反应"      |
| **WebView 授权**     | Cordova 的 `SystemWebChromeClient` 需放行 `onPermissionRequest`（`config.xml` 已 `allow-navigation="*"`） | `NotAllowedError`                                   |

**历史缺陷**：v3.20 及之前，Cordova 工程（`build/android-cordova/package.json`）的 `plugins` 为空 —— 从未引入任何权限插件，因此**运行时权限永远没人申请**，`getUserMedia` 在 APK 上必然瞬间失败。这正是"手机和平板点击扫码没反应"的根因。

**修复措施**（`ensureCameraReady()`，位于 `startQrCamera()` 之前）：

1. **能力探测** —— `navigator.mediaDevices` 不存在时，按 `window.isSecureContext` 给出不同提示（非安全上下文提示"需要 HTTPS"）；
2. **主动申请运行时权限** —— 检测到 `cordova-plugin-android-permissions` 时，先 `checkPermission`，未授权则 `requestPermission`，成功后才调用 `getUserMedia`；
3. **错误可读化** —— `describeCameraError()` 把 `NotAllowedError` / `NotFoundError` / `NotReadableError` 等映射为具体中文可行动文案，不再抛原始 TypeError；
4. **兜底通道** —— 扫码失败时在扫描面板内渲染错误说明 + "Paste sync code instead" 按钮，一键跳到 Sync 页粘贴同步码（P2P 同步不依赖摄像头也能完成）；
5. **清理僵尸状态** —— `startQrScanner()` 启动前先 `stopQrCamera()`，避免 `qrScanning` 卡在 `true` 导致 `startQrCamera()` 静默返回 `false`；
6. **播放兜底** —— `video.play()` 的 Promise 显式 catch，并在 1.5s 后补一次 kick，防止部分 WebView 不触发 `loadedmetadata` 而卡在 "Scanning"。

**重新打包时必须执行**：

```bash
cd build/android-cordova
npm run plugins:restore   # 安装 cordova-plugin-android-permissions
npm run build:apk
```

### 4.2 手动兜底（无摄像头也能同步）

扫描不可用时，仍可完成 P2P 同步：

1. 设备 A：**QR Sync → Generate QR**，或 Sync 页复制同步码；
2. 设备 B：Sync 页粘贴到 `Import` 文本框 → `Import`；
3. 合并引擎与扫码路径完全相同，行为一致。

***

## 5. 关键存储键一览

| localStorage 键                   | 作用               |   账号隔离   |
| -------------------------------- | ---------------- | :------: |
| `study_tracker_data_v1:<user>`   | 本账号学习记录          |     ✅    |
| `studyflow_sync_queue_v3:<user>` | 云端上传队列           |     ✅    |
| `studyflow_last_sync_v3:<user>`  | 增量拉取游标           |     ✅    |
| `studyflow_tombstones_v1`        | P2P 删除墓碑注册表（设备级） | ❌（设备级语义） |
| `studyflow_p2p_backup_v1`        | 合并前滚动备份（设备级）     |     ❌    |
| `study_tracker_sync_key`         | P2P 同步密钥（设备级）    |     ❌    |

***

## 6. 测试记录（2026-09-07，2026-09-09 补充）

- **单元测试**：合并引擎 28/28 通过，覆盖数据清洗（11 项）、新增/LWW 覆盖/过期跳过、远端墓碑删除、本地墓碑防复活、载荷内自洽、非法行计数、空载荷幂等、A↔B 全链路模拟（含云端队列扇出验证）；

- **浏览器 E2E**：桌面视口 6/6 通过——`isDesktopDevice()` 返回 `true`、菜单无 QR Sync 项、`navQrItem` 存在但隐藏、`switchView('qr')` 重定向至 Sync 页并提示、控制台无报错；

- **回归**：手机端底部 QR 标签不受影响（门控仅作用于桌面判定路径）；

- **2026-09-09 补充（移动视口 CDP 实测）**：补做了手机视口（412×915、`pointer: coarse`、`maxTouchPoints: 5`）的端到端验证，覆盖四种摄像头场景——

  | 场景                      | 修复前                                                    | 修复后                                        |
  | ----------------------- | ------------------------------------------------------ | ------------------------------------------ |
  | 摄像头可用                   | 正常                                                      | 正常（`getUserMedia` 调用 1 次，视频 `readyState=4`） |
  | 权限被拒 `NotAllowedError` | 提示 `Camera access denied: Permission denied`            | "Camera permission denied — 请在系统设置中授权后重试"  |
  | 无摄像头 `NotFoundError`   | 提示 `Camera access denied: Requested device not found`   | "No usable camera found on this device."    |
  | 非安全上下文（无 `mediaDevices`） | 提示 `Cannot read properties of undefined (reading 'getUserMedia')` | "Camera needs HTTPS (or localhost)." + 粘贴兜底按钮 |

  四种场景均不再抛未捕获异常，失败时 Start 按钮恢复可点，兜底按钮可正常渲染。

> ⚠️ 原测试记录只覆盖了**桌面视口**，移动端"不受影响"属于推断而非实测 —— 摄像头缺陷正是由此漏网。移动链路必须真机或移动视口验证。

***

## 7. 已知边界与后续方向

- 触摸屏笔记本上用浏览器访问会被判定为"平板"而显示 QR 入口（属可接受误差；Electron 桌面版因桥接对象存在，判定始终正确）；

- P2P 一次只传输生成端的**全量**数据集，超大数据量（数千条记录）会使二维码非常密集，建议先做云端同步再用 P2P 兜底；

- 墓碑注册表保留 90 天，超期清理后，极端情况下（90 天未同步的对端）仍可能回灌已删除数据——云端同步会再次纠正。

