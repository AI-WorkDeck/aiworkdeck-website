/**
 * 插件包静态扫描。契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md §4。
 *
 * 做法：Java class 文件的常量池以明文 UTF-8 存放所引用的类名与方法名，
 * 因此不必反编译，直接在字节流里匹配特征串就能发现引用关系。粗糙但有效，
 * 误报可接受——**扫描结果只产出报告供人工审核参考，不做任何自动判定**。
 *
 * Web 插件（web/ 目录，见 NATIVE_PACK_DISTRIBUTION.md §11）没有常量池，
 * 扫描降级为「外联 URL / IPv4 字面量提取 + 与 network 声明交叉验证」。
 *
 * 最有价值的产出是 crossCheck()：把扫描出的实际引用与 manifest 里的
 * permissions 自述做交叉验证。声明与行为不符（例如未声明 network 却引用
 * Socket）应当驳回。这让权限声明第一次具备约束力，而不只是作者的自说自话。
 */

export type ScanSeverity = 'high' | 'medium' | 'info';

export interface ScanRule {
  key: string;
  label: string;
  severity: ScanSeverity;
  /** 命中任一特征即算命中该规则 */
  /** 字面量子串或正则；正则用于「像但不是」的场景，例如 Runtime vs RuntimeException */
  patterns: (string | RegExp)[];
  /** 该规则对应的 manifest permission；用于交叉验证 */
  impliesPermission?: string;
  why: string;
}

export const SCAN_RULES: ScanRule[] = [
  {
    key: 'process_exec',
    label: '执行本机命令',
    severity: 'high',
    // 常量池里 'java/lang/Runtime' 是 'java/lang/RuntimeException' 的前缀——按裸子串匹配
    // 会让每个 throw/catch RuntimeException 的 JAR 都爆一条 high，规则等于作废。
    // 这里匹配「后面不是 Exception」的那种（类名以 ; 或 " 之类的分隔收尾）。
    patterns: [/java\/lang\/Runtime(?!Exception)/, 'java/lang/ProcessBuilder'],
    why: '可运行任意本机命令，等同于完全控制用户机器',
  },
  {
    key: 'tls_tamper',
    label: '篡改 TLS 校验',
    severity: 'high',
    patterns: [
      'javax/net/ssl/X509TrustManager',
      'javax/net/ssl/SSLContext',
      'setDefaultSSLSocketFactory',
      'setDefaultHostnameVerifier',
    ],
    why: 'JetBrains 2026-06 恶意插件事件的关键手法：关掉证书校验后明文外传数据',
  },
  {
    key: 'reflection_bypass',
    label: '反射突破封装',
    severity: 'high',
    patterns: ['setAccessible', 'sun/misc/Unsafe', 'jdk/internal/misc/Unsafe'],
    why: '绕过访问控制读写宿主内部状态',
  },
  {
    key: 'host_internals',
    label: '访问宿主内部',
    severity: 'high',
    // com/checkba/plugin/api/ 是**给插件用的** SPI，每个 JAR 插件都必然引用它；
    // 把它一起算进来等于对所有插件恒报 high。要盯的是绕过 SPI 直接摸宿主内部那一类。
    patterns: [
      /com\/checkba\/(?!plugin\/api\/)/,
      'org/springframework/context/ApplicationContext',
      'javax/sql/DataSource',
      'ApplicationContextAware',
    ],
    why: '可直达 Spring 容器与数据库，绕过全部 service 层（AI 供应商密钥存在其中）',
  },
  {
    key: 'network',
    label: '网络访问',
    severity: 'medium',
    patterns: ['java/net/Socket', 'java/net/HttpURLConnection', 'java/net/http/HttpClient', 'okhttp3/', 'java/net/URL'],
    impliesPermission: 'network',
    why: '出站请求；须与 permissions 中的 network 声明一致',
  },
  {
    key: 'file_io',
    label: '文件读写',
    severity: 'medium',
    patterns: ['java/io/FileOutputStream', 'java/io/FileWriter', 'java/nio/file/Files', 'java/io/FileInputStream'],
    impliesPermission: 'file_read',
    why: '文件系统访问；须与 permissions 中的 file_read / file_write 声明一致',
  },
  {
    key: 'serialization',
    label: '反序列化',
    severity: 'medium',
    patterns: ['java/io/ObjectInputStream', 'readObject'],
    why: '反序列化不可信数据是远程代码执行的常见入口',
  },
  {
    key: 'native_code',
    label: '加载原生库',
    severity: 'high',
    patterns: ['loadLibrary', 'System.load', 'java/lang/foreign'],
    why: '原生代码完全脱离 JVM 的任何约束',
  },
];

/** 硬编码的 IPv4 字面量与明文 HTTP URL——固定 C2 地址的典型特征 */
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const HTTP_URL_RE = /http:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]{4,}/g;
/** Web 资源里的外联地址：明文 http 与 https 一并提取（JS 没有常量池可扫，字面量就是全部线索） */
const WEB_URL_RE = /https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]{4,}/g;

/** web/ 之下会被浏览器执行/解析的文本资源 */
function isWebAsset(name: string): boolean {
  return name.startsWith('web/') && /\.(js|mjs|html?)$/i.test(name);
}

/** 命名空间 URI、本机回环这类无信号的地址不进报告，否则真信号会被淹没 */
function isBenignUrl(url: string): boolean {
  return (
    url.startsWith('http://localhost') ||
    url.startsWith('https://localhost') ||
    url.startsWith('http://127.') ||
    url.includes('www.w3.org') ||
    url.includes('xmlns') ||
    url.includes('schemas.')
  );
}

/** 本地回环与内网段不算可疑出口 */
function isBenignAddress(ip: string): boolean {
  return (
    ip.startsWith('127.') ||
    ip.startsWith('0.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip === '255.255.255.255' ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

export interface ScanHit {
  rule: string;
  label: string;
  severity: ScanSeverity;
  why: string;
  /** 命中该规则的文件（去重后最多 20 个） */
  files: string[];
}

export interface ScanFinding {
  kind: 'hardcoded_ip' | 'plaintext_http' | 'web_external_url';
  value: string;
  file: string;
}

export interface CrossCheckIssue {
  permission: string;
  /** 'undeclared' = 代码在用但 manifest 没声明；'unused' = 声明了但没发现使用 */
  kind: 'undeclared' | 'unused';
  detail: string;
}

export interface ScanReport {
  classCount: number;
  hits: ScanHit[];
  findings: ScanFinding[];
  crossCheck: CrossCheckIssue[];
  /** 有 undeclared 交叉验证问题或 high 命中时为 true，审核界面据此高亮 */
  needsAttention: boolean;
}

export interface ScanInput {
  /** 相对包根的路径 -> 文件内容 */
  files: Map<string, Buffer>;
  /** manifest 里的 permissions 自述 */
  declaredPermissions: string[];
}

export function scanPluginPackage(input: ScanInput): ScanReport {
  const hitFiles = new Map<string, Set<string>>();
  const findings: ScanFinding[] = [];
  const seenWebLiterals = new Set<string>();
  let classCount = 0;
  let webAssetCount = 0;

  for (const [path, buf] of input.files) {
    // JAR 是 zip，内部 class 已被压缩，直接扫外层 JAR 字节意义不大；
    // 调用方负责把 JAR 内的 class 解出来后一并传进来（键形如 tool.jar!com/x/Foo.class）
    const isClass = path.endsWith('.class');
    if (isClass) classCount++;

    // Web 插件资源（NATIVE_PACK_DISTRIBUTION.md §11.3）：JS 没有常量池，
    // SCAN_RULES 那套 Java 类名特征在这里全无意义，降级为「外联地址字面量提取」。
    if (isWebAsset(path)) {
      webAssetCount++;
      scanWebAsset(path, buf.toString('utf-8'), hitFiles, findings, seenWebLiterals);
      continue;
    }

    if (!isClass && !path.endsWith('.json') && !path.endsWith('.yml') && !path.endsWith('.md')) {
      continue;
    }

    const text = buf.toString('latin1'); // 常量池是 UTF-8，latin1 逐字节映射足以做子串匹配
    for (const rule of SCAN_RULES) {
      if (rule.patterns.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text)))) {
        if (!hitFiles.has(rule.key)) hitFiles.set(rule.key, new Set());
        hitFiles.get(rule.key)!.add(path);
      }
    }

    for (const ip of text.match(IPV4_RE) || []) {
      if (!isBenignAddress(ip) && findings.length < 50) {
        findings.push({ kind: 'hardcoded_ip', value: ip, file: path });
      }
    }
    for (const url of text.match(HTTP_URL_RE) || []) {
      if (!url.startsWith('http://localhost') && !url.startsWith('http://127.') && findings.length < 50) {
        // class 常量池里 XML 命名空间 URI 极常见，排掉以免淹没真实信号
        if (!url.includes('www.w3.org') && !url.includes('xmlns') && !url.includes('schemas.')) {
          findings.push({ kind: 'plaintext_http', value: url.slice(0, 120), file: path });
        }
      }
    }
  }

  const hits: ScanHit[] = [];
  for (const rule of SCAN_RULES) {
    const files = hitFiles.get(rule.key);
    if (!files) continue;
    hits.push({
      rule: rule.key,
      label: rule.label,
      severity: rule.severity,
      why: rule.why,
      files: [...files].slice(0, 20),
    });
  }

  const crossCheck = crossCheckPermissions(hitFiles, input.declaredPermissions, {
    hasBytecode: classCount > 0,
    hasWebAssets: webAssetCount > 0,
  });
  const needsAttention =
    crossCheck.some((c) => c.kind === 'undeclared') || hits.some((h) => h.severity === 'high');

  return { classCount, hits, findings, crossCheck, needsAttention };
}

/**
 * web/ 下的 .js/.html 字面量线索：外联 URL 与 IPv4，按值去重。
 * 命中即把该文件记进 network 规则，交给 crossCheckPermissions 与 manifest 声明对账——
 * 声明缺 network 时报 undeclared（报告里的 warning），但**不自动驳回**：
 * Web 插件在桌面端是 sandbox iframe + CSP，运行时有真兜底。
 */
function scanWebAsset(
  path: string,
  text: string,
  hitFiles: Map<string, Set<string>>,
  findings: ScanFinding[],
  seen: Set<string>
) {
  const external: string[] = [];
  for (const url of text.match(WEB_URL_RE) || []) {
    if (isBenignUrl(url)) continue;
    // 字面量在源码里紧跟着引号与括号（fetch('https://x')），不剪掉的话同一个地址
    // 会因为上下文不同去重失败，报告里也难读
    external.push(url.replace(/["'()<>;,.]+$/, '').slice(0, 120));
  }
  for (const ip of text.match(IPV4_RE) || []) {
    if (!isBenignAddress(ip)) external.push(ip);
  }
  if (!external.length) return;

  if (!hitFiles.has('network')) hitFiles.set('network', new Set());
  hitFiles.get('network')!.add(path);

  for (const value of external) {
    const key = `${path}:${value}`;
    if (seen.has(key) || findings.length >= 50) continue;
    seen.add(key);
    findings.push({
      kind: value.startsWith('http') ? 'web_external_url' : 'hardcoded_ip',
      value,
      file: path,
    });
  }
}

function crossCheckPermissions(
  hitFiles: Map<string, Set<string>>,
  declared: string[],
  scanned: { hasBytecode: boolean; hasWebAssets: boolean }
): CrossCheckIssue[] {
  const issues: CrossCheckIssue[] = [];
  const declaredSet = new Set(declared);

  for (const rule of SCAN_RULES) {
    if (!rule.impliesPermission) continue;
    const used = hitFiles.has(rule.key);
    // 没有可扫的载体就没有「声明了却没用到」这个结论——纯 Web 插件没有字节码，
    // 对它报 file_read unused 只是噪音（网络例外：web 资源本身能提供出站线索）。
    const scannable =
      rule.key === 'network' ? scanned.hasBytecode || scanned.hasWebAssets : scanned.hasBytecode;
    // file_read / file_write 在字节码层面难以区分，统一按 file_read 记，
    // 声明了任意一个文件权限都算已声明
    const satisfied =
      rule.impliesPermission === 'file_read'
        ? declaredSet.has('file_read') || declaredSet.has('file_write')
        : declaredSet.has(rule.impliesPermission);

    if (used && !satisfied) {
      issues.push({
        permission: rule.impliesPermission,
        kind: 'undeclared',
        detail: `代码引用了${rule.label}相关 API，但 manifest 的 permissions 未声明「${rule.impliesPermission}」`,
      });
    } else if (!used && satisfied && scannable) {
      issues.push({
        permission: rule.impliesPermission,
        kind: 'unused',
        detail: `manifest 声明了「${rule.impliesPermission}」，但未在代码中发现对应引用`,
      });
    }
  }
  return issues;
}

const RULE_LABEL_EN: Record<string, string> = {
  执行本机命令: 'local command execution',
  '篡改 TLS 校验': 'TLS verification tampering',
  反射突破封装: 'reflection bypass',
  访问宿主内部: 'host internals access',
  网络访问: 'network access',
  文件读写: 'file I/O',
  反序列化: 'deserialization',
  加载原生库: 'native library loading',
};

export function formatCrossCheckDetail(
  issue: { permission?: string; kind: string; detail: string },
  lang: string
): string {
  if (lang === 'zh' || lang === 'zh-hant') return issue.detail;
  const undeclaredMatch = /^代码引用了(.+)相关 API，但 manifest 的 permissions 未声明「(.+)」$/.exec(issue.detail);
  if (undeclaredMatch) {
    const labelEn = RULE_LABEL_EN[undeclaredMatch[1]] ?? undeclaredMatch[1];
    return `Code references ${labelEn} APIs, but manifest permissions do not declare "${undeclaredMatch[2]}"`;
  }
  const unusedMatch = /^manifest 声明了「(.+)」，但未在代码中发现对应引用$/.exec(issue.detail);
  if (unusedMatch) {
    return `Manifest declares "${unusedMatch[1]}", but no corresponding usage was found in code`;
  }
  if (issue.kind === 'undeclared' && issue.permission) {
    return `Code references APIs requiring "${issue.permission}", which is not declared in manifest permissions`;
  }
  return issue.detail;
}
